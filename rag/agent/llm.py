"""LLM 封装(OpenAI 兼容接口)。

支持:
  1. 标准 function calling —— 把 tools 转成 OpenAI tools 格式,LLM 返回 tool_calls
  2. ReAct 文本协议降级 —— 如果 LLM 不支持 function calling,
     解析 "Action: tool_name\nAction Input: {...}" 这种文本格式

输出统一为 LLMResponse:
  - content: 文本内容(可能含思考)
  - tool_calls: [{name, arguments}, ...]
  - is_final: 是否到达终止(无 tool_calls 时为 True)
  - finish_reason: 原始 finish_reason
  - raw: 原始响应(给前端 trace 展示)
"""
from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from openai import OpenAI

from rag_demo.config import (
    LLM_MODEL_NAME, LLM_API_KEY, LLM_API_BASE, LLM_TEMPERATURE, LLM_MAX_TOKENS,
)

logger = logging.getLogger(__name__)


def _to_openai_tool(t: Dict[str, Any]) -> Dict[str, Any]:
    """把我们 ToolRegistry 的工具描述转成 OpenAI tools 格式。

    我们的格式: {name, description, parameters: {type, properties, required}}
    OpenAI 格式: {type: "function", function: {name, description, parameters}}
    """
    return {
        "type": "function",
        "function": {
            "name": t["name"],
            "description": t["description"],
            "parameters": t.get("parameters", {"type": "object", "properties": {}}),
        },
    }


@dataclass
class LLMResponse:
    content: str = ""
    tool_calls: List[Dict[str, Any]] = field(default_factory=list)
    is_final: bool = True
    finish_reason: str = ""
    raw: Any = None
    elapsed_ms: float = 0.0
    error: Optional[str] = None


class LLMClient:
    """LLM 客户端,统一 function calling / ReAct 降级。"""

    def __init__(self):
        self.client = OpenAI(api_key=LLM_API_KEY, base_url=LLM_API_BASE)
        self.model = LLM_MODEL_NAME
        # 是否启用 function calling(可通过环境变量强制关闭,走 ReAct)
        import os
        self.use_function_calling = os.environ.get(
            "AGENT_LLM_FUNCTION_CALLING", "auto"
        ).lower()
        # "auto" / "on" / "off"
        # 第一次调用时探测:如果模型不返回 tool_calls,自动切到 ReAct

    # ============================================================
    # 主入口
    # ============================================================

    def chat(
        self,
        messages: List[Dict[str, str]],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: str = "auto",
    ) -> LLMResponse:
        """调 LLM。

        Args:
            messages: OpenAI 风格消息列表
            tools: OpenAI 风格 tools 数组(从 ToolRegistry.list_tools() 来)
            tool_choice: "auto" / "none" / "required"

        Returns:
            LLMResponse
        """
        t0 = time.perf_counter()

        # 构造 OpenAI 格式
        kwargs = {
            "model": self.model,
            "messages": messages,
            "temperature": LLM_TEMPERATURE,
            "max_tokens": LLM_MAX_TOKENS,
        }
        if tools and self._should_use_fc(tools):
            kwargs["tools"] = [_to_openai_tool(t) for t in tools]
            kwargs["tool_choice"] = tool_choice

        try:
            response = self.client.chat.completions.create(**kwargs)
        except Exception as e:
            return LLMResponse(
                error=f"LLM 调用失败: {e}",
                elapsed_ms=(time.perf_counter() - t0) * 1000,
            )

        elapsed = (time.perf_counter() - t0) * 1000
        choice = response.choices[0]
        msg = choice.message
        content = msg.content or ""
        finish_reason = choice.finish_reason or ""

        # 解析 tool_calls(可能 function calling / ReAct 文本)
        tool_calls: List[Dict[str, Any]] = []
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            for tc in msg.tool_calls:
                try:
                    args = json.loads(tc.function.arguments) if tc.function.arguments else {}
                except json.JSONDecodeError:
                    args = {"_raw": tc.function.arguments}
                tool_calls.append({
                    "id": tc.id,
                    "name": tc.function.name,
                    "arguments": args,
                })
        elif tools and self._should_use_fc(tools):
            # FC 模式下没拿到 tool_calls,可能 LLM 没支持 —— 标记以便切到 ReAct
            pass

        # 如果 model 拒绝 FC 或返回了非 FC 格式,试 ReAct 解析
        if not tool_calls and tools:
            parsed = self._parse_react(content)
            if parsed:
                tool_calls = parsed
                finish_reason = "react_parsed"

        is_final = len(tool_calls) == 0

        return LLMResponse(
            content=content,
            tool_calls=tool_calls,
            is_final=is_final,
            finish_reason=finish_reason,
            raw=response,
            elapsed_ms=elapsed,
        )

    def _should_use_fc(self, tools: List[Dict[str, Any]]) -> bool:
        if self.use_function_calling == "off":
            return False
        if self.use_function_calling == "on":
            return True
        # auto:暂默认开(如果 LLM 不支持,会自然降级到 ReAct)
        return True

    # ============================================================
    # ReAct 文本协议
    # ============================================================

    REACT_ACTION_RE = re.compile(
        r"Action:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\nAction Input:\s*(\{.*?\})",
        re.DOTALL,
    )

    def _parse_react(self, content: str) -> List[Dict[str, Any]]:
        """从 LLM 输出中解析 ReAct 格式。

        期望格式:
            Thought: <想法>
            Action: <tool_name>
            Action Input: <json>
        """
        if "Action:" not in content or "Action Input:" not in content:
            return []
        m = self.REACT_ACTION_RE.search(content)
        if not m:
            return []
        name = m.group(1).strip()
        args_raw = m.group(2).strip()
        try:
            args = json.loads(args_raw)
        except json.JSONDecodeError:
            args = {"_raw": args_raw}
        return [{"id": f"react_{int(time.time() * 1000)}", "name": name, "arguments": args}]

    # ============================================================
    # 给 ReAct 模式的 tools 描述(自然语言版)
    # ============================================================

    @staticmethod
    def build_react_prompt(tools: List[Dict[str, Any]]) -> str:
        """生成 ReAct 风格的工具说明(给不支持 function calling 的 LLM)。"""
        lines = ["你可以使用以下工具:"]
        for t in tools:
            lines.append(f"\n## {t['name']}")
            lines.append(f"  描述: {t['description']}")
            params = t.get("parameters", {}).get("properties", {})
            if params:
                lines.append("  参数(JSON):")
                for k, v in params.items():
                    desc = v.get("description", "")
                    typ = v.get("type", "any")
                    lines.append(f"    - {k} ({typ}): {desc}")
        lines.append("")
        lines.append("调用格式:")
        lines.append("Thought: <你的思考>")
        lines.append("Action: <tool_name>")
        lines.append('Action Input: <json>')
        lines.append("")
        lines.append("如果你已经收集到足够信息,请直接给出 Final Answer,不要调工具。")
        return "\n".join(lines)
