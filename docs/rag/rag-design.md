# HealthCore RAG Knowledge Base — Design Document

## 1. Overview

This document describes the Retrieval-Augmented Generation (RAG) pipeline built for the **HealthCore** backoffice. The system indexes structured company-knowledge documents (insurance coverage, appointment policy, referral process, new-patient checklist) into a vector database and retrieves relevant context to answer operator questions.

## 2. Collection

| Property          | Value                           |
|-------------------|---------------------------------|
| **Collection name** | `healthcore_knowledge`        |
| **Vector database** | Qdrant v1.10.1                |
| **Distance metric** | Cosine                         |
| **Vector dimension** | 384                           |
| **Embedding model**  | `all-MiniLM-L6-v2` (sentence-transformers) |

## 3. Chunking Strategy

Documents are Markdown files stored under `docs/company-knowledge-base/`. The chunking algorithm lives in `data/process/rag.py`:

1. **Section split** — The file is split at each `##` (level-2 heading). Each section becomes one chunk candidate. The section heading text is preserved as metadata.
2. **Sub-chunking** — If a section's body exceeds **600 characters**, it is further split by sentence boundaries (`. `, `!\n`, `?\n`) into smaller chunks, each kept under the limit. This prevents chunks from being too large for semantic search while keeping natural sentence groupings intact.
3. **Payload schema** — Every chunk is enriched with:

```json
{
  "company": "HealthCore",
  "source_document": "insurance-coverage",
  "section": "United States",
  "language": "en",
  "chunk_index": 0,
  "text": "Accepted commercial insurance plans include Blue Cross Blue Shield..."
}
```

4. **Point ID** — Deterministic MD5 hash of `"{doc_key}:{section}:{chunk_index}"` for idempotent re-indexing.

## 4. Retrieval Pipeline (`data/pipelines/rag.py`)

### 4.1 `retrieve(question, k=5, min_score=0.40)`

1. Embed the question using the same `all-MiniLM-L6-v2` model.
2. Search Qdrant with `limit=k` and `score_threshold=min_score`.
3. Return matching chunks with id, score, source_document, section, and text.

### 4.2 `query(question)`

1. Call `retrieve(question)`.
2. If no chunks found → return honest refusal: *"I'm sorry, I don't have enough information…"*
3. If chunks found → build a system prompt instructing the assistant to:
   - Act as a **HealthCore coordinator** (informative, precise, professional)
   - Explicitly distinguish between **US** and **UK** policies
   - Mention that **Medicare/Medicaid** patients are **not charged** no-show fees
   - Answer concisely and cite sources
4. *(Current implementation returns the formatted context; production LLM integration is expected to be wired into the `query()` function.)*

## 5. Similarity Threshold Rationale

The threshold of **0.40** (cosine) was chosen after empirical testing with the four knowledge documents:

- **0.35** — retrieved some tangentially related chunks (false positives)
- **0.40** — balanced: high recall on relevant chunks, minimal noise
- **0.45** — missed some relevant sections on insurance (false negatives)

Adjust the threshold in `data/pipelines/rag.py` (the `MIN_SIMILARITY` constant) if the retrieval quality needs tuning.

## 6. API Endpoint

| Method | Path                | Description                        |
|--------|---------------------|------------------------------------|
| POST   | `/knowledge/query`  | Accepts `{"question": string}` and returns `{"answer": string, "sources": [...]}` |

Endpoint is registered under the `knowledge` router in `services/incident-api/app/knowledge_router.py`.

## 7. File Map

```
data/
  process/
    rag.py              — Embedding, chunking, and indexing logic
    __init__.py
  pipelines/
    rag.py              — Retrieval and query orchestration
    __init__.py
  eval/
    test-queries.json   — ≥8 test questions with expected sources
docs/
  company-knowledge-base/
    healthcore-insurance-coverage.en.md
    healthcore-appointment-policy.en.md
    healthcore-referral-process.en.md
    healthcore-new-patient-checklist.en.md
  rag/
    rag-design.md       — This document
services/
  incident-api/
    app/
      knowledge_router.py  — FastAPI router for /knowledge/query
      main.py              — App entry point (includes knowledge_router)
    requirements.txt       — Added qdrant-client, sentence-transformers
tests/
  pipelines/
    test_rag.py         — Unit tests for retrieve() and query()
uis/
  backoffice/
    app/
      knowledge/
        page.tsx         — Client-side UI for asking knowledge-base questions
```

## 8. Setup & Execution

```bash
# 1. Start Qdrant
docker-compose up -d

# 2. Install Python dependencies
pip install qdrant-client sentence-transformers

# 3. Index documents
python data/process/rag.py

# 4. Start the API
uvicorn services.incident-api.app.main:app --reload

# 5. Open the backoffice
cd uis/backoffice && npm run dev
```

## 9. Future Improvements

- Integrate a production LLM (e.g., OpenAI / local model) into `query()` for natural-language answer generation.
- Add hybrid search (dense + sparse vectors) for better out-of-domain coverage.
- Add a re-ranking step to further improve answer quality.
- Support document updates without full re-index via point-level upsert.
- Add document-level access control for PHI-sensitive content.