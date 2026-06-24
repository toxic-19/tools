"""Agent Hub FastAPI 服务。

启动:uv run run_agent.py
默认 :8100,可通过 .env AGENT_HOST / AGENT_PORT 调整。

路由:
  POST /api/agent/chat              同步:返回最终结果 + 完整 trace
  POST /api/agent/chat/stream       流式:SSE,逐步推送每个 trace 事件
  GET  /api/agent/tools             列出可用工具(给前端)
  GET  /api/agent/health            健康检查(MCP / Mock / 沙箱)
  POST /api/agent/sandbox/run       直接调沙箱(单测用)

CORS: 全部放通(同 RAG server)。生产环境可收紧。

也可以作为子模块挂载到 RAG server(rag_demo.server:app),
避免前端需要同时连 :8000 和 :8100:
    from agent.server import router as agent_router
    app.include_router(agent_router)
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, AsyncGenerator, Dict, List, Optional

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .loop import AgentLoop, TraceEvent
from .tools import ToolRegistry, get_default_registry
from .sandbox import get_default_sandbox

logger = logging.getLogger("agent.server")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")

# 用 APIRouter 而不是 FastAPI app,方便挂到 RAG server
router = APIRouter(prefix="/api/agent", tags=["Agent Hub"])

# 懒加载 registry(第一次请求时连接 MCP Server)
_registry: Optional[ToolRegistry] = None
_registry_lock = asyncio.Lock()


async def get_registry() -> ToolRegistry:
    global _registry
    if _registry is None:
        async with _registry_lock:
            if _registry is None:
                _registry = get_default_registry()
                try:
                    await _registry.connect()
                except Exception as e:
                    logger.warning(f"Agent Hub 启动时 MCP 不可达: {e}")
    return _registry


# ============================================================
# Pydantic 模型
# ============================================================

class ChatRequest(BaseModel):
    instruction: str
    # 可选:覆盖默认 max_steps / rag_topk
    max_steps: Optional[int] = None
    rag_topk: Optional[int] = None


class TraceEventDTO(BaseModel):
    phase: str
    step: int
    content: Optional[Dict[str, Any]] = None
    tool_name: Optional[str] = None
    tool_args: Optional[Dict[str, Any]] = None
    tool_result: Optional[Dict[str, Any]] = None
    elapsed_ms: float = 0.0
    message: Optional[str] = None
    ts: float = 0.0


class ChatResponse(BaseModel):
    answer: str
    tool_calls_count: int
    total_elapsed_ms: float
    trace: List[TraceEventDTO]
    error: Optional[str] = None


class SandboxRequest(BaseModel):
    code: str
    timeout_ms: Optional[int] = None


# ============================================================
# 路由
# ============================================================

@router.get("/health")
async def health():
    """健康检查:返回 MCP / Mock / 沙箱 三块的可用性。"""
    try:
        reg = await get_registry()
        h = await reg.health()
        return {
            "status": "ok",
            "agent": {
                "max_steps": int(os.environ.get("AGENT_MAX_STEPS", "8")),
                "rag_topk": int(os.environ.get("AGENT_RAG_TOPK", "3")),
            },
            **h,
        }
    except Exception as e:
        return {"status": "degraded", "error": str(e)}


@router.get("/tools")
async def list_tools():
    """列出 Agent 可用的所有工具(MCP / Mock / 沙箱)。"""
    try:
        reg = await get_registry()
        tools = await reg.list_tools_summary()
        return {"tools": tools, "total": len(tools)}
    except Exception as e:
        raise HTTPException(500, f"获取工具列表失败: {e}")


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """同步:跑一次 Agent,返回最终结果 + 完整 trace。"""
    if not req.instruction.strip():
        raise HTTPException(400, "instruction 不能为空")
    try:
        reg = await get_registry()
        loop = AgentLoop(registry=reg)
        if req.max_steps:
            loop.max_steps = req.max_steps
        if req.rag_topk:
            loop.rag_topk = req.rag_topk
        result = await loop.run_async(req.instruction)
        return ChatResponse(
            answer=result.answer,
            tool_calls_count=result.tool_calls_count,
            total_elapsed_ms=result.total_elapsed_ms,
            trace=[_event_to_dto(e) for e in result.trace],
            error=result.error,
        )
    except Exception as e:
        logger.exception("agent chat failed")
        raise HTTPException(500, f"Agent 失败: {e}")


@router.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    """流式:逐步推送 trace 事件(SSE)。"""
    if not req.instruction.strip():
        raise HTTPException(400, "instruction 不能为空")

    async def event_gen():
        reg = await get_registry()
        loop = AgentLoop(registry=reg)
        if req.max_steps:
            loop.max_steps = req.max_steps
        if req.rag_topk:
            loop.rag_topk = req.rag_topk

        # 异步迭代 _run_async(它每步 await tools)
        agen = loop._run_async(req.instruction)
        try:
            async for ev in agen:
                dto = _event_to_dto(ev)
                yield f"data: {json.dumps(dto.dict(), ensure_ascii=False, default=str)}\n\n"
        except Exception as e:
            logger.exception("stream failed")
            err_ev = TraceEvent(phase="error", step=-1, content={"error": str(e)},
                                message="stream 内部异常")
            dto = _event_to_dto(err_ev)
            yield f"data: {json.dumps(dto.dict(), ensure_ascii=False, default=str)}\n\n"
        finally:
            await agen.aclose()
        yield "data: [DONE]\n\n"

    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/sandbox/run")
async def sandbox_run(req: SandboxRequest):
    """直接调沙箱(单测沙箱本身用)。"""
    sb = get_default_sandbox()
    if req.timeout_ms:
        sb.timeout_ms = req.timeout_ms
    r = sb.run_python(req.code)
    return {
        "ok": r.ok,
        "stdout": r.stdout,
        "value": r.value,
        "error": r.error,
        "elapsed_ms": r.elapsed_ms,
        "timed_out": r.timed_out,
    }


# ============================================================
# 辅助
# ============================================================

def _event_to_dto(e: TraceEvent) -> TraceEventDTO:
    return TraceEventDTO(
        phase=e.phase,
        step=e.step,
        content=e.content,
        tool_name=e.tool_name,
        tool_args=e.tool_args,
        tool_result=e.tool_result,
        elapsed_ms=e.elapsed_ms,
        message=e.message,
        ts=e.ts,
    )


# ============================================================
# 启动入口(独立 :8100 模式)
# ============================================================

# 独立运行时的 FastAPI app(挂在 :8100)
app = FastAPI(
    title="AI 智能体能力支撑平台 (Agent Hub)",
    description="感知-思考-行动循环,基于 RAG-MCP + Mock 微服务 + 安全沙箱",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


def main():
    import uvicorn
    host = os.environ.get("AGENT_HOST", "0.0.0.0")
    port = int(os.environ.get("AGENT_PORT", "8100"))
    print("=" * 60)
    print("  AI 智能体能力支撑平台 (Agent Hub) 启动中 ...")
    print(f"  Listen:    {host}:{port}")
    print(f"  API 文档:   http://{host}:{port}/docs")
    print("=" * 60)
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    main()
