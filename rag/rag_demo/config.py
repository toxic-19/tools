"""
RAG Demo 配置文件
================
所有可配置项集中管理，embedding/LLM 模型均以占位符形式标注。

环境变量加载优先级:
  1. 系统环境变量
  2. .env 文件（项目根目录）
  3. 下方默认值
"""

import os
from pathlib import Path

# 自动加载 .env（如果存在）
# uv run --env-file .env 也会设置环境变量，此处作为 fallback
try:
    from dotenv import load_dotenv
    _project_root = Path(__file__).parent.parent
    _env_file = _project_root / ".env"
    if _env_file.exists():
        load_dotenv(_env_file, override=False)
except ImportError:
    pass  # python-dotenv 未安装，仅依赖系统环境变量

# ============================================================
# Milvus 连接配置（对应 D:\milvus\docker-compose.yml 部署）
# ============================================================
MILVUS_HOST = os.getenv("MILVUS_HOST", "localhost")
MILVUS_PORT = int(os.getenv("MILVUS_PORT", "19530"))
MILVUS_COLLECTION = os.getenv("MILVUS_COLLECTION", "rag_demo")

# ============================================================
# Embedding 模型配置（占位符 —— 按需替换）
# ============================================================
# 推荐模型（任选其一）:
#   - BAAI/bge-m3                    （中文多语言，推荐）
#   - BAAI/bge-large-zh-v1.5         （中文专用）
#   - text-embedding-3-large          （OpenAI API）
#   - Qwen/Qwen3-Embedding            （通义千问）
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "BAAI/bge-m3")
EMBEDDING_DIMENSION = int(os.getenv("EMBEDDING_DIMENSION", "1024"))  # bge-m3 默认 1024
EMBEDDING_API_KEY = os.getenv("EMBEDDING_API_KEY", "")  # 若使用 API 类模型需填入
EMBEDDING_API_BASE = os.getenv("EMBEDDING_API_BASE", "")  # 可选：自定义 API 地址
EMBEDDING_BATCH_SIZE = int(os.getenv("EMBEDDING_BATCH_SIZE", "32"))

# ============================================================
# LLM 大模型配置（占位符 —— 按需替换）
# ============================================================
# 推荐: 你现有的任何对话模型，如 Qwen、DeepSeek、GPT 等
LLM_MODEL_NAME = os.getenv("LLM_MODEL_NAME", "qwen/qwen-2.5-72b-instruct")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_API_BASE = os.getenv("LLM_API_BASE", "https://api.openai.com/v1")  # OpenAI 兼容接口
LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.3"))
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "2048"))

# ============================================================
# Rerank 模型配置（占位符）
# ============================================================
# 方案一：本地 Cross-Encoder（推荐 bge-reranker-large）
# 方案二：LLM 打分（调用上方 LLM 进行相关性评分）
RERANK_MODE = os.getenv("RERANK_MODE", "cross_encoder")  # "cross_encoder" | "llm" | "none"
RERANK_MODEL_NAME = os.getenv("RERANK_MODEL_NAME", "BAAI/bge-reranker-base")

# ============================================================
# 检索与分块配置
# ============================================================
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "500"))         # 每个 chunk 的最大字符数
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "100"))   # chunk 之间的重叠字符数
SEARCH_TOP_K = int(os.getenv("SEARCH_TOP_K", "10"))       # 向量检索召回数量(从 20 降到 10,降低短查询的噪声召回)
RERANK_TOP_N = int(os.getenv("RERANK_TOP_N", "5"))        # Rerank 后保留的数量
# 相似度阈值: 0.0 = 不做任何过滤,会召回到语义沾边但主题无关的文档;
# 0.35 是经验值,适合 nomic-embed-text + COSINE 距离 + 中文短查询场景。
# 如果召回不足可降到 0.25,召回太杂可提到 0.45。
SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.35"))

# ============================================================
# 文档存储路径
# ============================================================
DATA_DIR = os.getenv("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "..", "uploads"))
