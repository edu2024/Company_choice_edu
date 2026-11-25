"use client";

import { useState, type FormEvent } from "react";

const API_URL = process.env.NEXT_PUBLIC_INCIDENT_API_URL ?? "http://127.0.0.1:8000";

interface Source {
  source_document: string;
  section: string;
  score: number;
}

interface QueryResult {
  answer: string;
  sources: Source[];
}

export default function KnowledgePage() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch(`${API_URL}/knowledge/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `HTTP ${res.status}`);
      }

      const data: QueryResult = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to query knowledge base");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="shell">
      <aside>
        <div className="mark">HC</div>
        <strong>HealthCore<br />Operations</strong>
        <nav>
          <a href="/">Panel</a>
          <a href="/knowledge" className="active">Knowledge</a>
          <a href="#incidents">Incidencias</a>
        </nav>
        <small>Uso interno · Sin PHI</small>
      </aside>
      <main>
        <header>
          <div>
            <p className="eyebrow">Knowledge base</p>
            <h1>Ask HealthCore</h1>
            <p className="subtitle">
              Ask a question about our policies, coverage, and procedures.
            </p>
          </div>
        </header>

        <section className="query-section">
          <form onSubmit={handleSubmit} className="query-form">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder='e.g. "What insurance do you accept?" or "What do I need for my first appointment?"'
              className="query-input"
              disabled={loading}
            />
            <button type="submit" className="query-button" disabled={loading || !question.trim()}>
              {loading ? "Searching..." : "Ask"}
            </button>
          </form>

          {error && <div className="error-box">{error}</div>}

          {result && (
            <div className="result-box">
              <div className="answer-box">
                <h3>Answer</h3>
                <p>{result.answer}</p>
              </div>

              {result.sources.length > 0 && (
                <div className="sources-box">
                  <h3>Sources</h3>
                  <ul>
                    {result.sources.map((s, i) => (
                      <li key={i}>
                        <strong>{s.source_document}</strong> &mdash; {s.section}
                        <br />
                        <span className="score">Relevance: {(s.score * 100).toFixed(1)}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <style>{`
        .query-section {
          max-width: 720px;
        }
        .query-form {
          display: flex;
          gap: 12px;
          margin-bottom: 28px;
        }
        .query-input {
          flex: 1;
          padding: 14px 18px;
          border: 1px solid var(--line);
          border-radius: 6px;
          font-size: 16px;
          background: white;
          color: var(--ink);
        }
        .query-input:focus {
          outline: none;
          border-color: var(--teal);
          box-shadow: 0 0 0 3px rgba(8, 127, 120, 0.15);
        }
        .query-button {
          padding: 14px 28px;
          background: var(--teal);
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }
        .query-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .query-button:hover:not(:disabled) {
          background: #066b65;
        }
        .error-box {
          padding: 16px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 6px;
          color: #b33b31;
          margin-bottom: 20px;
        }
        .result-box {
          background: white;
          border-radius: 8px;
          border: 1px solid var(--line);
          overflow: hidden;
        }
        .answer-box {
          padding: 28px;
          border-bottom: 1px solid var(--line);
        }
        .answer-box h3,
        .sources-box h3 {
          margin: 0 0 12px;
          font-family: Georgia, serif;
          font-weight: 500;
          color: var(--ink);
        }
        .answer-box p {
          margin: 0;
          line-height: 1.6;
          color: #2a4442;
          white-space: pre-wrap;
        }
        .sources-box {
          padding: 20px 28px;
          background: #f8faf8;
        }
        .sources-box ul {
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .sources-box li {
          padding: 8px 0;
          border-bottom: 1px solid var(--line);
          font-size: 14px;
          line-height: 1.5;
        }
        .sources-box li:last-child {
          border-bottom: none;
        }
        .score {
          color: var(--teal);
          font-size: 12px;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}