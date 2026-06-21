"""
RAG Pipeline 核心流程
======================
串联所有模块，实现完整的 RAG 问答链路：

    用户问题
       ↓
    Embedding 编码
       ↓
    Milvus 向量检索 TopK
       ↓
    Rerank 重排序
       ↓
    取 TopN
       ↓
    构建上下文 (Context)
       ↓
    LLM 生成答案
       ↓
    返回答案 + 引用来源

====================================================================
⚠️ LLM 占位符说明:
  需要配置 config.py 中的 LLM_API_KEY / LLM_API_BASE / LLM_MODEL_NAME
  支持任何 OpenAI 兼容接口（DashScope, DeepSeek, vLLM 等）
====================================================================
"""

import os
import threading
import time
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field

from .config import (
    LLM_MODEL_NAME,
    LLM_API_KEY,
    LLM_API_BASE,
    LLM_TEMPERATURE,
    LLM_MAX_TOKENS,
    SEARCH_TOP_K,
    RERANK_TOP_N,
)
from .loader import load_document, load_directory
from .chunker import split_documents, Chunk
from .embedding import EmbeddingModel
from .milvus_store import MilvusStore
from .reranker import Reranker
from . import db


@dataclass
class Citation:
    """引用来源"""
    filename: str
    source: str
    page_number: int
    chunk_index: int
    text: str
    score: float
    rerank_score: Optional[float] = None


@dataclass
class RAGResponse:
    """RAG 回答结果"""
    question: str          # 原始问题
    answer: str            # LLM 生成的答案
    citations: List[Citation] = field(default_factory=list)  # 引用来源
    search_count: int = 0  # 向量检索召回数量
    rerank_count: int = 0  # Rerank 后数量
    timing: Dict[str, float] = field(default_factory=dict)  # 各阶段耗时(ms)


class RAGPipeline:
    """RAG 完整流程管理器"""

    def __init__(self):
        print("=" * 60)
        print("  RAG Demo Pipeline 初始化")
        print("=" * 60)

        # 1. 初始化 Embedding 模型
        print("\n[1/4] 初始化 Embedding 模型...")
        self.embedding_model = EmbeddingModel()

        # 2. 初始化 Milvus
        print("\n[2/4] 连接 Milvus...")
        self.store = MilvusStore(dimension=self.embedding_model.dimension)

        # 3. 初始化 Reranker
        print("\n[3/4] 初始化 Reranker...")
        self.reranker = Reranker()

        # 4. 初始化 SQLite
        print("\n[4/4] 初始化 SQLite 持久化...")
        db.init_db()

        # LLM 客户端（延迟初始化）
        self._llm_client = None

        # 后台预热：让模型在第一个 query 之前加载完成,避免冷启动拉低首次延迟。
        # 用 daemon 线程,不阻塞 startup;预热失败也不影响主链路。
        self._warmup_started = False
        self._schedule_warmup()

        print("\n" + "=" * 60)
        print("  Pipeline 初始化完成！")
        print("=" * 60)

    def _schedule_warmup(self):
        """起一个后台线程跑一次空推理,触发模型加载。"""
        if self._warmup_started:
            return
        self._warmup_started = True
        t = threading.Thread(target=self._warmup, daemon=True, name="rag-warmup")
        t.start()

    def _warmup(self):
        """
        模型预热。预热失败不抛异常 —— 主链路第一次 query 时仍会触发模型加载,
        只是没享受到预热收益。
        """
        try:
            t0 = time.perf_counter()
            self.embedding_model.encode_query("warmup")
            emb_dt = (time.perf_counter() - t0) * 1000
            print(f"  [Warmup] Embedding 预热完成 ({emb_dt:.0f}ms)")
        except Exception as e:
            print(f"  [Warmup] Embedding 预热失败(忽略): {e}")

        try:
            rerank_model = getattr(self.reranker, "_model", None)
            if self.reranker.mode == "cross_encoder" and rerank_model is not None:
                t0 = time.perf_counter()
                warmup_pairs = [("warmup query", "warmup document")]
                backend = getattr(self.reranker, "_backend", "sentence_transformers")
                if backend == "openvino":
                    self.reranker._ov_predict(warmup_pairs)
                else:
                    rerank_model.predict(warmup_pairs, batch_size=2)
                rerank_dt = (time.perf_counter() - t0) * 1000
                print(f"  [Warmup] Reranker 预热完成 ({rerank_dt:.0f}ms, backend={backend})")
        except Exception as e:
            print(f"  [Warmup] Reranker 预热失败(忽略): {e}")

    def _get_llm_client(self):
        """延迟初始化 LLM 客户端。"""
        if self._llm_client is None:
            try:
                from openai import OpenAI
                self._llm_client = OpenAI(api_key=LLM_API_KEY, base_url=LLM_API_BASE)
            except ImportError:
                raise ImportError("请安装 openai: pip install openai")
        return self._llm_client

    # ============================================================
    # 知识库管理：文档导入
    # ============================================================

    def ingest_file(self, filepath: str) -> Dict[str, Any]:
        """导入单个文件到知识库。"""
        print(f"\n{'─' * 40}")
        print(f"导入文件: {filepath}")
        print(f"{'─' * 40}")

        # 1. 加载文档
        print("\n[步骤 1] 文档解析...")
        doc = load_document(filepath)
        print(f"  已解析: {doc.filename} ({doc.file_type})")

        # 2. 分块
        print("\n[步骤 2] 文本分块...")
        chunks = split_documents([doc])

        # 3. 向量化
        print("\n[步骤 3] Embedding 向量化...")
        texts = [c.text for c in chunks]
        embeddings = self.embedding_model.encode(texts)
        print(f"  已向量化 {len(embeddings)} 个 chunk")

        # 4. 写入 Milvus
        print("\n[步骤 4] 写入 Milvus...")
        count = self.store.insert_chunks(chunks, embeddings)

        # 5. 记录到 SQLite
        file_size = os.path.getsize(filepath) if os.path.isfile(filepath) else 0
        record_id = db.add_record(
            filename=doc.filename,
            file_type=doc.file_type,
            file_size=file_size,
            chunks=len(chunks),
            status="completed",
            message=f"成功导入 {len(chunks)} 个片段",
            source_path=filepath,
        )
        print(f"  [DB] 已记录导入记录 (id={record_id})")

        return {
            "filename": doc.filename,
            "file_type": doc.file_type,
            "chunks": len(chunks),
            "inserted": count,
            "status": "completed",
            "record_id": record_id,
        }

    def ingest_directory(self, dirpath: str) -> Dict[str, Any]:
        """导入整个目录的文件到知识库。"""
        print(f"\n{'─' * 40}")
        print(f"导入目录: {dirpath}")
        print(f"{'─' * 40}")

        # 1. 加载所有文档
        print("\n[步骤 1] 扫描并解析文档...")
        docs = load_directory(dirpath)
        if not docs:
            return {"status": "empty", "message": "未找到支持的文档"}

        # 2. 分块
        print("\n[步骤 2] 文本分块...")
        chunks = split_documents(docs)

        # 3. 向量化
        print("\n[步骤 3] Embedding 向量化...")
        texts = [c.text for c in chunks]
        embeddings = self.embedding_model.encode(texts)

        # 4. 写入 Milvus
        print("\n[步骤 4] 写入 Milvus...")
        count = self.store.insert_chunks(chunks, embeddings)

        # 5. 记录到 SQLite（按文件分组统计）
        chunks_per_file: Dict[str, int] = {}
        for c in chunks:
            fn = c.filename
            chunks_per_file[fn] = chunks_per_file.get(fn, 0) + 1
        for doc in docs:
            source_path = doc.source or ""
            file_size = os.path.getsize(source_path) if source_path and os.path.isfile(source_path) else 0
            db.add_record(
                filename=doc.filename,
                file_type=doc.file_type,
                file_size=file_size,
                chunks=chunks_per_file.get(doc.filename, 0),
                status="completed",
                message=f"批量导入 - {chunks_per_file.get(doc.filename, 0)} 个片段",
                source_path=source_path,
            )
        print(f"  [DB] 已记录 {len(docs)} 条导入记录")

        return {
            "files": len(docs),
            "chunks": len(chunks),
            "inserted": count,
            "status": "completed",
        }

    # ============================================================
    # RAG 问答
    # ============================================================

    def query(self, question: str) -> RAGResponse:
        """
        执行 RAG 问答。

        完整链路:
        Query → Embedding → Milvus TopK → Rerank TopN → Context → LLM → Answer
        """
        print(f"\n{'─' * 40}")
        print(f"问题: {question}")
        print(f"{'─' * 40}")

        timing: Dict[str, float] = {}

        # Step 1: Query Embedding
        print("\n[RAG-1] Query Embedding...")
        t0 = time.perf_counter()
        query_embedding = self.embedding_model.encode_query(question)
        timing["embed"] = round((time.perf_counter() - t0) * 1000, 1)
        print(f"  耗时 {timing['embed']}ms")

        # Step 2: 向量检索 TopK
        print(f"\n[RAG-2] Milvus 向量检索 (Top-{SEARCH_TOP_K})...")
        t0 = time.perf_counter()
        hits = self.store.search(query_embedding, top_k=SEARCH_TOP_K)
        timing["retrieve"] = round((time.perf_counter() - t0) * 1000, 1)
        print(f"  召回 {len(hits)} 条结果，耗时 {timing['retrieve']}ms")

        if not hits:
            self._record_metric(
                question=question,
                timing=timing,
                search_count=0,
                search_requested=SEARCH_TOP_K,
                rerank_count=0,
                status="ok",
            )
            return RAGResponse(
                question=question,
                answer="抱歉，知识库中未找到与您问题相关的信息。",
                citations=[],
                search_count=0,
                rerank_count=0,
                timing=timing,
            )

        # Step 3: Rerank 重排序
        print(f"\n[RAG-3] Rerank 重排序 (保留 Top-{RERANK_TOP_N})...")
        t0 = time.perf_counter()
        reranked = self.reranker.rerank(question, hits, top_n=RERANK_TOP_N)
        timing["rerank"] = round((time.perf_counter() - t0) * 1000, 1)
        print(f"  精选 {len(reranked)} 条高质量片段，耗时 {timing['rerank']}ms")

        # Step 4: 构建引用来源
        citations = []
        for hit in reranked:
            citations.append(Citation(
                filename=hit["filename"],
                source=hit["source"],
                page_number=hit.get("page_number", 0),
                chunk_index=hit.get("chunk_index", 0),
                text=hit["text"],
                score=hit.get("score", 0),
                rerank_score=hit.get("rerank_score"),
            ))

        # Step 5: 构建上下文 + LLM 生成
        print("\n[RAG-4] LLM 生成答案...")
        context = self._build_context(reranked)
        t0 = time.perf_counter()
        answer = self._generate_answer(question, context)
        timing["llm"] = round((time.perf_counter() - t0) * 1000, 1)
        print(f"  耗时 {timing['llm']}ms")

        timing["total"] = round(
            sum(v for k, v in timing.items()), 1
        )

        self._record_metric(
            question=question,
            timing=timing,
            search_count=len(hits),
            search_requested=SEARCH_TOP_K,
            rerank_count=len(reranked),
            status="ok",
        )

        return RAGResponse(
            question=question,
            answer=answer,
            citations=citations,
            search_count=len(hits),
            rerank_count=len(reranked),
            timing=timing,
        )

    def _record_metric(
        self,
        question: str,
        timing: Dict[str, float],
        search_count: int,
        rerank_count: int,
        search_requested: int = 0,
        status: str = "ok",
        error: Optional[str] = None,
    ):
        """把一次 query 的耗时落库。失败不抛异常,避免影响主链路。"""
        try:
            db.add_query_metric(
                question_len=len(question),
                search_count=search_count,
                search_requested=search_requested,
                rerank_count=rerank_count,
                embed_ms=float(timing.get("embed", 0) or 0),
                retrieve_ms=float(timing.get("retrieve", 0) or 0),
                rerank_ms=float(timing.get("rerank", 0) or 0),
                llm_ms=float(timing.get("llm", 0) or 0),
                total_ms=float(timing.get("total", 0) or 0),
                status=status,
                error=error,
            )
        except Exception as e:
            print(f"  [Metrics] 落库失败(忽略): {e}")

    def _build_context(self, reranked: List[Dict[str, Any]]) -> str:
        """将 reranked 结果构建为上下文字符串。"""
        parts = []
        for i, hit in enumerate(reranked, 1):
            source_info = hit["filename"]
            if hit.get("page_number"):
                source_info += f" 第{hit['page_number']}页"
            parts.append(f"[参考来源 {i}] {source_info}\n{hit['text']}")
        return "\n\n".join(parts)

    def _generate_answer(self, question: str, context: str) -> str:
        """
        ============================================================
        LLM 生成答案占位符
        ============================================================
        使用 OpenAI 兼容接口调用 LLM，拼接上下文和问题。
        支持：DashScope / DeepSeek / vLLM / Ollama / OpenAI 等。
        ============================================================
        """
        client = self._get_llm_client()

        system_prompt = """你是一个专业的知识库问答助手。请严格基于提供的参考来源回答用户问题。

规则：
1. 只使用参考来源中的信息作答，不要编造内容
2. 如果参考来源中没有足够信息，明确告知用户
3. 回答要准确、简洁、专业
4. 在回答中标注引用的来源编号，如 [1]、[2]"""

        user_prompt = f"""参考来源：
{context}

用户问题：{question}

请基于以上参考来源回答问题："""

        try:
            response = client.chat.completions.create(
                model=LLM_MODEL_NAME,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=LLM_TEMPERATURE,
                max_tokens=LLM_MAX_TOKENS,
            )
            return response.choices[0].message.content
        except Exception as e:
            return f"[LLM 调用失败] {e}\n\n请检查 config.py 中的 LLM 配置。"

    # ============================================================
    # 工具方法
    # ============================================================

    def get_stats(self) -> Dict[str, Any]:
        """获取知识库统计信息。"""
        return self.store.get_stats()

    def reset(self):
        """清空知识库（重建 collection）。"""
        self.store.drop_collection()
        self.store._ensure_collection()
        print("  [Pipeline] 知识库已重置")
