"""
tests/pipelines/test_rag.py — Unit tests for the HealthCore RAG pipeline.

Tests the retrieve() and query() functions using a mocked Qdrant client.
"""

import json
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure the monorepo root is on sys.path for imports
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from data.pipelines.rag import query, retrieve, MIN_SIMILARITY, DEFAULT_K
from data.process.rag import COLLECTION_NAME


class TestRagPipeline(unittest.TestCase):
    """Test retrieve() and query() with mocked Qdrant."""

    @patch("data.pipelines.rag._get_client")
    @patch("data.pipelines.rag.embed")
    def test_retrieve_returns_results(self, mock_embed, mock_get_client):
        """retrieve() returns results with expected structure."""
        mock_embed.return_value = [0.1] * 384

        mock_client = MagicMock()
        mock_hit = MagicMock()
        mock_hit.id = "abc123"
        mock_hit.score = 0.85
        mock_hit.payload = {
            "source_document": "insurance-coverage",
            "section": "United States",
            "text": "Accepted commercial insurance: Blue Cross Blue Shield.",
        }
        from unittest.mock import MagicMock as QMock
        mock_response = QMock()
        mock_response.points = [mock_hit]
        mock_client.query_points.return_value = mock_response
        mock_get_client.return_value = mock_client

        results = retrieve("What insurance is accepted?", k=3)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["source_document"], "insurance-coverage")
        self.assertEqual(results[0]["section"], "United States")
        self.assertGreaterEqual(results[0]["score"], MIN_SIMILARITY)

        # Verify Qdrant query_points was called correctly
        mock_client.query_points.assert_called_once_with(
            collection_name=COLLECTION_NAME,
            query=[0.1] * 384,
            limit=3,
            score_threshold=MIN_SIMILARITY,
        )

    @patch("data.pipelines.rag._get_client")
    @patch("data.pipelines.rag.embed")
    def test_retrieve_empty_when_below_threshold(self, mock_embed, mock_get_client):
        """retrieve() returns empty list when no chunks meet the threshold."""
        mock_embed.return_value = [0.2] * 384

        mock_client = MagicMock()
        mock_empty_response = MagicMock()
        mock_empty_response.points = []
        mock_client.query_points.return_value = mock_empty_response
        mock_get_client.return_value = mock_client

        results = retrieve("Some random question", min_score=0.9)
        self.assertEqual(results, [])

    @patch("data.pipelines.rag.retrieve")
    def test_query_honest_refusal_when_no_chunks(self, mock_retrieve):
        """query() returns an honest refusal when no chunks are retrieved."""
        mock_retrieve.return_value = []

        result = query("Is there coverage for something not in our docs?")
        self.assertIn("sorry", result["answer"].lower())
        self.assertIn("don't have enough information", result["answer"].lower())
        self.assertEqual(result["sources"], [])

    @patch("data.pipelines.rag.retrieve")
    def test_query_includes_sources(self, mock_retrieve):
        """query() returns sources with correct structure."""
        mock_retrieve.return_value = [
            {
                "id": "1",
                "score": 0.85,
                "source_document": "insurance-coverage",
                "section": "United States",
                "text": "Accepted insurance: BCBS.",
            },
        ]

        result = query("What insurance?")
        self.assertIn("answer", result)
        self.assertIn("sources", result)
        self.assertEqual(len(result["sources"]), 1)
        self.assertEqual(result["sources"][0]["source_document"], "insurance-coverage")

    def test_test_queries_json_exists_and_valid(self):
        """Verify that data/eval/test-queries.json exists and has >= 8 entries."""
        path = Path("data/eval/test-queries.json")
        self.assertTrue(path.exists(), "test-queries.json not found")

        with open(path) as f:
            queries = json.load(f)

        self.assertIsInstance(queries, list)
        self.assertGreaterEqual(len(queries), 8)

        for q in queries:
            self.assertIn("question", q)
            self.assertIn("expected_source", q)


if __name__ == "__main__":
    unittest.main()