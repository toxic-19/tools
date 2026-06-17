"""
FastAPI 接口
=============
提供 RESTful API 用于 RAG 系统操作：

  POST /api/ingest/file       上传并导入单个文件
  POST /api/ingest/directory  导入整个目录
  POST /api/ingest/default    导入 data/ 默认数据
  POST /api/query             RAG 问答
  GET  /api/stats             知识库统计
  POST /api/reset             清空知识库
  GET  /api/health            健康检查
  GET  /api/records           导入记录列表
  GET  /api/records/summary   导入统计摘要
  DELETE /api/records/{id}    删除导入记录

  POST /api/conversations          创建会话
  GET  /api/conversations          会话列表
  GET  /api/conversations/{id}     获取单个会话
  PUT  /api/conversations/{id}     重命名会话
  DELETE /api/conversations/{id}   删除会话及消息

  GET  /api/chat/history           按会话获取聊天记录
  POST /api/chat/history           保存聊天消息（按会话）
  DELETE /api/chat/history         清空聊天记录（按会话）

前端项目: ../frontend (Vite dev:3000 → proxy /api → :8000)
生产部署: vite build → ../static，由本服务托管

启动方式:
  uvicorn rag_demo.server:app --host 0.0.0.0 --port 8000
"""

import os
import json
import traceback
from typing import Optional, List
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .config import UPLOAD_DIR, DATA_DIR, SEARCH_TOP_K, RERANK_TOP_N
from . import db

# ============================================================
# 路径常量
# ============================================================

_PROJECT_ROOT = Path(__file__).parent.parent
_STATIC_DIR = _PROJECT_ROOT / "static"  # vite build 输出目录

# ============================================================
# FastAPI App
# ============================================================

app = FastAPI(
    title="RAG Demo API",
    description="知识库问答系统 - RESTful API",
    version="2.1.0",
)

# CORS（开发环境允许全部 — Vite dev server 在 :3000）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pipeline 延迟初始化
_pipeline = None


def get_pipeline():
    global _pipeline
    if _pipeline is None:
        from .pipeline import RAGPipeline
        _pipeline = RAGPipeline()
    return _pipeline


@app.on_event("startup")
async def startup_event():
    db.init_db()
    print("  [Server] SQLite 持久化已就绪")
    if _STATIC_DIR.exists():
        print(f"  [Server] 前端静态文件: {_STATIC_DIR}")
    else:
        print(f"  [Server] 前端未构建 ({_STATIC_DIR} 不存在)，仅 API 可用")


# ============================================================
# 请求/响应模型
# ============================================================

class QueryRequest(BaseModel):
    question: str
    top_k: Optional[int] = SEARCH_TOP_K
    rerank_top_n: Optional[int] = RERANK_TOP_N


class QueryResponse(BaseModel):
    question: str
    answer: str
    citations: list
    search_count: int
    rerank_count: int
    timing: Optional[dict] = None


class IngestResponse(BaseModel):
    filename: str
    file_type: str
    chunks: int
    inserted: int
    status: str
    record_id: Optional[int] = None


class IngestDirRequest(BaseModel):
    directory: str


class ChatMessageItem(BaseModel):
    role: str  # "user" | "assistant"
    content: str
    citations: Optional[list] = None
    search_count: Optional[int] = None
    rerank_count: Optional[int] = None


class SaveChatRequest(BaseModel):
    conversation_id: int
    messages: List[ChatMessageItem]


class CreateConversationRequest(BaseModel):
    title: Optional[str] = "新对话"


class RenameConversationRequest(BaseModel):
    title: str


# ============================================================
# API 路由 — 知识库管理
# ============================================================

@app.get("/api/health")
async def health():
    """健康检查"""
    try:
        pipeline = get_pipeline()
        stats = pipeline.get_stats()
        return {"status": "ok", "milvus": "connected", "stats": stats}
    except Exception as e:
        return {"status": "degraded", "error": str(e)}


@app.post("/api/ingest/file", response_model=IngestResponse)
async def ingest_file(file: UploadFile = File(...)):
    """上传并导入文件到知识库。支持: .txt, .md, .pdf, .docx"""
    allowed_exts = {".txt", ".md", ".pdf", ".docx"}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed_exts:
        raise HTTPException(400, f"不支持的文件格式: {ext}，支持: {allowed_exts}")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    save_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(save_path, "wb") as f:
        content = await file.read()
        f.write(content)

    try:
        pipeline = get_pipeline()
        result = pipeline.ingest_file(save_path)
        return IngestResponse(**result)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"导入失败: {str(e)}")


@app.post("/api/ingest/directory")
async def ingest_directory(req: IngestDirRequest):
    """导入整个目录的文件到知识库"""
    if not os.path.isdir(req.directory):
        raise HTTPException(400, f"目录不存在: {req.directory}")
    try:
        pipeline = get_pipeline()
        return pipeline.ingest_directory(req.directory)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"导入失败: {str(e)}")


@app.post("/api/ingest/default")
async def ingest_default_data():
    """导入 data/ 目录下的默认数据"""
    if not os.path.isdir(DATA_DIR):
        raise HTTPException(400, f"数据目录不存在: {DATA_DIR}")
    try:
        pipeline = get_pipeline()
        return pipeline.ingest_directory(DATA_DIR)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"导入失败: {str(e)}")


@app.post("/api/query", response_model=QueryResponse)
async def query(req: QueryRequest):
    """RAG 知识库问答: Query → Embedding → Milvus TopK → Rerank → LLM → Answer"""
    if not req.question.strip():
        raise HTTPException(400, "问题不能为空")
    try:
        pipeline = get_pipeline()
        response = pipeline.query(req.question)
        return QueryResponse(
            question=response.question,
            answer=response.answer,
            citations=[
                {
                    "filename": c.filename,
                    "source": c.source,
                    "page_number": c.page_number,
                    "chunk_index": c.chunk_index,
                    "text": c.text,
                    "score": round(c.score, 4),
                    "rerank_score": round(c.rerank_score, 4) if c.rerank_score is not None else None,
                }
                for c in response.citations
            ],
            search_count=response.search_count,
            rerank_count=response.rerank_count,
            timing=response.timing,
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"查询失败: {str(e)}")


@app.get("/api/stats")
async def stats():
    """获取知识库统计信息"""
    try:
        pipeline = get_pipeline()
        return pipeline.get_stats()
    except Exception as e:
        raise HTTPException(500, f"获取统计失败: {str(e)}")


@app.post("/api/reset")
async def reset():
    """清空知识库、导入记录、所有会话及聊天记录（谨慎使用）"""
    try:
        pipeline = get_pipeline()
        pipeline.reset()
        db.clear_records()
        # 删除所有会话（级联删除消息）
        convs = db.get_conversations()
        for c in convs:
            db.delete_conversation(c["id"])
        return {"status": "ok", "message": "知识库、导入记录、会话及聊天记录已清空"}
    except Exception as e:
        raise HTTPException(500, f"重置失败: {str(e)}")


# ============================================================
# API 路由 — 导入记录
# ============================================================

@app.get("/api/records")
async def get_records(limit: int = 100, offset: int = 0):
    """获取导入记录列表（按时间倒序），支持分页"""
    try:
        records = db.get_records(limit=limit, offset=offset)
        total = db.get_record_count()
        return {"records": records, "total": total, "limit": limit, "offset": offset}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"获取导入记录失败: {str(e)}")


@app.get("/api/records/summary")
async def get_records_summary():
    """获取导入统计摘要"""
    try:
        return db.get_stats_summary()
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"获取统计摘要失败: {str(e)}")


@app.delete("/api/records/{record_id}")
async def delete_record(record_id: int):
    """删除一条导入记录（仅删数据库记录，不删 Milvus 向量）"""
    try:
        db.delete_record(record_id)
        return {"status": "ok", "message": f"记录 {record_id} 已删除"}
    except Exception as e:
        raise HTTPException(500, f"删除记录失败: {str(e)}")


# ============================================================
# API 路由 — 会话管理
# ============================================================

@app.post("/api/conversations")
async def create_conversation(req: CreateConversationRequest):
    """创建新会话"""
    try:
        conv = db.create_conversation(title=req.title or "新对话")
        return {"status": "ok", "conversation": conv}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"创建会话失败: {str(e)}")


@app.get("/api/conversations")
async def list_conversations():
    """获取所有会话列表（按更新时间倒序）"""
    try:
        convs = db.get_conversations()
        return {"conversations": convs, "total": len(convs)}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"获取会话列表失败: {str(e)}")


@app.get("/api/conversations/{conv_id}")
async def get_conversation(conv_id: int):
    """获取单个会话信息"""
    try:
        conv = db.get_conversation(conv_id)
        if not conv:
            raise HTTPException(404, f"会话 {conv_id} 不存在")
        return {"conversation": conv}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"获取会话失败: {str(e)}")


@app.put("/api/conversations/{conv_id}")
async def rename_conversation(conv_id: int, req: RenameConversationRequest):
    """重命名会话"""
    try:
        conv = db.get_conversation(conv_id)
        if not conv:
            raise HTTPException(404, f"会话 {conv_id} 不存在")
        db.rename_conversation(conv_id, req.title)
        return {"status": "ok", "message": f"会话已重命名为: {req.title}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"重命名会话失败: {str(e)}")


@app.delete("/api/conversations/{conv_id}")
async def delete_conversation(conv_id: int):
    """删除会话及其所有消息"""
    try:
        conv = db.get_conversation(conv_id)
        if not conv:
            raise HTTPException(404, f"会话 {conv_id} 不存在")
        msg_count = db.delete_conversation(conv_id)
        return {"status": "ok", "message": f"会话 {conv_id} 已删除", "messages_deleted": msg_count}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"删除会话失败: {str(e)}")


# ============================================================
# API 路由 — 聊天记录持久化（按会话）
# ============================================================

@app.get("/api/chat/history")
async def get_chat_history(conversation_id: int, limit: int = 200):
    """
    获取指定会话的聊天记录（按时间正序）。

    参数: conversation_id (必填)
    """
    try:
        messages = db.get_chat_messages(conversation_id=conversation_id, limit=limit)
        total = db.get_chat_message_count(conversation_id=conversation_id)
        return {"messages": messages, "total": total}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"获取聊天记录失败: {str(e)}")


@app.post("/api/chat/history")
async def save_chat_messages(req: SaveChatRequest):
    """
    保存聊天消息到指定会话（通常一次 Q&A 保存 user + assistant 两条）。
    """
    try:
        conv = db.get_conversation(req.conversation_id)
        if not conv:
            raise HTTPException(404, f"会话 {req.conversation_id} 不存在")

        ids = []
        for msg in req.messages:
            citations_json = json.dumps(msg.citations, ensure_ascii=False) if msg.citations else None
            mid = db.add_chat_message(
                role=msg.role,
                content=msg.content,
                conversation_id=req.conversation_id,
                citations=citations_json,
                search_count=msg.search_count,
                rerank_count=msg.rerank_count,
            )
            ids.append(mid)
        return {"status": "ok", "ids": ids, "count": len(ids)}
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"保存聊天记录失败: {str(e)}")


@app.delete("/api/chat/history")
async def clear_chat_history(conversation_id: Optional[int] = None):
    """清空聊天记录（可按会话，不传则清空全部）"""
    try:
        count = db.clear_chat_messages(conversation_id=conversation_id)
        return {"status": "ok", "deleted": count}
    except Exception as e:
        raise HTTPException(500, f"清空聊天记录失败: {str(e)}")


# ============================================================
# 前端静态文件托管（生产部署）
# ============================================================

# 挂载 vite build 产物目录（放在 API 路由之后，不影响 /api/*）
# html=True 自动为 /vite.svg 等根文件提供服务，SPA 路由回退到 index.html
if _STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(_STATIC_DIR), html=True), name="frontend")
else:
    @app.get("/")
    async def serve_index():
        """无前端构建产物时的提示"""
        return {"message": "RAG Demo API is running. Frontend not built — run `npm run build` in ../frontend"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
