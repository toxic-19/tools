"""
启动 CLI 交互模式

使用 uv（推荐）:
  uv run run_cli.py                     # 默认进入交互问答
  uv run run_cli.py import-dir          # 导入 data/ 目录下所有文件
  uv run run_cli.py import <文件路径>    # 导入单个文件
  uv run run_cli.py stats               # 查看知识库统计
  uv run run_cli.py reset               # 清空知识库

使用 pip（备用）:
  python run_cli.py
"""
import sys
import os

# 将项目根目录加入 path
sys.path.insert(0, os.path.dirname(__file__))

from rag_demo.cli import main

if __name__ == "__main__":
    main()
