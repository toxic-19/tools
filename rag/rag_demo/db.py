"""
SQLite 本地持久化模块
======================
使用 SQLite 存储会话、聊天记录和导入记录，页面刷新后仍可恢复。
数据库文件: <项目根>/data/rag_demo.db
"""

import sqlite3
import os
import json
from datetime import datetime
from typing import List, Dict, Any, Optional
from contextlib import contextmanager

from .config import DATA_DIR


DB_PATH = os.path.join(DATA_DIR, "rag_demo.db")


def _ensure_db_dir():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


@contextmanager
def _get_conn():
    """获取数据库连接的上下文管理器。"""
    _ensure_db_dir()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    """初始化数据库表（幂等操作，含自动迁移）。"""
    with _get_conn() as conn:
        # ---- 导入记录表 ----
        conn.execute("""
            CREATE TABLE IF NOT EXISTS import_records (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                filename    TEXT NOT NULL,
                file_type   TEXT NOT NULL DEFAULT '',
                file_size   INTEGER DEFAULT 0,
                chunks      INTEGER DEFAULT 0,
                status      TEXT NOT NULL DEFAULT 'completed',
                message     TEXT DEFAULT '',
                source_path TEXT DEFAULT '',
                created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_records_created
            ON import_records(created_at DESC)
        """)

        # ---- 会话表 ----
        conn.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                title      TEXT NOT NULL DEFAULT '新对话',
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_conv_updated
            ON conversations(updated_at DESC)
        """)

        # ---- 聊天记录表 ----
        conn.execute("""
            CREATE TABLE IF NOT EXISTS chat_messages (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER DEFAULT NULL,
                role            TEXT NOT NULL,
                content         TEXT NOT NULL,
                citations       TEXT DEFAULT NULL,
                search_count    INTEGER DEFAULT NULL,
                rerank_count    INTEGER DEFAULT NULL,
                created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            )
        """)

        # ---- 自动迁移：为旧 chat_messages 添加 conversation_id 列 ----
        existing_cols = {row[1] for row in conn.execute("PRAGMA table_info(chat_messages)").fetchall()}
        if 'conversation_id' not in existing_cols:
            conn.execute("ALTER TABLE chat_messages ADD COLUMN conversation_id INTEGER DEFAULT NULL")
            # 为已有消息创建默认会话
            msg_count = conn.execute("SELECT COUNT(*) as cnt FROM chat_messages").fetchone()["cnt"]
            if msg_count > 0:
                cursor = conn.execute(
                    "INSERT INTO conversations (title) VALUES (?)",
                    ("历史对话",),
                )
                default_conv_id = cursor.lastrowid
                conn.execute(
                    "UPDATE chat_messages SET conversation_id = ? WHERE conversation_id IS NULL",
                    (default_conv_id,),
                )
                print(f"  [DB] 已迁移 {msg_count} 条旧消息到会话 #{default_conv_id}")

        # 迁移完成后再创建索引（索引依赖 conversation_id 列）
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_chat_conv_created
            ON chat_messages(conversation_id, created_at ASC)
        """)

    print(f"  [DB] SQLite 已初始化: {DB_PATH}")


# ---- 导入记录 CRUD ----

def add_record(
    filename: str,
    file_type: str = "",
    file_size: int = 0,
    chunks: int = 0,
    status: str = "completed",
    message: str = "",
    source_path: str = "",
) -> int:
    """添加一条导入记录。返回新记录的 id。"""
    with _get_conn() as conn:
        cursor = conn.execute(
            """INSERT INTO import_records
               (filename, file_type, file_size, chunks, status, message, source_path)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (filename, file_type, file_size, chunks, status, message, source_path),
        )
        return cursor.lastrowid


def update_record(record_id: int, **kwargs) -> bool:
    """更新一条导入记录。"""
    if not kwargs:
        return False
    allowed = {"filename", "file_type", "file_size", "chunks", "status", "message", "source_path"}
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return False
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [record_id]
    with _get_conn() as conn:
        conn.execute(
            f"UPDATE import_records SET {set_clause} WHERE id = ?",
            values,
        )
    return True


def get_records(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    """获取导入记录列表（按时间倒序）。"""
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM import_records ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
    return [dict(row) for row in rows]


def get_record_count() -> int:
    """获取导入记录总数。"""
    with _get_conn() as conn:
        row = conn.execute("SELECT COUNT(*) as cnt FROM import_records").fetchone()
    return row["cnt"]


def delete_record(record_id: int) -> bool:
    """删除一条导入记录。"""
    with _get_conn() as conn:
        conn.execute("DELETE FROM import_records WHERE id = ?", (record_id,))
    return True


def clear_records() -> int:
    """清空所有导入记录。返回删除的数量。"""
    count = get_record_count()
    with _get_conn() as conn:
        conn.execute("DELETE FROM import_records")
    return count


def get_stats_summary() -> Dict[str, Any]:
    """获取导入统计摘要。"""
    with _get_conn() as conn:
        total = conn.execute("SELECT COUNT(*) as cnt FROM import_records").fetchone()["cnt"]
        total_chunks = conn.execute(
            "SELECT COALESCE(SUM(chunks), 0) as cnt FROM import_records WHERE status = 'completed'"
        ).fetchone()["cnt"]
        by_type = conn.execute(
            "SELECT file_type, COUNT(*) as cnt FROM import_records GROUP BY file_type"
        ).fetchall()
    return {
        "total_records": total,
        "total_chunks": int(total_chunks),
        "by_type": {row["file_type"]: row["cnt"] for row in by_type},
    }


# ============================================================
# 会话 CRUD
# ============================================================

def create_conversation(title: str = "新对话") -> Dict[str, Any]:
    """创建新会话，返回会话对象。"""
    with _get_conn() as conn:
        cursor = conn.execute(
            "INSERT INTO conversations (title) VALUES (?)",
            (title,),
        )
        row = conn.execute(
            "SELECT * FROM conversations WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
    return dict(row)


def get_conversations() -> List[Dict[str, Any]]:
    """获取所有会话列表（按更新时间倒序），附带每个会话的消息数量。"""
    with _get_conn() as conn:
        rows = conn.execute("""
            SELECT c.*,
                   COUNT(m.id) as message_count,
                   MAX(m.created_at) as last_message_at
            FROM conversations c
            LEFT JOIN chat_messages m ON m.conversation_id = c.id
            GROUP BY c.id
            ORDER BY c.updated_at DESC
        """).fetchall()
    return [dict(row) for row in rows]


def get_conversation(conv_id: int) -> Optional[Dict[str, Any]]:
    """获取单个会话信息。"""
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM conversations WHERE id = ?", (conv_id,)
        ).fetchone()
    return dict(row) if row else None


def rename_conversation(conv_id: int, title: str) -> bool:
    """重命名会话。"""
    with _get_conn() as conn:
        conn.execute(
            "UPDATE conversations SET title = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
            (title, conv_id),
        )
    return True


def delete_conversation(conv_id: int) -> int:
    """删除会话及其所有消息。返回删除的消息数量。"""
    with _get_conn() as conn:
        msg_count = conn.execute(
            "SELECT COUNT(*) as cnt FROM chat_messages WHERE conversation_id = ?",
            (conv_id,),
        ).fetchone()["cnt"]
        # 先删消息（CASCADE 也会处理，但显式删除更安全）
        conn.execute("DELETE FROM chat_messages WHERE conversation_id = ?", (conv_id,))
        conn.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
    return msg_count


def touch_conversation(conv_id: int):
    """更新会话的 updated_at 时间戳。"""
    with _get_conn() as conn:
        conn.execute(
            "UPDATE conversations SET updated_at = datetime('now', 'localtime') WHERE id = ?",
            (conv_id,),
        )


# ============================================================
# 聊天记录 CRUD（按会话）
# ============================================================

def add_chat_message(
    role: str,
    content: str,
    conversation_id: Optional[int] = None,
    citations: Optional[str] = None,
    search_count: Optional[int] = None,
    rerank_count: Optional[int] = None,
) -> int:
    """
    添加一条聊天消息。

    Args:
        role: "user" 或 "assistant"
        content: 消息文本
        conversation_id: 所属会话 ID
        citations: JSON 字符串（assistant 的引用来源）
        search_count: 向量检索召回数量
        rerank_count: Rerank 后数量

    Returns:
        新记录的 id
    """
    with _get_conn() as conn:
        cursor = conn.execute(
            """INSERT INTO chat_messages
               (conversation_id, role, content, citations, search_count, rerank_count)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (conversation_id, role, content, citations, search_count, rerank_count),
        )
        # 同时更新会话的 updated_at
        if conversation_id:
            conn.execute(
                "UPDATE conversations SET updated_at = datetime('now', 'localtime') WHERE id = ?",
                (conversation_id,),
            )
        return cursor.lastrowid


def get_chat_messages(conversation_id: int, limit: int = 200) -> List[Dict[str, Any]]:
    """
    获取指定会话的聊天记录（按时间正序，恢复对话顺序）。

    citations 字段自动从 JSON 字符串解析为 Python 对象。
    """
    with _get_conn() as conn:
        rows = conn.execute(
            """SELECT * FROM chat_messages
               WHERE conversation_id = ?
               ORDER BY created_at ASC LIMIT ?""",
            (conversation_id, limit),
        ).fetchall()
    result = []
    for row in rows:
        msg = dict(row)
        if msg.get("citations"):
            try:
                msg["citations"] = json.loads(msg["citations"])
            except (json.JSONDecodeError, TypeError):
                msg["citations"] = None
        result.append(msg)
    return result


def get_chat_message_count(conversation_id: Optional[int] = None) -> int:
    """获取聊天记录总数（可按会话筛选）。"""
    with _get_conn() as conn:
        if conversation_id is not None:
            row = conn.execute(
                "SELECT COUNT(*) as cnt FROM chat_messages WHERE conversation_id = ?",
                (conversation_id,),
            ).fetchone()
        else:
            row = conn.execute("SELECT COUNT(*) as cnt FROM chat_messages").fetchone()
    return row["cnt"]


def clear_chat_messages(conversation_id: Optional[int] = None) -> int:
    """清空聊天记录（可按会话筛选）。返回删除的数量。"""
    count = get_chat_message_count(conversation_id)
    with _get_conn() as conn:
        if conversation_id is not None:
            conn.execute(
                "DELETE FROM chat_messages WHERE conversation_id = ?",
                (conversation_id,),
            )
        else:
            conn.execute("DELETE FROM chat_messages")
    return count
