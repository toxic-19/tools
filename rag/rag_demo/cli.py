"""
CLI 交互界面
=============
提供命令行交互方式操作 RAG 系统：
  - 导入文档到知识库
  - 知识库问答
  - 查看知识库状态
"""

import sys
import os
import argparse
from pathlib import Path

# 确保可以 import rag_demo
sys.path.insert(0, str(Path(__file__).parent.parent))

from rag_demo.pipeline import RAGPipeline
from rag_demo.config import DATA_DIR


def print_banner():
    print(r"""
  ╔═══════════════════════════════════════════════╗
  ║          RAG Demo - 知识库问答系统              ║
  ║                                               ║
  ║  功能：文档导入 → 向量检索 → Rerank → LLM 问答  ║
  ╚═══════════════════════════════════════════════╝
    """)


def print_citations(citations):
    """格式化输出引用来源。"""
    if not citations:
        return
    print("\n" + "─" * 50)
    print("📚 引用来源：")
    print("─" * 50)
    for i, c in enumerate(citations, 1):
        page_info = f" 第{c.page_number}页" if c.page_number else ""
        score_info = f" (相似度: {c.score:.4f}"
        if c.rerank_score is not None:
            score_info += f", rerank: {c.rerank_score:.4f}"
        score_info += ")"
        print(f"\n  [{i}] {c.filename}{page_info}{score_info}")
        # 截取前 150 字符预览
        preview = c.text[:150].replace("\n", " ")
        print(f"      \"{preview}...\"")
    print("─" * 50)


def interactive_mode(pipeline: RAGPipeline):
    """交互式问答模式。"""
    print("\n进入交互式问答模式（输入 'quit' 退出，'stats' 查看统计）\n")

    while True:
        try:
            question = input("❓ 请输入问题: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n再见！")
            break

        if not question:
            continue
        if question.lower() in ("quit", "exit", "q"):
            print("再见！")
            break
        if question.lower() == "stats":
            stats = pipeline.get_stats()
            print(f"\n  知识库: {stats['collection']}")
            print(f"  记录数: {stats['row_count']}")
            print(f"  向量维度: {stats['dimension']}")
            continue

        # 执行 RAG 问答
        response = pipeline.query(question)

        # 输出结果
        print("\n" + "═" * 50)
        print(f"💡 回答：\n")
        print(response.answer)
        print(f"\n  [检索: {response.search_count} 条 → Rerank: {response.rerank_count} 条]")

        # 输出引用
        print_citations(response.citations)
        print()


def main():
    parser = argparse.ArgumentParser(description="RAG Demo CLI")
    parser.add_argument(
        "command",
        nargs="?",
        choices=["import", "import-dir", "ask", "chat", "stats", "reset"],
        default="chat",
        help="命令: import(导入文件), import-dir(导入目录), ask(单次问答), chat(交互模式), stats(统计), reset(清空)",
    )
    parser.add_argument("path_or_question", nargs="?", help="文件/目录路径 或 问题文本")
    parser.add_argument("--question", "-q", help="问答模式的问题文本")

    args = parser.parse_args()

    print_banner()

    # 初始化 Pipeline
    pipeline = RAGPipeline()

    if args.command == "import":
        if not args.path_or_question:
            # 默认扫描 data 目录
            path = DATA_DIR
            if not os.path.exists(path):
                print(f"  数据目录不存在: {path}")
                sys.exit(1)
        else:
            path = args.path_or_question
        result = pipeline.ingest_file(path)
        print(f"\n  导入完成: {result}")

    elif args.command == "import-dir":
        path = args.path_or_question or DATA_DIR
        result = pipeline.ingest_directory(path)
        print(f"\n  导入完成: {result}")

    elif args.command == "ask":
        question = args.path_or_question or args.question
        if not question:
            question = input("请输入问题: ").strip()
        response = pipeline.query(question)
        print(f"\n💡 回答：\n{response.answer}")
        print_citations(response.citations)

    elif args.command == "stats":
        stats = pipeline.get_stats()
        print(f"\n  知识库: {stats['collection']}")
        print(f"  记录数: {stats['row_count']}")
        print(f"  向量维度: {stats['dimension']}")
        print(f"  字段: {', '.join(stats['fields'])}")

    elif args.command == "reset":
        confirm = input("确定要清空知识库吗？(y/N): ").strip().lower()
        if confirm == "y":
            pipeline.reset()
            print("  知识库已清空")
        else:
            print("  已取消")

    else:  # chat
        interactive_mode(pipeline)


if __name__ == "__main__":
    main()
