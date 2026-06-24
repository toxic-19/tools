"""「感知-思考-行动」主循环。

感知(perceive):捕获医生指令 + RAG 召回作为上下文
思考(think):    LLM 决策下一步行动(调用哪个工具 / 给出最终答案)
行动(act):      分发到 MCP 工具 / Mock 微服务 / 沙箱执行
汇总(summarize):合并多次行动结果,产出最终答案

整个循环最多执行 AGENT_MAX_STEPS 步,任意时刻 LLM 返回 is_final 即终止。
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, Dict, List, Optional

from .llm import LLMClient, LLMResponse
from .tools import ToolRegistry, get_default_registry

logger = logging.getLogger(__name__)


# ============================================================
# 数据结构
# ============================================================

@dataclass
class TraceEvent:
    """单步 trace,前端流式展示。"""
    phase: str            # "perceive" / "think" / "act" / "observe" / "final" / "error"
    step: int = 0         # 第几步(从 0 开始)
    content: Any = None
    tool_name: Optional[str] = None
    tool_args: Optional[Dict[str, Any]] = None
    tool_result: Optional[Dict[str, Any]] = None
    elapsed_ms: float = 0.0
    message: Optional[str] = None
    ts: float = field(default_factory=time.time)


@dataclass
class AgentResult:
    answer: str
    trace: List[TraceEvent] = field(default_factory=list)
    tool_calls_count: int = 0
    total_elapsed_ms: float = 0.0
    error: Optional[str] = None


# ============================================================
# System Prompt
# ============================================================

SYSTEM_PROMPT = """你是一名 AI 智能体,负责在医疗 AI 平台上辅助临床医生。
你的核心职责:

1. **感知阶段**:你已收到医生指令,并在 system 中以 [RAG 上下文] 形式提供了相关知识库文档。
2. **思考阶段**:拆解任务,决定调用哪些工具来获取信息。
3. **行动阶段**:每次只调一个工具,等结果回来再决定下一步。
4. **汇总阶段**:收集到足够信息后,直接给出结构化、引用清晰的最终答案。

**规则**:
- 工具调用的参数必须是合法的 JSON,符合每个工具的 schema 描述。
- 至少调用 2 个不同的工具,完成跨数据源的交叉验证。
- 引用来源时用 [来源 N] 形式标注。
- 如果工具返回错误,换一个工具或调整参数再试;不要反复调同一个工具失败。
- 收集到足够信息时,直接输出「Final Answer: <答案>」作为最终回复,不要再调工具。
"""


# ============================================================
# Agent Loop
# ============================================================

class AgentLoop:
    def __init__(
        self,
        registry: Optional[ToolRegistry] = None,
        llm: Optional[LLMClient] = None,
        max_steps: Optional[int] = None,
        rag_topk: Optional[int] = None,
    ):
        self.registry = registry or get_default_registry()
        self.llm = llm or LLMClient()
        self.max_steps = int(
            max_steps if max_steps is not None
            else os.environ.get("AGENT_MAX_STEPS", "8")
        )
        self.rag_topk = int(
            rag_topk if rag_topk is not None
            else os.environ.get("AGENT_RAG_TOPK", "3")
        )

    # ============================================================
    # 流式入口(给 Agent Hub SSE 用)
    # ============================================================

    async def _run_async(self, instruction: str):
        """真正的异步流式生成器 —— 每步 await tools。

        被 FastAPI SSE endpoint 直接 async for 消费。
        """
        t_start = time.perf_counter()

        # 1. 感知(异步:RAG 召回走 MCP)
        ev_perceive = await self._perceive_async(instruction)
        yield ev_perceive

        # 构造消息历史
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "system", "content": f"[RAG 上下文]\n{ev_perceive.content.get('rag_context_text', '')}"},
            {"role": "user", "content": instruction},
        ]

        tools = await self.registry.list_tools()
        tool_calls_count = 0

        for step in range(self.max_steps):
            # 2. 思考(同步 LLM 调用)
            think_event = self._think(messages, tools, step)
            yield think_event

            if think_event.content.get("is_final"):
                final = TraceEvent(
                    phase="final",
                    step=step,
                    content={"answer": think_event.content.get("content", "")},
                    elapsed_ms=time.perf_counter() - t_start,
                    message=f"在 {step + 1} 步内完成,共调用 {tool_calls_count} 个工具",
                )
                yield final
                return

            # 3. 行动(异步)
            tool_name = think_event.content.get("tool_name")
            tool_args = think_event.content.get("tool_args", {})
            act_event = await self._act_async(tool_name, tool_args, step)
            yield act_event
            tool_calls_count += 1

            # 4. 写回消息历史
            tc_id = think_event.content.get("tool_call_id")
            tool_msg = {
                "role": "tool",
                "tool_call_id": tc_id or f"call_{step}",
                "content": json.dumps(act_event.content.get("result", {}), ensure_ascii=False, default=str)[:4000],
            }
            messages.append(tool_msg)

        # 超步数
        yield TraceEvent(
            phase="error",
            step=self.max_steps,
            content={"error": f"超出最大步数 {self.max_steps}"},
            elapsed_ms=time.perf_counter() - t_start,
            message="Agent 循环被强制终止",
        )

    async def run_async(self, instruction: str) -> AgentResult:
        """异步版 run()。收集所有事件,返回 AgentResult。"""
        events = []
        async for ev in self._run_async(instruction):
            events.append(ev)
        final = next((e for e in events if e.phase == "final"), None)
        error = next((e for e in reversed(events) if e.phase == "error"), None)
        if final:
            answer = final.content.get("answer", "")
        elif error:
            answer = f"[Agent 失败] {error.content.get('error', '未知错误')}"
        else:
            answer = "[Agent 未产出最终答案]"
        tool_calls = sum(1 for e in events if e.phase == "act")
        total_ms = (events[-1].elapsed_ms if events else 0.0)
        return AgentResult(
            answer=answer,
            trace=events,
            tool_calls_count=tool_calls,
            total_elapsed_ms=total_ms,
            error=error.content.get("error") if error else None,
        )

    # 兼容旧接口(单测 / 同步场景)
    def run(self, instruction: str) -> AgentResult:
        return asyncio.run(self.run_async(instruction))

    # ============================================================
    # 感知 / 思考 / 行动
    # ============================================================

    def _perceive(self, instruction: str) -> TraceEvent:
        """感知:同步版本(单测 / 不用 MCP 时用)。"""
        t0 = time.perf_counter()
        rag_text = ""
        try:
            res = self.registry.call("rag_search", {"question": instruction, "top_k": self.rag_topk})
            rag_text = self._format_rag_hits(res)
        except Exception as e:
            rag_text = f"(RAG 调用异常: {e})"
        return self._make_perceive_event(instruction, rag_text, t0)

    async def _perceive_async(self, instruction: str) -> TraceEvent:
        """感知:异步版本(FastAPI event loop 用)。"""
        t0 = time.perf_counter()
        rag_text = ""
        try:
            res = await self.registry.call_async("rag_search", {"question": instruction, "top_k": self.rag_topk})
            rag_text = self._format_rag_hits(res)
        except Exception as e:
            rag_text = f"(RAG 调用异常: {e})"
        return self._make_perceive_event(instruction, rag_text, t0)

    def _format_rag_hits(self, res) -> str:
        if res.ok and isinstance(res.value, dict):
            hits = res.value.get("hits", [])
            parts = []
            for i, h in enumerate(hits, 1):
                src = h.get("filename", "")
                if h.get("page_number"):
                    src += f" 第{h['page_number']}页"
                snippet = h.get("text", "")[:500]
                parts.append(f"[来源 {i}] {src}\n{snippet}")
            return "\n\n".join(parts) if parts else "(未召回相关文档)"
        return f"(RAG 召回失败: {res.error})"

    def _make_perceive_event(self, instruction: str, rag_text: str, t0: float) -> TraceEvent:
        return TraceEvent(
            phase="perceive",
            step=0,
            content={
                "instruction": instruction,
                "rag_context_text": rag_text,
            },
            elapsed_ms=(time.perf_counter() - t0) * 1000,
            message=f"已感知指令,RAG 召回 {self.rag_topk} 条相关文档",
        )

    def _think(
        self,
        messages: List[Dict[str, str]],
        tools: List[Dict[str, Any]],
        step: int,
    ) -> TraceEvent:
        """思考:LLM 决策下一步。"""
        t0 = time.perf_counter()
        resp: LLMResponse = self.llm.chat(messages, tools=tools, tool_choice="auto")
        elapsed = (time.perf_counter() - t0) * 1000

        if resp.error:
            return TraceEvent(
                phase="error",
                step=step,
                content={"error": resp.error},
                elapsed_ms=elapsed,
                message="LLM 思考失败",
            )

        if resp.tool_calls:
            tc = resp.tool_calls[0]  # 一次只执行一个工具,降低复杂度
            return TraceEvent(
                phase="think",
                step=step,
                content={
                    "is_final": False,
                    "content": resp.content,
                    "tool_name": tc["name"],
                    "tool_args": tc["arguments"],
                    "tool_call_id": tc.get("id"),
                },
                tool_name=tc["name"],
                tool_args=tc["arguments"],
                elapsed_ms=elapsed,
                message=f"决定调用工具: {tc['name']}",
            )
        else:
            # LLM 直接给答案(没有 tool_calls)
            return TraceEvent(
                phase="think",
                step=step,
                content={
                    "is_final": True,
                    "content": resp.content,
                },
                elapsed_ms=elapsed,
                message="LLM 决定给出最终答案",
            )

    def _act(self, tool_name: str, tool_args: Dict[str, Any], step: int) -> TraceEvent:
        """行动:同步版本(单测 / 不用 MCP 时)。"""
        t0 = time.perf_counter()
        try:
            res = self.registry.call(tool_name, tool_args or {})
        except Exception as e:
            return self._make_act_event(tool_name, tool_args, None, str(e), t0, step)
        return self._make_act_event(tool_name, tool_args, res, None, t0, step)

    async def _act_async(self, tool_name: str, tool_args: Dict[str, Any], step: int) -> TraceEvent:
        """行动:异步版本(FastAPI event loop 用)。"""
        t0 = time.perf_counter()
        try:
            res = await self.registry.call_async(tool_name, tool_args or {})
        except Exception as e:
            return self._make_act_event(tool_name, tool_args, None, str(e), t0, step)
        return self._make_act_event(tool_name, tool_args, res, None, t0, step)

    def _make_act_event(self, tool_name, tool_args, res, err, t0, step):
        elapsed = (time.perf_counter() - t0) * 1000
        if err is not None:
            return TraceEvent(
                phase="observe",
                step=step,
                content={"result": {"error": err}},
                tool_name=tool_name,
                elapsed_ms=elapsed,
                message=f"工具 {tool_name} 抛出异常",
            )
        value = res.value
        display_value = _truncate_for_display(value, max_chars=2000)
        return TraceEvent(
            phase="act",
            step=step,
            content={"result": value},
            tool_name=tool_name,
            tool_args=tool_args,
            tool_result={"ok": res.ok, "value": display_value, "error": res.error},
            elapsed_ms=elapsed,
            message=f"工具 {tool_name} 返回: {'成功' if res.ok else '失败'}",
        )


def _truncate_for_display(value: Any, max_chars: int = 2000) -> Any:
    """把工具返回值截断成适合前端展示的形态。"""
    if value is None:
        return None
    if isinstance(value, str):
        return value[:max_chars] + ("..." if len(value) > max_chars else "")
    if isinstance(value, dict):
        s = json.dumps(value, ensure_ascii=False, default=str)
        return s[:max_chars] + ("..." if len(s) > max_chars else "")
    return str(value)[:max_chars]


# ============================================================
# 便捷入口
# ============================================================

def run_agent(instruction: str) -> AgentResult:
    """一次性同步跑 Agent。"""
    loop = AgentLoop()
    return loop.run(instruction)


def stream_agent(instruction: str) -> AgentLoop:
    """返回 AgentLoop 实例,调用方消费 run_stream。"""
    return AgentLoop()
