"""
Org Knowledge Base — document ingestion and retrieval using ChromaDB.

Documents (PDF, DOCX, TXT, MD) are:
  1. Parsed to plain text
  2. Chunked into ~500-token segments with 50-token overlap
  3. Embedded with OpenAI text-embedding-3-small
  4. Stored in a persistent ChromaDB collection

At query time, the query string is embedded and the top-K nearest chunks
are returned, each with the source filename and a similarity score.
"""

import asyncio
import hashlib
import io
import logging
import os
import re
from pathlib import Path
from typing import Optional

import chromadb
from chromadb.config import Settings as ChromaSettings
from openai import AsyncOpenAI

from .config import settings

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# ChromaDB client (lazy-initialised singleton)
# ---------------------------------------------------------------------------

_chroma_client: Optional[chromadb.PersistentClient] = None
_collection = None
COLLECTION_NAME = "org_knowledge_base"


def _get_collection():
    global _chroma_client, _collection
    if _collection is None:
        persist_dir = settings.kb_persist_dir
        os.makedirs(persist_dir, exist_ok=True)
        _chroma_client = chromadb.PersistentClient(
            path=persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        _collection = _chroma_client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------

def _extract_text_from_pdf(data: bytes) -> str:
    """Extract text from PDF bytes using PyMuPDF (fitz)."""
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=data, filetype="pdf")
        parts = []
        for page in doc:
            parts.append(page.get_text())
        return "\n".join(parts)
    except ImportError:
        log.warning("PyMuPDF not installed; falling back to basic PDF extraction")
        return ""


def _extract_text_from_docx(data: bytes) -> str:
    """Extract text from DOCX bytes using python-docx."""
    try:
        from docx import Document
        doc = Document(io.BytesIO(data))
        return "\n".join(para.text for para in doc.paragraphs if para.text.strip())
    except ImportError:
        log.warning("python-docx not installed; cannot extract DOCX text")
        return ""


def extract_text(file_bytes: bytes, filename: str) -> str:
    """Dispatch to the correct extractor based on file extension."""
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return _extract_text_from_pdf(file_bytes)
    elif ext in (".docx",):
        return _extract_text_from_docx(file_bytes)
    elif ext in (".txt", ".md", ".markdown"):
        return file_bytes.decode("utf-8", errors="replace")
    else:
        # Best-effort: try UTF-8 decode
        return file_bytes.decode("utf-8", errors="replace")


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------

def _approximate_tokens(text: str) -> int:
    """Rough token count: ~4 chars per token."""
    return len(text) // 4


def chunk_text(text: str, max_tokens: int = 500, overlap_tokens: int = 50) -> list[str]:
    """
    Split text into chunks of approximately max_tokens with overlap_tokens overlap.
    Splits on sentence/paragraph boundaries where possible.
    """
    # Normalise whitespace
    text = re.sub(r"\n{3,}", "\n\n", text.strip())

    # Split into sentences (rough)
    sentences = re.split(r"(?<=[.!?])\s+|\n\n", text)
    sentences = [s.strip() for s in sentences if s.strip()]

    chunks: list[str] = []
    current_parts: list[str] = []
    current_tokens = 0

    for sentence in sentences:
        sentence_tokens = _approximate_tokens(sentence)

        if current_tokens + sentence_tokens > max_tokens and current_parts:
            chunks.append(" ".join(current_parts))
            # Keep overlap: drop sentences from the front until we're under overlap budget
            while current_parts and current_tokens > overlap_tokens:
                removed = current_parts.pop(0)
                current_tokens -= _approximate_tokens(removed)

        current_parts.append(sentence)
        current_tokens += sentence_tokens

    if current_parts:
        chunks.append(" ".join(current_parts))

    return [c for c in chunks if c.strip()]


# ---------------------------------------------------------------------------
# Embedding
# ---------------------------------------------------------------------------

async def _embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a list of texts using OpenAI text-embedding-3-small."""
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    # Batch in groups of 100 to stay within API limits
    all_embeddings: list[list[float]] = []
    batch_size = 100
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        response = await client.embeddings.create(
            model="text-embedding-3-small",
            input=batch,
        )
        all_embeddings.extend([item.embedding for item in response.data])
    return all_embeddings


# ---------------------------------------------------------------------------
# Document ID helpers
# ---------------------------------------------------------------------------

def _make_doc_id(filename: str, file_bytes: bytes) -> str:
    """Stable doc ID based on filename + content hash."""
    content_hash = hashlib.sha256(file_bytes).hexdigest()[:12]
    safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", Path(filename).stem)[:40]
    return f"{safe_name}_{content_hash}"


def _make_chunk_id(doc_id: str, chunk_index: int) -> str:
    return f"{doc_id}_chunk_{chunk_index:04d}"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def ingest_document(file_bytes: bytes, filename: str) -> dict:
    """
    Ingest a document into the knowledge base.

    Returns:
        {"doc_id": str, "filename": str, "chunk_count": int}
    """
    collection = _get_collection()
    doc_id = _make_doc_id(filename, file_bytes)

    # Check if already ingested (idempotent)
    existing = collection.get(where={"doc_id": doc_id}, limit=1)
    if existing["ids"]:
        chunk_count = len(collection.get(where={"doc_id": doc_id})["ids"])
        log.info("Document %s already ingested (%d chunks)", filename, chunk_count)
        return {"doc_id": doc_id, "filename": filename, "chunk_count": chunk_count}

    # Extract and chunk
    text = extract_text(file_bytes, filename)
    if not text.strip():
        raise ValueError(f"Could not extract text from {filename}")

    chunks = chunk_text(text)
    if not chunks:
        raise ValueError(f"No text chunks produced from {filename}")

    log.info("Ingesting %s: %d chunks", filename, len(chunks))

    # Embed
    embeddings = await _embed_texts(chunks)

    # Store
    ids = [_make_chunk_id(doc_id, i) for i in range(len(chunks))]
    metadatas = [
        {"doc_id": doc_id, "filename": filename, "chunk_index": i}
        for i in range(len(chunks))
    ]

    collection.add(
        ids=ids,
        documents=chunks,
        embeddings=embeddings,
        metadatas=metadatas,
    )

    log.info("Ingested %s: %d chunks stored", filename, len(chunks))
    return {"doc_id": doc_id, "filename": filename, "chunk_count": len(chunks)}


async def query_kb(query: str, top_k: int = 3) -> list[dict]:
    """
    Query the knowledge base for chunks relevant to `query`.

    Returns:
        [{"text": str, "source": str, "score": float}, ...]
    """
    collection = _get_collection()

    # Check if collection has any documents
    count = collection.count()
    if count == 0:
        return []

    # Embed query
    embeddings = await _embed_texts([query])
    query_embedding = embeddings[0]

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(top_k, count),
        include=["documents", "metadatas", "distances"],
    )

    output = []
    for doc, meta, dist in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        # Convert cosine distance to similarity score (0-1, higher = more similar)
        score = max(0.0, 1.0 - dist)
        output.append({
            "text": doc,
            "source": meta.get("filename", "unknown"),
            "score": round(score, 4),
        })

    return output


def list_documents() -> list[dict]:
    """
    List all ingested documents with their chunk counts.

    Returns:
        [{"doc_id": str, "filename": str, "chunk_count": int}, ...]
    """
    collection = _get_collection()
    all_items = collection.get(include=["metadatas"])

    # Aggregate by doc_id
    docs: dict[str, dict] = {}
    for meta in all_items["metadatas"]:
        doc_id = meta.get("doc_id", "unknown")
        filename = meta.get("filename", "unknown")
        if doc_id not in docs:
            docs[doc_id] = {"doc_id": doc_id, "filename": filename, "chunk_count": 0}
        docs[doc_id]["chunk_count"] += 1

    return sorted(docs.values(), key=lambda d: d["filename"])


def delete_document(doc_id: str) -> int:
    """
    Delete all chunks for a document by doc_id.

    Returns the number of chunks deleted.
    """
    collection = _get_collection()
    existing = collection.get(where={"doc_id": doc_id})
    ids_to_delete = existing["ids"]
    if ids_to_delete:
        collection.delete(ids=ids_to_delete)
    return len(ids_to_delete)


def get_kb_status() -> dict:
    """Return total document count and chunk count."""
    collection = _get_collection()
    total_chunks = collection.count()
    docs = list_documents()
    return {
        "document_count": len(docs),
        "chunk_count": total_chunks,
    }
