# RAG Demo — 知识库问答系统

基于 **检索增强生成（Retrieval-Augmented Generation）** 的企业级知识库问答系统。  
支持多格式文档导入、语义向量检索、深度模型重排序、大模型生成回答，并提供完整的引用溯源能力。

---

## 核心架构

```
用户问题
   ↓
Embedding 编码（本地模型 / API）
   ↓
Milvus 向量检索 Top-K（粗排）
   ↓
Rerank 重排序 Top-N（精排：Cross-Encoder / LLM / OpenVINO）
   ↓
构建上下文 Prompt + 引用来源
   ↓
LLM 生成答案（OpenAI 兼容接口）
   ↓
返回答案 + 文档级引用（文件名、页码、原文片段）
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **后端框架** | FastAPI + Uvicorn |
| **向量数据库** | Milvus 2.4+（Docker 部署） |
| **Embedding** | BAAI/bge-m3（本地）/ OpenAI API |
| **Reranker** | BAAI/bge-reranker（OpenVINO GPU 加速 / CPU） |
| **LLM** | 兼容 OpenAI 接口（Qwen / DeepSeek / GPT 等） |
| **前端** | React 18 + Vite + TailwindCSS + TypeScript |
| **持久化** | SQLite（会话记录、导入记录、查询指标） |

---

## 项目结构

```
rag/
├── rag_demo/               # 后端核心模块
│   ├── config.py           # 统一配置管理（环境变量 / .env）
│   ├── loader.py           # 文档加载（TXT / MD / PDF / DOCX）
│   ├── chunker.py          # 递归语义分块（滑动窗口 + 重叠）
│   ├── embedding.py        # 向量化（本地模型 / API 双引擎）
│   ├── milvus_store.py     # Milvus 向量存储与检索
│   ├── reranker.py         # 重排序（Cross-Encoder / LLM / OpenVINO）
│   ├── pipeline.py         # RAG 完整问答链路
│   ├── server.py           # FastAPI 接口 + 静态资源托管
│   ├── db.py               # SQLite 持久化
│   └── cli.py              # 命令行交互界面
├── frontend/               # React 前端源码
├── static/                 # 前端构建产物（生产部署用）
├── data/                   # 待导入的知识库文档目录
├── uploads/                # 用户上传文件存储
├── run_server.py           # 一键启动 Web 服务
├── run_cli.py              # 一键启动 CLI
├── .env.example            # 环境变量配置示例
├── pyproject.toml          # Python 项目配置
└── requirements.txt        # pip 依赖清单（备用）
```

---

## 环境准备

### 1. 前置依赖

- **Python** ≥ 3.10
- **Node.js** ≥ 18（仅前端开发需要）
- **Docker**（运行 Milvus 向量数据库）

### 2. 启动 Milvus

确保 Docker 已运行，然后启动 Milvus 容器：

```bash
# 进入 Milvus docker-compose 目录
cd D:\milvus
docker compose up -d
```

验证 Milvus 是否就绪：

```bash
curl http://localhost:19530/v1/vector/collections
```

### 3. 安装 Python 依赖

**推荐使用 uv（更快）：**

```bash
cd rag

# 安装核心依赖
uv sync

# 如需使用本地 Embedding / Reranker 模型，额外安装：
uv sync --extra local
```

**备用 pip 方式：**

```bash
pip install -r requirements.txt

# 如需本地模型：
pip install sentence-transformers
```

### 4. 配置环境变量

```bash
# 复制示例配置
cp .env.example .env

# 编辑 .env 填入实际值
```

**必须配置的项：**

| 变量 | 说明 | 示例 |
|------|------|------|
| `LLM_API_KEY` | 大模型 API Key | `sk-xxx` |
| `LLM_API_BASE` | 大模型 API 地址 | `https://api.openai.com/v1` |
| `LLM_MODEL_NAME` | 大模型名称 | `qwen/qwen-2.5-72b-instruct` |

**Embedding 配置（二选一）：**

| 方式 | 需要的变量 |
|------|-----------|
| 本地模型（推荐） | `EMBEDDING_MODEL_NAME=BAAI/bge-m3`，需 `uv sync --extra local` |
| API 模式 | `EMBEDDING_API_KEY` + `EMBEDDING_API_BASE` + `EMBEDDING_MODEL_NAME` |

---

## 启动服务

### 方式一：Web 服务（推荐）

```bash
# 使用 uv
uv run run_server.py

# 或使用 uvicorn 直接启动
uvicorn rag_demo.server:app --host 0.0.0.0 --port 8000
```

启动后访问：
- **Web 界面**：http://localhost:8000
- **API 文档**：http://localhost:8000/docs

### 方式二：CLI 命令行

```bash
# 交互式问答（默认）
uv run run_cli.py

# 导入单个文件
uv run run_cli.py import 文件路径

# 导入 data/ 目录下所有文件
uv run run_cli.py import-dir

# 单次提问
uv run run_cli.py ask "你的问题"

# 查看知识库统计
uv run run_cli.py stats

# 清空知识库
uv run run_cli.py reset
```

---

## 前端开发

前端基于 React + Vite + TailwindCSS，开发模式下会代理 `/api` 请求到后端 `:8000`。

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器（端口 3000）
npm run dev

# 构建生产版本（输出到 ../static）
npm run build
```

---

## API 接口

### 知识库管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/ingest/file` | 上传并导入单个文件 |
| `POST` | `/api/ingest/directory` | 导入指定目录 |
| `POST` | `/api/ingest/default` | 导入 `data/` 默认目录 |
| `GET` | `/api/stats` | 知识库统计信息 |
| `POST` | `/api/reset` | 清空知识库 |
| `GET` | `/api/records` | 导入记录列表 |
| `GET` | `/api/records/summary` | 导入统计摘要 |
| `DELETE` | `/api/records/{id}` | 删除导入记录 |

### 问答与会话

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/query` | RAG 问答 |
| `POST` | `/api/conversations` | 创建会话 |
| `GET` | `/api/conversations` | 会话列表 |
| `PUT` | `/api/conversations/{id}` | 重命名会话 |
| `DELETE` | `/api/conversations/{id}` | 删除会话 |
| `GET` | `/api/chat/history` | 获取聊天记录 |
| `POST` | `/api/chat/history` | 保存聊天消息 |
| `DELETE` | `/api/chat/history` | 清空聊天记录 |

### 系统

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 健康检查 |

---

## 全部配置参数

以下参数均可通过 `.env` 文件或系统环境变量设置：

### Milvus 连接

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `MILVUS_HOST` | `localhost` | Milvus 服务地址 |
| `MILVUS_PORT` | `19530` | Milvus 服务端口 |
| `MILVUS_COLLECTION` | `rag_demo` | Collection 名称 |

### Embedding 模型

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `EMBEDDING_MODEL_NAME` | `BAAI/bge-m3` | 模型名称（本地或 API） |
| `EMBEDDING_DIMENSION` | `1024` | 向量维度 |
| `EMBEDDING_API_KEY` | 空 | API Key（留空则走本地模型） |
| `EMBEDDING_API_BASE` | 空 | API 地址 |
| `EMBEDDING_BATCH_SIZE` | `32` | 批量编码大小 |

### LLM 大模型

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `LLM_MODEL_NAME` | `qwen/qwen-2.5-72b-instruct` | 模型名称 |
| `LLM_API_KEY` | 空 | API Key |
| `LLM_API_BASE` | `https://api.openai.com/v1` | API 地址（兼容 OpenAI 接口） |
| `LLM_TEMPERATURE` | `0.3` | 生成温度（越低越稳定） |
| `LLM_MAX_TOKENS` | `2048` | 最大生成 Token 数 |

### Rerank 重排序

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `RERANK_MODE` | `cross_encoder` | 模式：`cross_encoder` / `llm` / `none` |
| `RERANK_MODEL_NAME` | `BAAI/bge-reranker-base` | Cross-Encoder 模型名称 |

### 检索与分块

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `CHUNK_SIZE` | `500` | 每个 chunk 最大字符数 |
| `CHUNK_OVERLAP` | `100` | chunk 间重叠字符数 |
| `SEARCH_TOP_K` | `10` | 向量检索粗排召回数量 |
| `RERANK_TOP_N` | `5` | Rerank 精排后保留数量 |
| `SIMILARITY_THRESHOLD` | `0.35` | 最低相似度阈值（低于此分数将被过滤） |

### 存储路径

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `DATA_DIR` | `./data` | 知识库文档目录 |
| `UPLOAD_DIR` | `./uploads` | 用户上传文件存储目录 |

---

## 支持的文档格式

| 格式 | 扩展名 | 解析方式 |
|------|--------|----------|
| 纯文本 | `.txt` | UTF-8 直读 |
| Markdown | `.md` | 纯文本处理 |
| PDF | `.pdf` | PyMuPDF 逐页提取，保留页码映射 |
| Word | `.docx` | python-docx 段落提取 |

---

## 常见问题

### Milvus 连接失败

```
无法连接 Milvus (http://localhost:19530)
```

确保 Docker 容器已启动：

```bash
cd D:\milvus
docker compose up -d
docker compose ps    # 确认 standalone 状态为 running
```

### Reranker 预热报错

如果看到 `'OVModelForSequenceClassification' object has no attribute 'predict'`，请确认已更新到最新代码。该问题已在 `pipeline.py` 中修复（OpenVINO 后端走独立的 `_ov_predict` 路径）。

### 首次启动模型下载慢

本地模型（如 `bge-m3` 约 2GB、`bge-reranker-large` 约 1.3GB）首次运行会自动从 HuggingFace 下载。如果下载缓慢，可配置镜像：

```bash
# .env 中添加
HF_ENDPOINT=https://hf-mirror.com
```

### 向量维度不匹配

切换 Embedding 模型后若维度变化，系统会自动检测并重建 Milvus Collection。也可手动重置：

```bash
uv run run_cli.py reset
```
