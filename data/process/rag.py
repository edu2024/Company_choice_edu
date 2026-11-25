"""
data/process/rag.py — HealthCore RAG Knowledge Base: setup & embed

Responsibilities:
  setup()  — parse source docs, chunk by section, upsert to Qdrant
  embed()  — single-model embedding for both chunks and queries

Qdrant collection: healthcore_knowledge
"""

import hashlib
import os
import re
from pathlib import Path

from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels
from sentence_transformers import SentenceTransformer

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
COLLECTION_NAME = "healthcore_knowledge"
SOURCE_DIR = Path("docs/company-knowledge-base")
EMBEDDING_MODEL = "all-MiniLM-L6-v2"  # 384-dim, good trade-off speed/quality

# ---------------------------------------------------------------------------
# Model (lazy-loaded singleton)
# ---------------------------------------------------------------------------
_model = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(EMBEDDING_MODEL)
    return _model


# ---------------------------------------------------------------------------
# Embed
# ---------------------------------------------------------------------------
def embed(text: str) -> list[float]:
    """Return embedding vector for *text* using the project's model."""
    return _get_model().encode(text).tolist()


# ---------------------------------------------------------------------------
# Chunking helpers
# ---------------------------------------------------------------------------
def _chunk_markdown(filepath: Path) -> list[dict]:
    """Split a Markdown file by ## headings into chunks with metadata."""
    raw = filepath.read_text(encoding="utf-8")

    # Normalise line endings
    raw = raw.replace("\r\n", "\n")

    # Split on ## headings (ignore the document title #)
    pattern = re.compile(r"^##\s+(.+)$", re.MULTILINE)
    parts = pattern.split(raw)

    chunks = []
    current_section = "introduction"

    # parts[0] is everything before the first ##
    for i, piece in enumerate(parts):
        piece = piece.strip()
        if not piece:
            continue
        # Even indices (after split) are section *titles*; odd are section *bodies*
        if i % 2 == 0:
            # It's a body; associate with previous section title
            continue
        else:
            current_section = piece.strip()
            continue

    # Simpler re-walk: split on heading positions
    lines = raw.split("\n")
    section = "introduction"
    body_lines: list[str] = []

    for line in lines:
        m = re.match(r"^##\s+(.+)$", line)
        if m:
            if body_lines:
                body = "\n".join(body_lines).strip()
                if body:
                    # If body is large, sub-chunk by paragraph
                    paragraphs = [p.strip() for p in body.split("\n\n") if p.strip()]
                    chunk_text = ""
                    for para in paragraphs:
                        if len(chunk_text) + len(para) > 600 and chunk_text:
                            chunks.append({
                                "section": section,
                                "text": chunk_text,
                            })
                            chunk_text = para
                        else:
                            chunk_text = (chunk_text + "\n\n" + para).strip()
                    if chunk_text:
                        chunks.append({
                            "section": section,
                            "text": chunk_text,
                        })
                body_lines = []
            section = m.group(1).strip()
        else:
            body_lines.append(line)

    # Flush last section
    if body_lines:
        body = "\n".join(body_lines).strip()
        if body:
            paragraphs = [p.strip() for p in body.split("\n\n") if p.strip()]
            chunk_text = ""
            for para in paragraphs:
                if len(chunk_text) + len(para) > 600 and chunk_text:
                    chunks.append({
                        "section": section,
                        "text": chunk_text,
                    })
                    chunk_text = para
                else:
                    chunk_text = (chunk_text + "\n\n" + para).strip()
            if chunk_text:
                chunks.append({
                    "section": section,
                    "text": chunk_text,
                })

    return chunks


def _doc_id(source_document: str) -> str:
    """Map filename stem to the short document key used in the payload."""
    mapping = {
        "healthcore-insurance-coverage": "insurance-coverage",
        "healthcore-appointment-policy": "appointment-policy",
        "healthcore-referral-process": "referral-process",
        "healthcore-new-patient-checklist": "new-patient-checklist",
    }
    return mapping.get(source_document, source_document)


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
def setup() -> dict:
    """
    Parse all source documents in SOURCE_DIR, chunk by section, compute
    embeddings, and upsert into the Qdrant ``healthcore_knowledge`` collection.

    Returns a summary dict with collection name and chunk count per document.
    """
    client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

    # Create collection if it doesn't exist
    existing = [c.name for c in client.get_collections().collections]
    if COLLECTION_NAME not in existing:
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=qmodels.VectorParams(
                size=_get_model().get_sentence_embedding_dimension(),
                distance=qmodels.Distance.COSINE,
            ),
        )
        print(f"✅ Created collection '{COLLECTION_NAME}'")
    else:
        print(f"ℹ️  Collection '{COLLECTION_NAME}' already exists — upserting")

    md_files = sorted(SOURCE_DIR.glob("*.md"))
    if not md_files:
        raise FileNotFoundError(f"No Markdown files found in {SOURCE_DIR.resolve()}")

    summary: dict[str, int] = {}
    points: list[qmodels.PointStruct] = []
    chunk_index = 0

    for fpath in md_files:
        doc_key = _doc_id(fpath.stem)
        chunks = _chunk_markdown(fpath)
        summary[doc_key] = len(chunks)

        for c in chunks:
            point_id = hashlib.md5(
                f"{doc_key}:{c['section']}:{chunk_index}".encode()
            ).hexdigest()

            points.append(
                qmodels.PointStruct(
                    id=point_id,
                    vector=embed(c["text"]),
                    payload={
                        "company": "healthcore",
                        "source_document": doc_key,
                        "section": c["section"],
                        "language": "en",
                        "chunk_index": chunk_index,
                        "text": c["text"],
                    },
                )
            )
            chunk_index += 1

    if points:
        client.upsert(collection_name=COLLECTION_NAME, points=points)
        print(f"✅ Upserted {len(points)} chunks into '{COLLECTION_NAME}'")
    else:
        print("⚠️  No chunks generated")

    print(f"\n📊 Summary: {summary}")
    print(f"   Total chunks: {sum(summary.values())}")
    print(f"   Collection:   {COLLECTION_NAME}")
    return {"collection": COLLECTION_NAME, "chunks_per_document": summary, "total_chunks": len(points)}


# ---------------------------------------------------------------------------
# CLI convenience
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    setup()