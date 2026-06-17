"""
Milvus 向量存储模块
====================
连接已部署的 Milvus 实例（D:\\milvus docker-compose），
提供 collection 管理、向量写入、相似度检索能力。

使用 MilvusClient (pymilvus >= 2.4 推荐的新 API)。
连接目标: localhost:19530（对应 docker-compose 中的 standalone 服务）
"""

from typing import List, Dict, Any, Optional
from pymilvus import MilvusClient, DataType

from .config import (
    MILVUS_HOST,
    MILVUS_PORT,
    MILVUS_COLLECTION,
    SEARCH_TOP_K,
    SIMILARITY_THRESHOLD,
)
from .chunker import Chunk


class MilvusStore:
    """Milvus 向量存储管理器（MilvusClient 新版 API）"""

    def __init__(self, collection_name: str = MILVUS_COLLECTION, dimension: int = 1024):
        self.collection_name = collection_name
        self.dimension = dimension
        self._connect()
        self._ensure_collection()

    def _connect(self):
        """连接 Milvus 实例。"""
        uri = f"http://{MILVUS_HOST}:{MILVUS_PORT}"
        try:
            self.client = MilvusClient(uri=uri)
            print(f"  [Milvus] 已连接: {uri}")
        except Exception as e:
            raise ConnectionError(
                f"无法连接 Milvus ({uri})。\n"
                f"请确保 Docker 容器已启动: cd D:\\milvus && docker compose up -d\n"
                f"错误: {e}"
            )

    def _ensure_collection(self):
        """
        确保 collection 存在，不存在则创建。

        Schema 设计:
        ┌─────────────┬────────────┬──────────────────────────┐
        │ 字段名       │ 类型        │ 说明                     │
        ├─────────────┼────────────┼──────────────────────────┤
        │ id          │ INT64 (PK) │ 自增主键                  │
        │ embedding   │ FLOAT_VEC  │ 文档向量 (dim维)           │
        │ text        │ VARCHAR    │ chunk 原文                 │
        │ filename    │ VARCHAR    │ 来源文件名                 │
        │ source      │ VARCHAR    │ 来源文件路径               │
        │ file_type   │ VARCHAR    │ 文件类型                   │
        │ chunk_index │ INT64      │ 文档内 chunk 序号          │
        │ page_number │ INT64      │ PDF 页码                   │
        └─────────────┴────────────┴──────────────────────────┘
        """
        if self.client.has_collection(self.collection_name):
            # 检查已有 collection 的维度是否匹配
            try:
                info = self.client.describe_collection(self.collection_name)
                existing_dim = 0
                for f in info.get("fields", []):
                    if f.get("type") in (DataType.FLOAT_VECTOR, 101) or f.get("name") == "embedding":
                        params = f.get("params", {})
                        existing_dim = int(params.get("dim", 0))
                        break

                if existing_dim and existing_dim != self.dimension:
                    print(f"  [Milvus] 已有 collection 维度 {existing_dim} != 当前 {self.dimension}，自动重建...")
                    self.client.drop_collection(self.collection_name)
                    # 继续往下走，走创建逻辑
                else:
                    # 维度匹配或无法检测，尝试加载
                    try:
                        self.client.load_collection(self.collection_name)
                        print(f"  [Milvus] 已加载 collection: {self.collection_name}")
                        return
                    except Exception as load_err:
                        # 可能没有索引，尝试补建索引后再加载
                        print(f"  [Milvus] 加载失败（可能缺少索引）: {load_err}")
                        print(f"  [Milvus] 尝试补建索引...")
                        try:
                            idx_params = self.client.prepare_index_params()
                            idx_params.add_index(
                                field_name="embedding",
                                index_type="IVF_FLAT",
                                metric_type="COSINE",
                                params={"nlist": 128},
                            )
                            self.client.create_index(
                                collection_name=self.collection_name,
                                index_params=idx_params,
                            )
                            self.client.load_collection(self.collection_name)
                            print(f"  [Milvus] 索引补建完成，已加载")
                            return
                        except Exception:
                            # 补建也失败，删掉重来
                            print(f"  [Milvus] 补建索引失败，删除旧 collection 重建")
                            self.client.drop_collection(self.collection_name)
            except Exception as e:
                print(f"  [Milvus] 检测已有 collection 出错: {e}，删除重建")
                try:
                    self.client.drop_collection(self.collection_name)
                except Exception:
                    pass

        # 创建 schema
        schema = self.client.create_schema(auto_id=True, enable_dynamic_field=False)
        schema.add_field("id", DataType.INT64, is_primary=True)
        schema.add_field("embedding", DataType.FLOAT_VECTOR, dim=self.dimension)
        schema.add_field("text", DataType.VARCHAR, max_length=8192)
        schema.add_field("filename", DataType.VARCHAR, max_length=512)
        schema.add_field("source", DataType.VARCHAR, max_length=1024)
        schema.add_field("file_type", DataType.VARCHAR, max_length=32)
        schema.add_field("chunk_index", DataType.INT64)
        schema.add_field("page_number", DataType.INT64)

        # 索引参数
        index_params = self.client.prepare_index_params()
        index_params.add_index(
            field_name="embedding",
            index_type="IVF_FLAT",
            metric_type="COSINE",
            params={"nlist": 128},
        )

        self.client.create_collection(
            collection_name=self.collection_name,
            schema=schema,
            index_params=index_params,
        )
        print(f"  [Milvus] 已创建 collection: {self.collection_name} (dim={self.dimension})")

    def create_index(self, index_type: str = "IVF_FLAT", metric_type: str = "COSINE"):
        """
        重建向量索引。

        ============================================================
        索引策略选择（对应投标材料中的性能优化部分）:
        ============================================================
        | 策略       | 适用场景        | 参数                       |
        |-----------|----------------|---------------------------|
        | FLAT      | 小数据量(<10万)  | 无额外参数，精度最高         |
        | IVF_FLAT  | 中等数据(10-100万)| nlist=128，均衡精度与速度  |
        | IVF_PQ    | 大数据(>100万)   | nlist=256, m=16, nbits=8 |
        | HNSW      | 低延迟场景       | M=16, efConstruction=200  |
        ============================================================
        """
        index_params_map = {
            "FLAT": {},
            "IVF_FLAT": {"nlist": 128},
            "IVF_PQ": {"nlist": 256, "m": 16, "nbits": 8},
            "HNSW": {"M": 16, "efConstruction": 200},
        }

        index_params = self.client.prepare_index_params()
        index_params.add_index(
            field_name="embedding",
            index_type=index_type,
            metric_type=metric_type,
            params=index_params_map.get(index_type, {}),
        )

        # 先 release collection，再 drop 旧索引再创建
        try:
            self.client.release_collection(self.collection_name)
        except Exception:
            pass
        try:
            self.client.drop_index(self.collection_name, "embedding")
        except Exception:
            pass

        self.client.create_index(
            collection_name=self.collection_name,
            index_params=index_params,
        )
        # 重新加载
        self.client.load_collection(self.collection_name)
        print(f"  [Milvus] 索引创建完成: {index_type}")

    def insert_chunks(self, chunks: List[Chunk], embeddings: List[List[float]]) -> int:
        """
        批量写入 chunk 及其向量到 Milvus。

        Args:
            chunks: Chunk 对象列表
            embeddings: 对应的向量列表

        Returns:
            插入的记录数
        """
        if not chunks:
            return 0

        data = []
        for c, e in zip(chunks, embeddings):
            data.append({
                "embedding": e,
                "text": c.text[:8192],
                "filename": c.filename[:512],
                "source": c.source[:1024],
                "file_type": c.file_type[:32],
                "chunk_index": c.chunk_index,
                "page_number": c.page_number,
            })

        result = self.client.insert(
            collection_name=self.collection_name,
            data=data,
        )
        count = result.get("insert_count", len(data))
        print(f"  [Milvus] 已插入 {count} 条记录到 {self.collection_name}")
        return count

    def search(
        self,
        query_embedding: List[float],
        top_k: int = SEARCH_TOP_K,
        output_fields: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """
        向量相似度检索。

        Args:
            query_embedding: 查询向量
            top_k: 返回数量
            output_fields: 返回的标量字段

        Returns:
            检索结果列表，每项包含 chunk 信息和相似度分数
        """
        if output_fields is None:
            output_fields = ["text", "filename", "source", "file_type", "chunk_index", "page_number"]

        results = self.client.search(
            collection_name=self.collection_name,
            data=[query_embedding],
            limit=top_k,
            output_fields=output_fields,
            search_params={
                "metric_type": "COSINE",
                "params": {"nprobe": 10},
            },
        )

        hits = []
        for hit in results[0]:
            score = hit.get("distance", 0)
            if score < SIMILARITY_THRESHOLD:
                continue
            entity = hit.get("entity", {})
            hits.append({
                "id": hit.get("id", 0),
                "score": score,
                "text": entity.get("text", ""),
                "filename": entity.get("filename", ""),
                "source": entity.get("source", ""),
                "file_type": entity.get("file_type", ""),
                "chunk_index": entity.get("chunk_index", 0),
                "page_number": entity.get("page_number", 0),
            })

        return hits

    def get_stats(self) -> Dict[str, Any]:
        """获取 collection 统计信息。"""
        try:
            info = self.client.describe_collection(self.collection_name)
        except Exception:
            return {
                "collection": self.collection_name,
                "row_count": 0,
                "dimension": self.dimension,
                "fields": [],
            }

        try:
            stats = self.client.get_collection_stats(self.collection_name)
            row_count = stats.get("row_count", 0) if isinstance(stats, dict) else 0
        except Exception:
            row_count = 0

        return {
            "collection": self.collection_name,
            "row_count": int(row_count),
            "dimension": self.dimension,
            "fields": [f.get("name", "") for f in info.get("fields", [])],
        }

    def drop_collection(self):
        """删除 collection（谨慎使用）。"""
        if self.client.has_collection(self.collection_name):
            self.client.drop_collection(self.collection_name)
            print(f"  [Milvus] 已删除 collection: {self.collection_name}")
