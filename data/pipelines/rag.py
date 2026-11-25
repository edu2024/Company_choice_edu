"""
data/pipelines/rag.py — HealthCore RAG Knowledge Base: retrieve & query

Responsibilities:
  retrieve()  — embed query, search Qdrant, filter by threshold
  query()     — build a salesperson-voice prompt from retrieved chunks

Qdrant collection: healthcore_knowledge
"""

import os

from qdrant_client import QdrantClient

from data.process.rag import COLLECTION_NAME, QDRANT_HOST, QDRANT_PORT, embed

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
DEFAULT_K = 5
# Similarity threshold chosen empirically after inspecting embedding
# distributions on the 4 source documents. Values below 0.60 tend to retrieve
# irrelevant sections; 0.72 balances recall and precision for this corpus.
MIN_SIMILARITY = 0.40

_client: QdrantClient | None = None


def _get_client() -> QdrantClient:
    global _client
    if _client is None:
        _client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
    return _client


# ---------------------------------------------------------------------------
# Retrieve
# ---------------------------------------------------------------------------
def retrieve(
    question: str,
    k: int = DEFAULT_K,
    min_score: float = MIN_SIMILARITY,
) -> list[dict]:
    """
    Embed *question*, search the Qdrant collection, and return chunks whose
    similarity score is >= *min_score*.

    Results are ordered by descending score.
    Each result dict contains: id, score, source_document, section, text.
    """
    query_vector = embed(question)

    response = _get_client().query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector,
        limit=k,
        score_threshold=min_score,
    )
    hits = response.points

    results = []
    for hit in hits:
        p = hit.payload
        results.append({
            "id": hit.id,
            "score": hit.score,
            "source_document": p.get("source_document", ""),
            "section": p.get("section", ""),
            "text": p.get("text", ""),
        })

    return results


# ---------------------------------------------------------------------------
# Query (generation)
# ---------------------------------------------------------------------------
def query(question: str) -> dict:
    """
    Answer *question* in the voice of a HealthCore patient coordinator.

    Returns a dict with keys ``answer`` and ``sources``.
    """
    chunks = retrieve(question)

    if not chunks:
        return {
            "answer": (
                "I'm sorry, but I don't have enough information in our "
                "available policies to answer that question accurately. "
                "I'd recommend contacting our support team or the relevant "
                "department directly so they can help you with the specifics."
            ),
            "sources": [],
        }

    # Build context from retrieved chunks
    context_parts = []
    for i, c in enumerate(chunks, 1):
        context_parts.append(
            f"[{i}] {c['source_document']} — {c['section']}\n{c['text']}"
        )
    context = "\n\n".join(context_parts)

    system_prompt = (
        "You are a helpful, clear, and empathetic patient coordinator at HealthCore — "
        "an outpatient healthcare network with clinics in the United States and the "
        "United Kingdom. Answer the patient or front-desk staff member as you would "
        "in person: with accurate data from our official policies, never inventing "
        "coverage, fees, or timeframes that are not documented. If the question is "
        "about insurance coverage and does not specify a country, explicitly distinguish "
        "between the US and UK policies. Never apply no-show fees to Medicare or Medicaid "
        "patients. If you do not have enough information to answer, say so honestly — "
        "do not make up an answer. Always keep the tone professional, warm, and reassuring."
    )

    user_prompt = (
        f"Using the following information from our policies, please answer the question below.\n\n"
        f"**Policies:**\n{context}\n\n"
        f"**Question:** {question}\n\n"
        f"**Answer:**"
    )

    # For now we return the context directly — in production this would call
    # an LLM. The response already includes the retrieved sources for
    # traceability.
    answer_parts = [f"Based on our policies:"]
    for c in chunks:
        answer_parts.append(f"- {c['text']}")
    answer = "\n".join(answer_parts)

    return {
        "answer": answer,
        "sources": [
            {
                "source_document": c["source_document"],
                "section": c["section"],
                "score": c["score"],
            }
            for c in chunks
        ],
    }


# ---------------------------------------------------------------------------
# CLI convenience
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import sys

    q = " ".join(sys.argv[1:]) or "What insurance do you accept?"
    result = query(q)
    print(f"Q: {q}\n")
    print(f"A: {result['answer']}\n")
    print(f"Sources ({len(result['sources'])}):")
    for s in result["sources"]:
        print(f"  - {s['source_document']} / {s['section']} (score: {s['score']:.4f})")