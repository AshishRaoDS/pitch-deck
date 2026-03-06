"""
Text extraction from uploaded knowledge files (.txt, .md, .pdf).
"""

import io


async def extract_text(filename: str, content: bytes) -> str:
    """Extract plain text from a file's raw bytes."""
    if filename.lower().endswith(".pdf"):
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(content))
        parts = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                parts.append(text)
        return "\n\n".join(parts)
    else:
        return content.decode("utf-8", errors="replace")
