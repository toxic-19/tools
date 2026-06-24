"""AI 智能体能力支撑平台(Agent Hub)。

模块:
  - sandbox        Python 受限子进程沙箱
  - mcp_client     通用 MCP 客户端
  - tools          Agent 工具注册中心
  - llm            LLM 封装(支持 function calling + ReAct 降级)
  - loop           「感知-思考-行动」主循环
  - server         Agent Hub FastAPI 服务
"""
