"""
启动 FastAPI 服务

使用 uv（推荐）:
  uv run run_server.py
  然后访问 http://localhost:8000 使用 Web UI
  或访问 http://localhost:8000/docs 查看 API 文档

使用 pip（备用）:
  python run_server.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

import uvicorn

if __name__ == "__main__":
    print("""
  ╔═══════════════════════════════════════════════╗
  ║       RAG Demo - FastAPI Server               ║
  ║                                               ║
  ║  Web UI:  http://localhost:8000                ║
  ║  API Doc: http://localhost:8000/docs           ║
  ╚═══════════════════════════════════════════════╝
    """)
    uvicorn.run(
        "rag_demo.server:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
    )
