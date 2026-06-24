"""一键启动 RAG MCP Server (streamable-http transport)。

启动:uv run run_mcp_sse.py
默认监听 0.0.0.0:8765,可由 .env 中 MCP_SERVER_HOST / MCP_SERVER_PORT 覆盖。
"""
import os
import sys
from pathlib import Path

# 把项目根加入 sys.path,确保可以 import rag_demo
PROJECT_ROOT = Path(__file__).parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from mcp_server.rag_tools import main

if __name__ == "__main__":
    host = os.environ.get("MCP_SERVER_HOST", "0.0.0.0")
    port = int(os.environ.get("MCP_SERVER_PORT", "8765"))
    print(f"=" * 60)
    print(f"  RAG MCP Server 启动中 ...")
    print(f"  Transport: streamable-http")
    print(f"  Listen:    {host}:{port}")
    print(f"=" * 60)
    main("streamable-http", host=host, port=port)
