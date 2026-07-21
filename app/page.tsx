"use client";

import { useCallback, useEffect, useState } from "react";
import PredictionCard from "@/components/PredictionCard";
import type { PredictResponse } from "@/lib/types";

const INSTRUMENTS = ["BTC-USDT-SWAP", "ETH-USDT-SWAP"];
const BARS = ["1m", "5m", "15m"];
const POLL_MS = 15000;

export default function Home() {
  const [instId, setInstId] = useState(INSTRUMENTS[0]);
  const [bar, setBar] = useState(BARS[0]);
  const [data, setData] = useState<PredictResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);

  const fetchPrediction = useCallback(async () => {
    try {
      const res = await fetch(`/api/predict?instId=${instId}&bar=${bar}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      setData(json);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch prediction");
    } finally {
      setLoading(false);
    }
  }, [instId, bar]);

  useEffect(() => {
    setLoading(true);
    fetchPrediction();
    const id = setInterval(fetchPrediction, POLL_MS);
    return () => clearInterval(id);
  }, [fetchPrediction]);

  async function triggerBackfill() {
    setBackfilling(true);
    try {
      await fetch(`/api/backfill?instId=${instId}&bar=${bar}&pages=5`, { method: "POST" });
      await fetchPrediction();
    } finally {
      setBackfilling(false);
    }
  }

  return (
    <main className="min-h-screen max-w-5xl mx-auto px-4 md:px-8 py-10">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-brass mb-2">Adaptive Forecast</div>
          <h1 className="font-display text-3xl md:text-4xl font-bold">AF Predict Engine</h1>
          <p className="text-muted text-sm mt-2 max-w-xl">
            Real-time market-structure forecasting for OKX perpetuals. Outputs probabilities and confidence, never
            buy/sell signals — see the &ldquo;Why&rdquo; panel for the reasoning behind every number.
          </p>
        </div>
        <div className="flex flex-col gap-2 items-start md:items-end">
          <div className="flex gap-2">
            {INSTRUMENTS.map((i) => (
              <button
                key={i}
                onClick={() => setInstId(i)}
                className={`px-3 py-1.5 text-sm border rounded-sm font-mono transition-colors ${
                  instId === i ? "border-brass text-brass" : "border-panelLine text-muted hover:text-fg"
                }`}
              >
                {i.split("-")[0]}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {BARS.map((b) => (
              <button
                key={b}
                onClick={() => setBar(b)}
                className={`px-3 py-1 text-xs border rounded-sm font-mono transition-colors ${
                  bar === b ? "border-fg text-fg" : "border-panelLine text-muted hover:text-fg"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      </header>

      {loading && !data && <div className="text-muted text-sm py-16 text-center">Collecting market data…</div>}

      {error && (
        <div className="border border-down/40 bg-down/5 text-down text-sm rounded-sm px-4 py-3 mb-6">{error}</div>
      )}

      {data && <PredictionCard data={data} />}

      {data && data.knowledgeBaseSize < 20 && (
        <div className="mt-6 border border-brass/30 bg-brass/5 rounded-sm px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="text-sm text-fg/90">
            Knowledge base has only <span className="text-brass font-mono">{data.knowledgeBaseSize}</span> stored
            patterns — forecasts stay low-confidence until it grows. Seed it with recent history.
          </div>
          <button
            onClick={triggerBackfill}
            disabled={backfilling}
            className="px-4 py-2 text-sm border border-brass text-brass rounded-sm hover:bg-brass/10 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {backfilling ? "Backfilling…" : "Backfill recent history"}
          </button>
        </div>
      )}

      <footer className="mt-12 text-xs text-muted leading-relaxed border-t border-panelLine pt-6">
        AF Predict Engine outputs statistical probabilities derived from historical pattern matches. It does not
        place orders and is not financial advice. Markets can behave in ways that break historical patterns at any
        time.
      </footer>
    </main>
  );
}
