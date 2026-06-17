"""
Embedding 模块
===============
提供文本向量化能力，支持本地模型和 API 模型两种方式。

====================================================================
⚠️ 占位符说明 —— 使用前请配置:
====================================================================
方式一：本地模型（sentence-transformers）
    pip install sentence-transformers
    设置 EMBEDDING_MODEL_NAME = "BAAI/bge-m3"
    首次运行会自动下载模型权重（约 2GB）

方式二：OpenAI 兼容 API
    pip install openai
    设置 EMBEDDING_API_KEY / EMBEDDING_API_BASE
    设置 EMBEDDING_MODEL_NAME = "text-embedding-3-large" 或对应模型名
====================================================================
"""

from typing import List
import numpy as np

from .config import (
    EMBEDDING_MODEL_NAME,
    EMBEDDING_DIMENSION,
    EMBEDDING_API_KEY,
    EMBEDDING_API_BASE,
    EMBEDDING_BATCH_SIZE,
)


class EmbeddingModel:
    """Embedding 模型封装，自动判断使用本地模型还是 API。"""

    def __init__(self):
        self._model = None
        self._mode = None  # "local" | "api"
        self._init_model()

    def _init_model(self):
        """初始化模型（延迟加载，首次调用时触发）。"""
        # 策略一：如果提供了 API Key，走 API 模式
        if EMBEDDING_API_KEY:
            self._init_api()
        else:
            self._init_local()

    def _init_local(self):
        """
        ============================================================
        本地 Embedding 模型占位符
        ============================================================
        使用 sentence-transformers 加载本地模型。
        推荐模型：
          - BAAI/bge-m3         (多语言，1024 维)
          - BAAI/bge-large-zh-v1.5  (中文，1024 维)
        ============================================================
        """
        try:
            from sentence_transformers import SentenceTransformer
            print(f"  [Embedding] 加载本地模型: {EMBEDDING_MODEL_NAME}")
            self._model = SentenceTransformer(EMBEDDING_MODEL_NAME)
            self._mode = "local"
            print(f"  [Embedding] 模型加载完成，维度: {self._model.get_sentence_embedding_dimension()}")
        except ImportError:
            print("  [Embedding] sentence-transformers 未安装，尝试 API 模式...")
            self._init_api()
        except Exception as e:
            print(f"  [Embedding] 本地模型加载失败: {e}")
            print("  [Embedding] 回退到 API 模式...")
            self._init_api()

    def _init_api(self):
        """
        ============================================================
        API Embedding 模型占位符
        ============================================================
        使用 OpenAI 兼容 API 获取 embedding。
        适用于：
          - OpenAI text-embedding-3-large
          - 阿里云 DashScope
          - 其他兼容 OpenAI 接口的服务
        ============================================================
        """
        try:
            from openai import OpenAI
            if not EMBEDDING_API_KEY:
                raise ValueError(
                    "未配置 EMBEDDING_API_KEY。\n"
                    "请设置环境变量或在 config.py 中填入。\n"
                    "或者安装 sentence-transformers 使用本地模型:\n"
                    "  pip install sentence-transformers"
                )
            self._model = OpenAI(api_key=EMBEDDING_API_KEY, base_url=EMBEDDING_API_BASE or None)
            self._mode = "api"
            print(f"  [Embedding] API 模式: {EMBEDDING_MODEL_NAME} @ {EMBEDDING_API_BASE}")
        except ImportError:
            raise ImportError(
                "需要安装 openai 或 sentence-transformers 之一:\n"
                "  pip install openai\n"
                "  pip install sentence-transformers"
            )

    def encode(self, texts: List[str]) -> List[List[float]]:
        """
        批量将文本编码为向量。

        Args:
            texts: 文本列表

        Returns:
            向量列表，每个向量是 float 列表
        """
        if self._mode == "local":
            return self._encode_local(texts)
        else:
            return self._encode_api(texts)

    def encode_query(self, query: str) -> List[float]:
        """编码单条查询文本。"""
        results = self.encode([query])
        return results[0]

    def _encode_local(self, texts: List[str]) -> List[List[float]]:
        """本地模型编码。"""
        # bge 系列模型推荐在 query 前加 "为这个句子生成表示以用于检索中文文档：" 前缀
        # 但 document 不需要加前缀（asymmetric retrieval）
        embeddings = self._model.encode(
            texts,
            batch_size=EMBEDDING_BATCH_SIZE,
            normalize_embeddings=True,
            show_progress_bar=len(texts) > 100,
        )
        return embeddings.tolist()

    def _encode_api(self, texts: List[str]) -> List[List[float]]:
        """API 编码，按 batch 分批请求。"""
        all_embeddings = []
        for i in range(0, len(texts), EMBEDDING_BATCH_SIZE):
            batch = texts[i:i + EMBEDDING_BATCH_SIZE]
            response = self._model.embeddings.create(
                model=EMBEDDING_MODEL_NAME,
                input=batch,
            )
            batch_embeddings = [item.embedding for item in response.data]
            all_embeddings.extend(batch_embeddings)
        return all_embeddings

    @property
    def dimension(self) -> int:
        """返回向量维度。"""
        if self._mode == "local":
            return self._model.get_sentence_embedding_dimension()
        return EMBEDDING_DIMENSION
