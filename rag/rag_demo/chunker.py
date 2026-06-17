"""
文本分块模块
=============
实现递归字符分块策略，支持 chunk_size / chunk_overlap 配置。
每个 chunk 保留来源文档元信息，用于后续引用溯源。
"""

from dataclasses import dataclass, field
from typing import List
from .loader import Document
from .config import CHUNK_SIZE, CHUNK_OVERLAP


@dataclass
class Chunk:
    """文本块"""
    text: str                            # chunk 文本内容
    source: str                          # 来源文件路径
    filename: str                        # 来源文件名
    file_type: str                       # 文件类型
    chunk_index: int                     # 在文档中的序号
    page_number: int = 0                 # PDF 页码（非 PDF 为 0）
    metadata: dict = field(default_factory=dict)


def _find_page_number(text: str, page_map: dict) -> int:
    """根据 chunk 文本找到对应的 PDF 页码（取文本最先出现的页）。"""
    if not page_map:
        return 0
    snippet = text[:50]  # 用 chunk 开头 50 字符去匹配
    for pg, page_text in sorted(page_map.items()):
        if snippet in page_text or any(line in page_text for line in snippet.split("\n") if line):
            return pg
    return min(page_map.keys()) if page_map else 0


def split_document(
    doc: Document,
    chunk_size: int = CHUNK_SIZE,
    chunk_overlap: int = CHUNK_OVERLAP,
) -> List[Chunk]:
    """
    将文档递归切分为 Chunk 列表。

    分割策略：
    1. 先按段落（双换行）分割
    2. 再按句子（句号/换行）分割
    3. 最后按字符数硬切
    每段结果保留 chunk_overlap 个字符的重叠。
    """
    text = doc.content.strip()
    if not text:
        return []

    # --- 递归分块 ---
    separators = ["\n\n", "\n", "。", "！", "？", ".", "!", "?", " "]
    raw_pieces = _recursive_split(text, chunk_size, separators)

    # --- 添加 overlap ---
    pieces = _add_overlap(raw_pieces, chunk_overlap)

    # --- 构造 Chunk 对象 ---
    page_map = doc.metadata.get("page_map", {})
    chunks = []
    for i, piece in enumerate(pieces):
        piece = piece.strip()
        if not piece:
            continue
        chunks.append(Chunk(
            text=piece,
            source=doc.source,
            filename=doc.filename,
            file_type=doc.file_type,
            chunk_index=i,
            page_number=_find_page_number(piece, page_map),
        ))

    return chunks


def _recursive_split(text: str, max_size: int, separators: List[str]) -> List[str]:
    """递归按分隔符分割文本，直到每个片段不超过 max_size。"""
    if len(text) <= max_size:
        return [text]

    if not separators:
        # 没有更多分隔符可用，硬切
        return [text[i:i + max_size] for i in range(0, len(text), max_size)]

    sep = separators[0]
    remaining_seps = separators[1:]

    if sep == " ":
        # 空格作为最后手段，按字符硬切
        return [text[i:i + max_size] for i in range(0, len(text), max_size)]

    parts = text.split(sep)
    result = []
    current = ""

    for part in parts:
        candidate = current + sep + part if current else part
        if len(candidate) <= max_size:
            current = candidate
        else:
            if current:
                result.append(current)
            # 如果单个 part 超过 max_size，递归用下一个分隔符
            if len(part) > max_size:
                sub_parts = _recursive_split(part, max_size, remaining_seps)
                result.extend(sub_parts)
                current = ""
            else:
                current = part

    if current:
        result.append(current)

    return result


def _add_overlap(pieces: List[str], overlap: int) -> List[str]:
    """为相邻 chunk 添加重叠文本。"""
    if overlap <= 0 or len(pieces) <= 1:
        return pieces

    result = [pieces[0]]
    for i in range(1, len(pieces)):
        prev_tail = pieces[i - 1][-overlap:]
        result.append(prev_tail + pieces[i])
    return result


def split_documents(docs: List[Document], **kwargs) -> List[Chunk]:
    """批量分块多个文档。"""
    all_chunks = []
    for doc in docs:
        chunks = split_document(doc, **kwargs)
        all_chunks.extend(chunks)
        print(f"  [分块] {doc.filename} -> {len(chunks)} 个 chunk")
    return all_chunks
