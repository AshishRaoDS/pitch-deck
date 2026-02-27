"""
FastAPI router for Org Knowledge Base management.

Endpoints
---------
POST   /api/kb/upload                Upload one or more documents for indexing
GET    /api/kb/documents             List all indexed documents
DELETE /api/kb/documents/{doc_id}    Remove a document and its chunks
GET    /api/kb/status                Total document + chunk counts
"""

import logging

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from .knowledge_base import (
    delete_document,
    get_kb_status,
    ingest_document,
    list_documents,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/kb", tags=["knowledge-base"])

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".markdown"}
MAX_FILE_SIZE_MB = 20


@router.post("/upload")
async def upload_documents(files: list[UploadFile] = File(...)):
    """
    Upload one or more documents to the org knowledge base.

    Accepts: .pdf, .docx, .txt, .md
    Returns: list of ingestion results with chunk counts.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    results = []
    errors = []

    for upload in files:
        filename = upload.filename or "unknown"
        ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

        if ext not in ALLOWED_EXTENSIONS:
            errors.append({
                "filename": filename,
                "error": f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
            })
            continue

        file_bytes = await upload.read()

        if len(file_bytes) > MAX_FILE_SIZE_MB * 1024 * 1024:
            errors.append({
                "filename": filename,
                "error": f"File exceeds {MAX_FILE_SIZE_MB}MB limit",
            })
            continue

        try:
            result = await ingest_document(file_bytes, filename)
            results.append(result)
        except Exception as exc:
            log.exception("Failed to ingest %s", filename)
            errors.append({"filename": filename, "error": str(exc)})

    return {
        "ingested": results,
        "errors": errors,
        "total_ingested": len(results),
    }


@router.get("/documents")
async def get_documents():
    """List all indexed documents with their chunk counts."""
    try:
        docs = list_documents()
        return {"documents": docs, "count": len(docs)}
    except Exception as exc:
        log.exception("Failed to list documents")
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/documents/{doc_id}")
async def remove_document(doc_id: str):
    """Remove a document and all its chunks from the knowledge base."""
    try:
        deleted_chunks = delete_document(doc_id)
        if deleted_chunks == 0:
            raise HTTPException(
                status_code=404,
                detail=f"Document '{doc_id}' not found in knowledge base",
            )
        return {"doc_id": doc_id, "deleted_chunks": deleted_chunks}
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Failed to delete document %s", doc_id)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/status")
async def kb_status():
    """Return total document count and chunk count."""
    try:
        return get_kb_status()
    except Exception as exc:
        log.exception("Failed to get KB status")
        raise HTTPException(status_code=500, detail=str(exc))
