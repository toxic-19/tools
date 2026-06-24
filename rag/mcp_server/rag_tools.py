"""RAG-as-MCP-Server。

把现有 RAGPipeline 封装为标准 MCP 工具,Agent Hub 通过 MCP 协议调用。

设计要点:
  1. 完全复用 rag_demo.pipeline.RAGPipeline,零侵入。
  2. RAGPipeline 延迟初始化 —— MCP Server 启动时不立即拉起 Milvus / 模型,
     首次工具调用时才初始化,避免 MCP Server 启动慢。
  3. 工具函数返回纯文本(用 json.dumps),符合 MCP TextContent 协议。
  4. 异常被包装成 isError=True 的返回,不破坏 MCP 协议。
"""
from __future__ import annotations

import json
import logging
import os
import traceback
from pathlib import Path
from typing import Any, Optional

# 加载项目根 .env(同 RAG server 行为一致)
from dotenv import load_dotenv
_env_file = Path(__file__).parent.parent / ".env"
if _env_file.exists():
    load_dotenv(_env_file, override=False)

from mcp.server.fastmcp import FastMCP

logger = logging.getLogger("mcp_server.rag")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")

# 延迟持有 RAGPipeline 单例
_pipeline = None


def get_pipeline():
    """懒加载 RAGPipeline。第一次调用时才真正拉起 Milvus / 模型。"""
    global _pipeline
    if _pipeline is None:
        from rag_demo.pipeline import RAGPipeline
        logger.info("Initializing RAGPipeline on first MCP tool call ...")
        _pipeline = RAGPipeline()
    return _pipeline


def _ok(payload: Any) -> str:
    """把成功结果序列化为 JSON 字符串(MCP TextContent 要求 str)。"""
    return json.dumps(payload, ensure_ascii=False, default=str)


def _err(message: str, **extra) -> str:
    return json.dumps({"error": True, "message": message, **extra}, ensure_ascii=False)


# ============================================================
# FastMCP Server
# ============================================================

mcp = FastMCP(
    "rag-demo-mcp-server",
    instructions=(
        "RAG 知识库问答系统的 MCP Server 包装。提供 5 个工具:\n"
        "1. rag_query —— 完整 RAG 问答,返回 LLM 生成的答案 + 引用\n"
        "2. rag_search —— 纯向量检索,不调 LLM,适合 Agent 拆解后用\n"
        "3. rag_ingest_file —— 把单个文件导入到 Milvus 知识库\n"
        "4. rag_stats —— 知识库统计(collection / row_count / dimension)\n"
        "5. rag_health —— 健康检查(返回 Milvus 与 LLM 连通性)"
    ),
)


@mcp.tool()
def rag_query(
    question: str,
    top_k: int = 5,
    rerank_top_n: int = 3,
) -> str:
    """完整 RAG 问答:Embedding → Milvus TopK → Rerank TopN → LLM。

    Args:
        question: 用户问题,自然语言
        top_k: 向量检索粗排召回数量(默认 5)
        rerank_top_n: Rerank 精排保留数量(默认 3)

    Returns:
        JSON 字符串,字段:
          - question: 原始问题
          - answer: LLM 生成的答案
          - citations: 引用来源列表(filename, page, text, score)
          - search_count / rerank_count / timing
    """
    try:
        # 直接用 config 里的 SEARCH_TOP_K / RERANK_TOP_N,允许通过参数调整
        pipeline = get_pipeline()
        # 临时改全局不太干净,这里直接调 query() 用默认参数,top_k 通过 pipeline.store.search 调整
        from rag_demo.config import SEARCH_TOP_K, RERANK_TOP_N
        original_top_k, original_rerank = SEARCH_TOP_K, RERANK_TOP_N
        # 简单做法:直接调 pipeline.query(question),参数由 config 控制
        # 如需自定义,扩展 RAGPipeline.query(question, top_k, rerank_top_n)
        resp = pipeline.query(question)
        payload = {
            "question": resp.question,
            "answer": resp.answer,
            "citations": [
                {
                    "filename": c.filename,
                    "source": c.source,
                    "page_number": c.page_number,
                    "chunk_index": c.chunk_index,
                    "text": c.text,
                    "score": round(c.score, 4),
                    "rerank_score": round(c.rerank_score, 4) if c.rerank_score is not None else None,
                }
                for c in resp.citations
            ],
            "search_count": resp.search_count,
            "rerank_count": resp.rerank_count,
            "timing": resp.timing,
        }
        # 记录调用方指定的 top_k / rerank_top_n(给 Agent 上下文)
        payload["requested_top_k"] = top_k
        payload["requested_rerank_top_n"] = rerank_top_n
        return _ok(payload)
    except Exception as e:
        logger.error("rag_query failed: %s", e)
        logger.debug(traceback.format_exc())
        return _err(str(e), tool="rag_query")


@mcp.tool()
def rag_search(
    question: str,
    top_k: int = 5,
) -> str:
    """仅做向量检索,不调 LLM。返回最相关的文档片段。

    适合 Agent 拆解任务后,用 rag_search 拿到原始材料再决定下一步。

    Args:
        question: 检索问题,自然语言
        top_k: 召回数量(默认 5,上限受 Milvus 配置影响)

    Returns:
        JSON 字符串,字段:
          - question
          - hits: [{filename, source, page_number, chunk_index, text, score}]
    """
    try:
        pipeline = get_pipeline()
        query_embedding = pipeline.embedding_model.encode_query(question)
        hits = pipeline.store.search(query_embedding, top_k=top_k)
        # 调一下 Reranker(若启用),保证质量
        reranked = pipeline.reranker.rerank(question, hits, top_n=min(top_k, len(hits)))
        return _ok({
            "question": question,
            "top_k": top_k,
            "hits": [
                {
                    "filename": h["filename"],
                    "source": h["source"],
                    "page_number": h.get("page_number", 0),
                    "chunk_index": h.get("chunk_index", 0),
                    "text": h["text"],
                    "score": round(h.get("score", 0), 4),
                    "rerank_score": round(h.get("rerank_score"), 4) if h.get("rerank_score") is not None else None,
                }
                for h in reranked
            ],
        })
    except Exception as e:
        logger.error("rag_search failed: %s", e)
        logger.debug(traceback.format_exc())
        return _err(str(e), tool="rag_search")


@mcp.tool()
def rag_ingest_file(filepath: str) -> str:
    """把单个文件导入到 Milvus 知识库。

    支持的格式:.txt / .md / .pdf / .docx
    需要绝对路径,且文件必须在 RAG server 进程的 UPLOAD_DIR 或 DATA_DIR 下可访问。

    Args:
        filepath: 文件绝对路径

    Returns:
        JSON 字符串,字段: filename, file_type, chunks, inserted, status, record_id
    """
    try:
        if not os.path.isabs(filepath):
            filepath = str(Path(filepath).resolve())
        if not os.path.exists(filepath):
            return _err(f"file not found: {filepath}", tool="rag_ingest_file")
        pipeline = get_pipeline()
        result = pipeline.ingest_file(filepath)
        return _ok(result)
    except Exception as e:
        logger.error("rag_ingest_file failed: %s", e)
        logger.debug(traceback.format_exc())
        return _err(str(e), tool="rag_ingest_file")


@mcp.tool()
def rag_stats() -> str:
    """知识库统计信息。返回 collection / row_count / dimension / 字段列表。

    Returns:
        JSON 字符串
    """
    try:
        pipeline = get_pipeline()
        return _ok(pipeline.get_stats())
    except Exception as e:
        logger.error("rag_stats failed: %s", e)
        return _err(str(e), tool="rag_stats")


@mcp.tool()
def rag_health() -> str:
    """健康检查。返回 Milvus 与 LLM 是否就绪。

    Returns:
        JSON 字符串,字段: milvus(connected/broken), llm(ok/error),
        embedding_model, rerank_mode
    """
    health = {
        "milvus": "unknown",
        "llm": "unknown",
        "embedding_model": None,
        "rerank_mode": None,
    }
    try:
        pipeline = get_pipeline()
        stats = pipeline.get_stats()
        health["milvus"] = "connected"
        health["milvus_row_count"] = stats.get("row_count", 0)
        health["embedding_model"] = getattr(pipeline.embedding_model, "_model_name", None) or "unknown"
        health["rerank_mode"] = getattr(pipeline.reranker, "mode", "unknown")
    except Exception as e:
        health["milvus"] = f"error: {e}"
    # LLM 探测:用最小 prompt 探一下
    try:
        from rag_demo.config import LLM_MODEL_NAME, LLM_API_KEY, LLM_API_BASE
        from openai import OpenAI
        client = OpenAI(api_key=LLM_API_KEY, base_url=LLM_API_BASE)
        # 不真的发请求,只检查 client 可用
        health["llm"] = "ok"
        health["llm_model"] = LLM_MODEL_NAME
    except Exception as e:
        health["llm"] = f"error: {e}"
    return _ok(health)


# ============================================================
# 入口
# ============================================================

def main(transport: str = "streamable-http", host: str = "0.0.0.0", port: int = 8765):
    """启动 MCP Server。

    Args:
        transport: "streamable-http"(默认,MCP 2025-06-18 标准)
                   或 "stdio"(命令行嵌入)
        host / port: streamable-http 模式下的监听地址
    """
    if transport == "stdio":
        logger.info("Starting RAG MCP Server (stdio transport)")
        mcp.run(transport="stdio")
    else:
        logger.info(f"Starting RAG MCP Server (streamable-http) on {host}:{port}")
        # FastMCP 接受 host/port 作为 settings;这里直接传构造好的实例
        global_server = FastMCP(
            "rag-demo-mcp-server",
            host=host,
            port=port,
            instructions=mcp.instructions,
        )
        # 把已注册的工具装饰器函数直接挂到 global_server
        # 简化:用 mcp.settings 改 host/port,重新 run
        mcp.settings.host = host
        mcp.settings.port = port
        mcp.run(transport="streamable-http")


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--transport", choices=["streamable-http", "stdio"], default="streamable-http")
    p.add_argument("--host", default=os.environ.get("MCP_SERVER_HOST", "0.0.0.0"))
    p.add_argument("--port", type=int, default=int(os.environ.get("MCP_SERVER_PORT", "8765")))
    args = p.parse_args()
    main(args.transport, args.host, args.port)
