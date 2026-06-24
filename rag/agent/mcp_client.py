"""通用 MCP 客户端(连接到 RAG MCP Server)。

提供:
  - list_tools():拿到 MCP Server 注册的所有工具
  - call_tool(name, arguments):调用工具,返回 dict
  - close():关闭连接

内部基于官方 mcp.client.streamable_http 客户端。

异步实现:FastAPI/uvicorn 本身在 asyncio loop 里跑,所以 MCP 客户端也走 async。
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class ToolDescriptor:
    """统一的工具描述(给 Agent / LLM 用)。"""
    name: str
    description: str
    input_schema: Dict[str, Any]
    # 元信息:工具类型(mcp / sandbox / mock_microservice)
    kind: str = "mcp"
    # 元信息:实现细节(sandbox / http / mock)
    backend: str = ""


@dataclass
class ToolCallResult:
    ok: bool
    value: Any = None
    error: Optional[str] = None
    raw: Any = None


class MCPClient:
    """单个 MCP Server 的异步客户端封装。"""

    def __init__(self, url: str, name: str = "mcp-server"):
        self.url = url
        self.name = name
        self._session = None
        self._cm = None
        self._connected = False
        self._connect_lock = asyncio.Lock()

    # ============================================================
    # 连接管理(异步)
    # ============================================================

    async def connect(self):
        """建立到 MCP Server 的连接(异步)。"""
        if self._connected:
            return
        async with self._connect_lock:
            if self._connected:
                return
            from mcp import ClientSession
            from mcp.client.streamable_http import streamablehttp_client

            cm = streamablehttp_client(url=self.url)
            read, write, close = await cm.__aenter__()
            session = ClientSession(read, write)
            await session.__aenter__()
            await session.initialize()
            self._session = session
            self._cm = cm
            self._close = close
            self._connected = True
            logger.info(f"[MCP:{self.name}] connected to {self.url}")

    async def close(self):
        if not self._connected:
            return
        try:
            if self._session is not None:
                await self._session.__aexit__(None, None, None)
        except Exception as e:
            logger.warning(f"[MCP:{self.name}] session close error: {e}")
        try:
            if self._cm is not None:
                await self._cm.__aexit__(None, None, None)
        except Exception as e:
            logger.warning(f"[MCP:{self.name}] transport close error: {e}")
        finally:
            self._connected = False
            self._session = None

    async def __aenter__(self):
        await self.connect()
        return self

    async def __aexit__(self, *args):
        await self.close()

    # ============================================================
    # 工具 API(异步)
    # ============================================================

    async def list_tools(self) -> List[ToolDescriptor]:
        """返回 MCP Server 注册的工具列表(以 ToolDescriptor 形式)。"""
        if not self._connected:
            await self.connect()
        result = await self._session.list_tools()
        out = []
        for t in result.tools:
            schema = t.inputSchema if hasattr(t, "inputSchema") else (t.input_schema or {})
            out.append(ToolDescriptor(
                name=t.name,
                description=t.description or "",
                input_schema=schema,
                kind="mcp",
                backend=self.name,
            ))
        return out

    async def call_tool(self, name: str, arguments: Dict[str, Any]) -> ToolCallResult:
        """调用 MCP 工具(异步)。返回 ToolCallResult。"""
        if not self._connected:
            await self.connect()
        try:
            response = await self._session.call_tool(name, arguments=arguments)
        except Exception as e:
            return ToolCallResult(ok=False, error=f"MCP call_tool failed: {e}")

        is_error = getattr(response, "isError", False) or False
        contents = getattr(response, "content", []) or []

        if is_error:
            msg = ""
            for c in contents:
                if getattr(c, "type", "") == "text":
                    msg += getattr(c, "text", "")
            return ToolCallResult(ok=False, error=msg or "MCP tool returned isError=True", raw=contents)

        text_parts = []
        for c in contents:
            if getattr(c, "type", "") == "text":
                text_parts.append(getattr(c, "text", ""))
        combined = "\n".join(text_parts)
        try:
            parsed = json.loads(combined)
            return ToolCallResult(ok=True, value=parsed, raw=contents)
        except json.JSONDecodeError:
            return ToolCallResult(ok=True, value=combined, raw=contents)

    # ============================================================
    # 状态
    # ============================================================

    async def health(self) -> Dict[str, Any]:
        try:
            tools = await self.list_tools()
            return {
                "ok": True,
                "url": self.url,
                "tools_count": len(tools),
                "tool_names": [t.name for t in tools],
            }
        except Exception as e:
            return {"ok": False, "url": self.url, "error": str(e)}


# ============================================================
# 单例
# ============================================================

_default_client: Optional[MCPClient] = None


def get_default_mcp_client() -> MCPClient:
    global _default_client
    if _default_client is None:
        url = os.environ.get("AGENT_MCP_SERVER_URL", "http://localhost:8765/mcp")
        _default_client = MCPClient(url=url, name="rag-mcp")
    return _default_client
