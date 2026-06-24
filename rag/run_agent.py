"""一键启动 Agent Hub (FastAPI :8100)。

启动:uv run run_agent.py
"""
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from agent.server import main

if __name__ == "__main__":
    main()
