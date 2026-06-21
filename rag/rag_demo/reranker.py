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
        self._backend = "none"  # "openvino" | "sentence_transformers" | "none"
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
        加载优先级:
          1. optimum[openvino]  → OpenVINO IR(Intel GPU/CPU 加速)
          2. sentence-transformers → transformers (CPU fallback)
          3. LLM 打分模式 (回退)
        """
        # ---- 1) 优先尝试 OpenVINO 加速(支持 Intel Arc / CPU 加速) ----
        if self._try_init_openvino():
            self._backend = "openvino"
            return
        # ---- 2) 回退到 sentence-transformers / transformers ----
        try:
            from sentence_transformers import CrossEncoder
            print(f"  [Rerank] 加载 Cross-Encoder (transformers): {RERANK_MODEL_NAME}")
            self._model = CrossEncoder(RERANK_MODEL_NAME)
            self._backend = "sentence_transformers"
            print("  [Rerank] Cross-Encoder 加载完成 (CPU 模式)")
        except ImportError:
            print("  [Rerank] sentence-transformers 未安装，回退到 LLM 模式")
            self.mode = "llm"
        except Exception as e:
            print(f"  [Rerank] Cross-Encoder 加载失败: {e}，回退到 LLM 模式")
            self.mode = "llm"

    def _try_init_openvino(self) -> bool:
        """尝试用 optimum[openvino] 加载并 export 模型。失败返回 False 让调用方走 fallback。"""
        try:
            from optimum.intel import OVModelForSequenceClassification
            from transformers import AutoTokenizer
        except ImportError:
            print("  [Rerank] optimum[openvino] 未安装,跳过 OpenVINO 加速")
            return False

        # 选 device: 优先 GPU(Intel Arc / iGPU),否则 CPU
        try:
            from openvino import Core as OVCore
            core = OVCore()
            available = core.available_devices
            if "GPU" in available:
                ov_device = "GPU"
            elif "AUTO" in available:
                ov_device = "AUTO"
            else:
                ov_device = "CPU"
        except Exception:
            ov_device = "CPU"

        # 诊断: 让 optimum 加载前先打印 endpoint
        import os
        import huggingface_hub.constants as _hf
        print(f"  [Rerank] HF_ENDPOINT env = {os.environ.get('HF_ENDPOINT', '<None>')}")
        print(f"  [Rerank] huggingface_hub.ENDPOINT = {_hf.ENDPOINT}")

        # optimum 的缓存目录约定: <model_name>/  下放 OV IR 文件
        # 存在就跳过 export,直接 load_from_transformers 也不会重复导出(有缓存)
        try:
            print(f"  [Rerank] 加载/导出 OpenVINO IR (device={ov_device}): {RERANK_MODEL_NAME}")
            self._model = OVModelForSequenceClassification.from_pretrained(
                RERANK_MODEL_NAME,
                export=True,
                device=ov_device,
            )
            self._tokenizer = AutoTokenizer.from_pretrained(RERANK_MODEL_NAME)
            self._ov_device = ov_device
            print(f"  [Rerank] OpenVINO 加速已启用 (device={ov_device})")
            return True
        except Exception as e:
            print(f"  [Rerank] OpenVINO 加载失败(忽略,走 CPU fallback): {e}")
            return False

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

        # 区分加载路径:
        #   - sentence-transformers CrossEncoder: 自带 .predict(pairs, batch_size=...)
        #   - optimum OpenVINO 模型: 没有 .predict, 走 tokenizer + model 路径
        if getattr(self, "_backend", "sentence_transformers") == "openvino":
            scores = self._ov_predict(pairs)
        else:
            scores = self._model.predict(pairs, batch_size=16, show_progress_bar=False)

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

    def _ov_predict(self, pairs: List[tuple]) -> List[float]:
        """OpenVINO 路径的 batch 推理。返回每个 (q, d) 对的相关性分数。"""
        import torch  # 局部 import,避免顶层依赖
        tokenizer = self._tokenizer
        model = self._model

        BATCH = 16
        scores: List[float] = []
        for i in range(0, len(pairs), BATCH):
            batch = pairs[i : i + BATCH]
            texts_1 = [p[0] for p in batch]
            texts_2 = [p[1] for p in batch]
            inputs = tokenizer(
                texts_1,
                texts_2,
                padding=True,
                truncation=True,
                max_length=512,
                return_tensors="pt",
            )
            outputs = model(**inputs)
            # Cross-Encoder 输出 logits,取 [0] 维(单类别相关性分数)
            logits = outputs.logits if hasattr(outputs, "logits") else outputs[0]
            if logits.dim() == 2:
                batch_scores = logits[:, 0].tolist()
            else:
                batch_scores = logits.tolist()
            scores.extend(batch_scores)
        return scores

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
