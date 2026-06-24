"""RAG-as-MCP-Server 包。

将 rag_demo.pipeline.RAGPipeline 的核心能力以标准 MCP 工具的形式对外暴露,
供 Agent Hub 或其他 MCP 客户端调用。

工具列表:
  - rag_query         完整 RAG 问答(Embedding → Milvus → Rerank → LLM)
  - rag_search        仅检索(不调 LLM,返回文档片段 + 分数)
  - rag_ingest_file   导入单个文件到知识库
  - rag_stats         知识库统计(行数 / 维度 / collection)
  - rag_health        健康检查(连 Milvus / LLM 是否就绪)

Transport:
  - HTTP(默认 streamable-http):mcp.run(transport="streamable-http")
  - stdio:mcp.run(transport="stdio")
"""
