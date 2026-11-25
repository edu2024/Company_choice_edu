"""
knowledge_router.py — POST /knowledge/query endpoint for the RAG knowledge base.

Uses the retrieve + query pipeline from data.pipelines.rag.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from data.pipelines.rag import query as rag_query

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


class QueryRequest(BaseModel):
    question: str


class Source(BaseModel):
    source_document: str
    section: str
    score: float


class QueryResponse(BaseModel):
    answer: str
    sources: list[Source]


@router.post("/query", response_model=QueryResponse)
def knowledge_query(body: QueryRequest) -> QueryResponse:
    """Answer a question using the HealthCore knowledge base."""
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="question must not be empty")

    result = rag_query(body.question.strip())
    return QueryResponse(
        answer=result["answer"],
        sources=[Source(**s) for s in result["sources"]],
    )