"""
Rerank 重排序模块
==================
在向量检索 TopK 结果基础上，使用更精确的模型重新打分排序，
筛选出真正高相关的 chunk 送入 LLM 生成答案。

支持三种模式:
  1. cross_encoder: 本地 Cross-Encoder 模型（bge-reranker-large）
  2. llm:           调用 LLM 对 (query, chunk) 打分
  3. none:          不重排，直接使用向量检索结果

====================================================================
⚠️ 占位符说明:
  cross_encoder 模式需要:
    pip install sentence-transformers
    模型首次使用会自动下载（bge-reranker-large 约 1.3GB）
====================================================================
"""

from typing import List, Dict, Any
from .config import RERANK_MODE, RERANK_MODEL_NAME, RERANK_TOP_N, LLM_API_KEY, LLM_API_BASE, LLM_MODEL_NAME


class Reranker:
    """Rerank 重排序器"""

    def __init__(self, mode: str = RERANK_MODE):
        self.mode = mode
        self._model = None
        self._init()

    def _init(self):
        """根据模式初始化 rerank 模型。"""
        if self.mode == "cross_encoder":
            self._init_cross_encoder()
        elif self.mode == "llm":
            print("  [Rerank] LLM 打分模式")
        elif self.mode == "none":
            print("  [Rerank] 已禁用重排序")
        else:
            print(f"  [Rerank] 未知模式 {self.mode}，回退到 none")
            self.mode = "none"

    def _init_cross_encoder(self):
        """
        ============================================================
        Cross-Encoder Rerank 模型占位符
        ============================================================
        推荐模型:
          - BAAI/bge-reranker-large  (中文，精度高，推荐)
          - BAAI/bge-reranker-base   (轻量版)
          - jinaai/jina-reranker-v2  (多语言)
        ============================================================
        """
        try:
            from sentence_transformers import CrossEncoder
            print(f"  [Rerank] 加载 Cross-Encoder: {RERANK_MODEL_NAME}")
            self._model = CrossEncoder(RERANK_MODEL_NAME)
            print("  [Rerank] Cross-Encoder 加载完成")
        except ImportError:
            print("  [Rerank] sentence-transformers 未安装，回退到 LLM 模式")
            self.mode = "llm"
        except Exception as e:
            print(f"  [Rerank] Cross-Encoder 加载失败: {e}，回退到 LLM 模式")
            self.mode = "llm"

    def rerank(
        self,
        query: str,
        hits: List[Dict[str, Any]],
        top_n: int = RERANK_TOP_N,
    ) -> List[Dict[str, Any]]:
        """
        对检索结果进行重排序。

        Args:
            query: 用户查询
            hits: 向量检索返回的结果列表
            top_n: 重排序后保留的数量

        Returns:
            重排序后的结果列表
        """
        if self.mode == "none" or not hits:
            return hits[:top_n]

        if self.mode == "cross_encoder":
            return self._rerank_cross_encoder(query, hits, top_n)
        elif self.mode == "llm":
            return self._rerank_llm(query, hits, top_n)

        return hits[:top_n]

    def _rerank_cross_encoder(
        self,
        query: str,
        hits: List[Dict[str, Any]],
        top_n: int,
    ) -> List[Dict[str, Any]]:
        """使用 Cross-Encoder 模型重排序。"""
        # 构造 (query, document) 对
        pairs = [(query, hit["text"]) for hit in hits]

        # 批量打分
        scores = self._model.predict(pairs)

        # 将分数赋回 hits
        scored_hits = []
        for hit, score in zip(hits, scores):
            scored_hit = hit.copy()
            scored_hit["rerank_score"] = float(score)
            scored_hit["original_score"] = hit.get("score", 0)
            scored_hits.append(scored_hit)

        # 按 rerank 分数降序排列
        scored_hits.sort(key=lambda x: x["rerank_score"], reverse=True)

        return scored_hits[:top_n]

    def _rerank_llm(
        self,
        query: str,
        hits: List[Dict[str, Any]],
        top_n: int,
    ) -> List[Dict[str, Any]]:
        """
        使用 LLM 对检索结果打分。

        策略：让 LLM 逐条评估 (query, chunk) 的相关性，
        返回 0-10 分，然后按分数排序。
        """
        try:
            from openai import OpenAI
            client = OpenAI(api_key=LLM_API_KEY, base_url=LLM_API_BASE)
        except ImportError:
            print("  [Rerank] openai 未安装，跳过重排序")
            return hits[:top_n]

        scored_hits = []
        for i, hit in enumerate(hits):
            score = self._llm_score(client, query, hit["text"])
            scored_hit = hit.copy()
            scored_hit["rerank_score"] = score
            scored_hit["original_score"] = hit.get("score", 0)
            scored_hits.append(scored_hit)

        scored_hits.sort(key=lambda x: x["rerank_score"], reverse=True)
        return scored_hits[:top_n]

    def _llm_score(self, client, query: str, document: str) -> float:
        """调用 LLM 为单条 (query, document) 打分。"""
        prompt = f"""你是一个文本相关性评分专家。请判断以下文档片段与用户问题的相关程度。

用户问题：{query}

文档片段：{document[:500]}

请只输出一个 0 到 10 之间的整数分数（0=完全不相关，10=高度相关），不要输出其他内容。"""

        try:
            response = client.chat.completions.create(
                model=LLM_MODEL_NAME,
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                max_tokens=8,
            )
            score_text = response.choices[0].message.content.strip()
            # 提取数字
            import re
            numbers = re.findall(r'\d+', score_text)
            if numbers:
                score = min(10, max(0, int(numbers[0])))
                return float(score)
        except Exception as e:
            print(f"  [Rerank] LLM 打分失败: {e}")

        return 0.0
