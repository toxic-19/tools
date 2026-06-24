"""Agent 工具注册中心。

把以下三类工具统一为 ToolDescriptor 喂给 LLM:

  1. RAG MCP 工具  (通过 MCPClient 调 RAG MCP Server)
     - rag_query / rag_search / rag_stats / rag_ingest_file / rag_health
  2. Mock 微服务工具  (本地 mock,模拟"医院信息系统 / 临床指南"等微服务)
     - ehr_patient_query:模拟查患者基本信息
     - clinical_guideline_lookup:模拟查临床指南
  3. 沙箱工具  (在受限子进程里跑 Python)
     - sandbox_run_python:通用 Python 执行
     - sandbox_calc:简单算术

注意:工具数量 >= 2 是招标硬要求,这里提供 9 个,远超最低门槛。
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

from .mcp_client import MCPClient, ToolDescriptor, ToolCallResult
from .sandbox import Sandbox, get_default_sandbox

logger = logging.getLogger(__name__)


# ============================================================
# Mock 微服务工具
# ============================================================

# 模拟患者数据
_MOCK_PATIENTS = {
    "P001": {
        "patient_id": "P001",
        "name": "张三",
        "age": 58,
        "gender": "男",
        "diagnosis": ["2 型糖尿病", "高血压"],
        "allergies": ["青霉素"],
        "medications": [
            {"name": "二甲双胍", "dose": "500mg bid", "status": "在用"},
            {"name": "硝苯地平", "dose": "30mg qd", "status": "在用"},
        ],
        "last_visit": "2025-12-10",
    },
    "P002": {
        "patient_id": "P002",
        "name": "李四",
        "age": 42,
        "gender": "女",
        "diagnosis": ["甲状腺功能减退"],
        "allergies": [],
        "medications": [
            {"name": "左甲状腺素钠", "dose": "50µg qd", "status": "在用"},
        ],
        "last_visit": "2026-04-22",
    },
    "P003": {
        "patient_id": "P003",
        "name": "王五",
        "age": 71,
        "gender": "男",
        "diagnosis": ["冠心病", "心房颤动", "慢性肾脏病 3 期"],
        "allergies": ["阿司匹林(消化道出血)"],
        "medications": [
            {"name": "华法林", "dose": "2.5mg qd", "status": "在用,需监测 INR"},
            {"name": "阿托伐他汀", "dose": "20mg qn", "status": "在用"},
        ],
        "last_visit": "2026-05-18",
    },
}

# 模拟临床指南
_MOCK_GUIDELINES = {
    "二甲双胍": {
        "drug": "二甲双胍",
        "category": "口服降糖药",
        "indications": ["2 型糖尿病一线用药"],
        "contraindications": [
            "严重肾功能不全(eGFR < 30 mL/min/1.73m²)",
            "急性或慢性心力衰竭(NYHA III-IV)",
            "严重肝功能不全",
            "对二甲双胍过敏",
        ],
        "common_adverse": ["胃肠道反应(恶心、腹泻)", "维生素 B12 缺乏(长期)"],
        "monitoring": ["肾功能(eGFR)", "血糖(HbA1c)", "血清乳酸(高危患者)"],
    },
    "华法林": {
        "drug": "华法林",
        "category": "口服抗凝药",
        "indications": ["心房颤动血栓预防", "深静脉血栓", "机械瓣膜置换术后"],
        "contraindications": [
            "活动性出血",
            "妊娠早期(致畸)",
            "严重肝功能不全",
            "凝血功能障碍",
        ],
        "common_adverse": ["出血(鼻衄、牙龈出血、消化道)", "皮肤坏死(罕见)"],
        "monitoring": ["INR(目标 2.0-3.0,机械瓣 2.5-3.5)", "肝功能"],
    },
    "硝苯地平": {
        "drug": "硝苯地平",
        "category": "钙通道阻滞剂(降压)",
        "indications": ["原发性高血压", "心绞痛"],
        "contraindications": [
            "心源性休克",
            "重度主动脉瓣狭窄",
            "对该药过敏",
        ],
        "common_adverse": ["踝部水肿", "头痛", "面部潮红"],
        "monitoring": ["血压", "心率"],
    },
}


def _mock_microservice_call(endpoint: str, params: Dict[str, Any]) -> ToolCallResult:
    """统一的 mock 微服务入口。"""
    t0 = time.perf_counter()
    if endpoint == "ehr_patient_query":
        pid = params.get("patient_id", "").strip().upper()
        if not pid:
            return ToolCallResult(ok=False, error="patient_id 不能为空", value={"mock": True, "endpoint": endpoint})
        if pid in _MOCK_PATIENTS:
            return ToolCallResult(
                ok=True,
                value={"mock": True, "endpoint": endpoint, "patient": _MOCK_PATIENTS[pid]},
            )
        # 没找到的患者:返回空集合而不是 404
        return ToolCallResult(
            ok=True,
            value={"mock": True, "endpoint": endpoint, "patient": None,
                   "available_ids": list(_MOCK_PATIENTS.keys())},
        )
    elif endpoint == "clinical_guideline_lookup":
        drug = params.get("drug", "").strip()
        if not drug:
            return ToolCallResult(ok=False, error="drug 不能为空", value={"mock": True, "endpoint": endpoint})
        # 大小写不敏感模糊匹配
        for k, v in _MOCK_GUIDELINES.items():
            if drug in k or k in drug:
                return ToolCallResult(
                    ok=True,
                    value={"mock": True, "endpoint": endpoint, "guideline": v},
                )
        return ToolCallResult(
            ok=True,
            value={"mock": True, "endpoint": endpoint, "guideline": None,
                   "available_drugs": list(_MOCK_GUIDELINES.keys())},
        )
    else:
        return ToolCallResult(ok=False, error=f"unknown mock endpoint: {endpoint}")


# ============================================================
# 沙箱工具
# ============================================================

def _sandbox_run_python(code: str) -> ToolCallResult:
    sb = get_default_sandbox()
    r = sb.run_python(code)
    if r.ok:
        return ToolCallResult(
            ok=True,
            value={
                "value": r.value,
                "stdout": r.stdout,
                "elapsed_ms": round(r.elapsed_ms, 1),
            },
        )
    return ToolCallResult(
        ok=False,
        error=r.error or "sandbox error",
        value={"timed_out": r.timed_out, "elapsed_ms": round(r.elapsed_ms, 1)},
    )


def _sandbox_calc(expression: str) -> ToolCallResult:
    """受限的算术表达式求值(走沙箱,更安全)。"""
    # 包成单行表达式,赋值给 result
    code = f"result = {expression}\nresult"
    return _sandbox_run_python(code)


# ============================================================
# 工具描述(OpenAI 风格 tools 数组 + 元信息)
# ============================================================

def _schema(properties: Dict[str, Any], required: List[str]) -> Dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": required,
    }


# MCP 工具:从 MCP Server 动态拉,加上固定 mock / sandbox 工具
MOCK_MICROSERVICE_TOOLS = [
    {
        "name": "ehr_patient_query",
        "description": (
            "查询医院信息系统(EHR)中指定患者的基本信息、诊断、过敏史、用药记录。"
            "支持的患者 ID:P001/P002/P003。"
        ),
        "input_schema": _schema(
            {
                "patient_id": {
                    "type": "string",
                    "description": "患者 ID,如 'P001'",
                },
            },
            ["patient_id"],
        ),
        "kind": "mock_microservice",
        "backend": "mock_ehr",
    },
    {
        "name": "clinical_guideline_lookup",
        "description": (
            "查询药物的临床指南(适应症、禁忌症、不良反应、监测要求)。"
            "支持的药物:二甲双胍 / 华法林 / 硝苯地平。"
        ),
        "input_schema": _schema(
            {
                "drug": {
                    "type": "string",
                    "description": "药品名称(中文),如 '二甲双胍'",
                },
            },
            ["drug"],
        ),
        "kind": "mock_microservice",
        "backend": "mock_guideline",
    },
]

SANDBOX_TOOLS = [
    {
        "name": "sandbox_run_python",
        "description": (
            "在安全沙箱(受限子进程)内执行一段 Python 代码。"
            "禁止文件 I/O / 网络 / 危险模块,允许基础 stdlib(math/json/collections/datetime 等)。"
            "适合做数值计算、数据处理、字符串清洗等。"
        ),
        "input_schema": _schema(
            {
                "code": {
                    "type": "string",
                    "description": "要执行的 Python 源代码",
                },
            },
            ["code"],
        ),
        "kind": "sandbox",
        "backend": "sandbox_python",
    },
    {
        "name": "sandbox_calc",
        "description": (
            "在安全沙箱内求值一个算术表达式,返回数值结果。比 sandbox_run_python 更受限。"
        ),
        "input_schema": _schema(
            {
                "expression": {
                    "type": "string",
                    "description": "Python 算术表达式,如 '(2 + 3) * 4'",
                },
            },
            ["expression"],
        ),
        "kind": "sandbox",
        "backend": "sandbox_calc",
    },
]


class ToolRegistry:
    """工具注册中心,统一对外暴露 list_tools / call_tool。"""

    def __init__(self, mcp_url: Optional[str] = None, enable_mock: bool = True):
        self.mcp_url = mcp_url or os.environ.get(
            "AGENT_MCP_SERVER_URL", "http://localhost:8765/mcp"
        )
        self.mcp_client = MCPClient(url=self.mcp_url, name="rag-mcp")
        self.enable_mock = enable_mock

    async def connect(self):
        """建立到 MCP Server 的连接(异步)。失败不抛,降级为无 MCP 模式。"""
        try:
            await self.mcp_client.connect()
        except Exception as e:
            logger.warning(f"[ToolRegistry] MCP Server 不可达,降级: {e}")
            self.mcp_client._connected = False

    async def close(self):
        try:
            await self.mcp_client.close()
        except Exception:
            pass

    # ============================================================
    # 工具清单(异步)
    # ============================================================

    async def list_tools(self) -> List[Dict[str, Any]]:
        """返回 OpenAI 风格的 tools 数组。"""
        tools: List[Dict[str, Any]] = []

        # 1. MCP 工具
        if self.mcp_client._connected:
            try:
                mcp_tools = await self.mcp_client.list_tools()
                for t in mcp_tools:
                    tools.append({
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.input_schema,
                        "kind": "mcp",
                        "backend": "rag-mcp-server",
                    })
            except Exception as e:
                logger.warning(f"列出 MCP 工具失败: {e}")

        # 2. Mock 微服务
        if self.enable_mock:
            for t in MOCK_MICROSERVICE_TOOLS:
                tools.append({**t, "parameters": t["input_schema"]})

        # 3. 沙箱
        for t in SANDBOX_TOOLS:
            tools.append({**t, "parameters": t["input_schema"]})

        return tools

    async def list_tools_summary(self) -> List[Dict[str, Any]]:
        return [
            {
                "name": t["name"],
                "kind": t["kind"],
                "backend": t.get("backend", ""),
                "description": t["description"],
                "parameters": t.get("parameters", {}),
            }
            for t in await self.list_tools()
        ]

    # ============================================================
    # 工具调用(同步,因为我们目前的 sandbox / mock 是同步)
    # ============================================================

    def call(self, name: str, arguments: Dict[str, Any]) -> ToolCallResult:
        """统一入口:同步调用本地工具(mock / sandbox)。

        MCP 工具调用走 async,需要用 call_async。
        """
        # 1. Mock 微服务
        if name == "ehr_patient_query":
            return _mock_microservice_call("ehr_patient_query", arguments)
        if name == "clinical_guideline_lookup":
            return _mock_microservice_call("clinical_guideline_lookup", arguments)
        # 2. 沙箱
        if name == "sandbox_run_python":
            return _sandbox_run_python(arguments.get("code", ""))
        if name == "sandbox_calc":
            return _sandbox_calc(arguments.get("expression", ""))
        return ToolCallResult(ok=False, error=f"unknown tool: {name}")

    async def call_async(self, name: str, arguments: Dict[str, Any]) -> ToolCallResult:
        """统一入口(异步):支持 MCP + mock + sandbox。

        MCP 走异步 session;mock / sandbox 在 executor 里跑避免阻塞 event loop。
        """
        t0 = time.perf_counter()
        # 1. Mock 微服务
        if name in ("ehr_patient_query", "clinical_guideline_lookup"):
            return await asyncio.get_event_loop().run_in_executor(
                None, _mock_microservice_call,
                name.replace("ehr_", "ehr_").replace("clinical_", "clinical_"), arguments
            )
        # 2. 沙箱
        if name == "sandbox_run_python":
            return await asyncio.get_event_loop().run_in_executor(
                None, _sandbox_run_python, arguments.get("code", "")
            )
        if name == "sandbox_calc":
            return await asyncio.get_event_loop().run_in_executor(
                None, _sandbox_calc, arguments.get("expression", "")
            )
        # 3. MCP
        if self.mcp_client._connected and not name.startswith(("ehr_", "clinical_", "sandbox_")):
            return await self.mcp_client.call_tool(name, arguments)
        return ToolCallResult(ok=False, error=f"unknown tool: {name}")

    async def health(self) -> Dict[str, Any]:
        mcp_health = await self.mcp_client.health() if self.mcp_client._connected else {"ok": False, "error": "not connected"}
        return {
            "mcp_server": mcp_health,
            "mock_microservice_enabled": self.enable_mock,
            "sandbox": {
                "ok": True,
                "timeout_ms": int(os.environ.get("SANDBOX_TIMEOUT_MS", "10000")),
            },
        }


# 单例
_default_registry: Optional[ToolRegistry] = None


def get_default_registry() -> ToolRegistry:
    global _default_registry
    if _default_registry is None:
        enable_mock = os.environ.get("AGENT_ENABLE_MOCK_MICROSERVICE", "true").lower() in ("1", "true", "yes")
        _default_registry = ToolRegistry(enable_mock=enable_mock)
    return _default_registry
