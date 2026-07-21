// Walks backwards through OKX history-candles, and for every step-th candle
// builds a full feature vector plus its (already-known, since we're looking
// at history) outcome, seeding the Similarity Engine's knowledge base.
// This is what turns AF from "compares against nothing" into "compares
// against a real Pattern Library" (see project spec's Pattern Library note).

import { getCandles, getHistoryCandles, type Bar } from "./okx";
import { computeWaveVector } from "./wave-engine";
import { computeVolumeProfile } from "./volume-profile";
import { computeSmartMoney } from "./smart-money";
import { saveVector } from "./store";
import { DEFAULT_HORIZON_BARS } from "./resolver";
import type { Candle, FeatureVector } from "./types";

const WINDOW = 300; // candles fed into Wave/Volume engines per snapshot
const STEP = 5; // stride between snapshots, so we don't store near-duplicate windows

export interface BackfillOptions {
  instId: string;
  bar: Bar;
  pages: number; // number of 100-candle history pages to pull, walking backwards
}

export interface BackfillResult {
  candlesFetched: number;
  vectorsStored: number;
  oldestTs: number | null;
  newestTs: number | null;
}

export async function runBackfill({ instId, bar, pages }: BackfillOptions): Promise<BackfillResult> {
  // Start from the most recent candles, then page backwards through history.
  const recent = await getCandles(instId, bar, 300);
  let all: Candle[] = [...recent];
  let cursor = recent[0]?.ts;

  for (let p = 0; p < pages && cursor; p++) {
    const older = await getHistoryCandles(instId, bar, cursor, 100);
    if (older.length === 0) break;
    all = [...older, ...all];
    cursor = older[0].ts;
    // Be polite to OKX's public rate limits between pages.
    await sleep(250);
  }

  // Dedupe + sort ascending by time.
  const byTs = new Map(all.map((c) => [c.ts, c]));
  const sorted = Array.from(byTs.values()).sort((a, b) => a.ts - b.ts);

  let stored = 0;
  for (let i = WINDOW; i < sorted.length - DEFAULT_HORIZON_BARS; i += STEP) {
    const windowCandles = sorted.slice(i - WINDOW, i);
    const future = sorted[i + DEFAULT_HORIZON_BARS];
    const current = sorted[i];
    if (!future || !current) continue;

    try {
      const wave = computeWaveVector(windowCandles);
      const volumeProfile = computeVolumeProfile(windowCandles);
      // No historical OI series stored yet for backfilled points — approximate
      // as flat (0% delta). This mildly under-informs Engine 4 for backfilled
      // vectors only; live vectors captured via /api/predict use real OI.
      const smartMoney = computeSmartMoney({ candles: windowCandles, oiSeries: [1, 1], fundingRate: 0 });

      const pctChange = ((future.close - current.close) / current.close) * 100;
      const direction = pctChange > 0.05 ? "up" : pctChange < -0.05 ? "down" : "flat";

      const vector: FeatureVector = {
        id: `bf-${current.ts}`,
        instId,
        bar,
        ts: current.ts,
        wave,
        volumeProfile,
        smartMoney,
        price: current.close,
        outcome: {
          horizonBars: DEFAULT_HORIZON_BARS,
          pctChange: Math.round(pctChange * 1000) / 1000,
          direction,
          resolvedAt: Date.now()
        }
      };
      await saveVector(vector);
      stored++;
    } catch {
      // Skip windows that don't have enough data for a stable estimate.
      continue;
    }
  }

  return {
    candlesFetched: sorted.length,
    vectorsStored: stored,
    oldestTs: sorted[0]?.ts ?? null,
    newestTs: sorted[sorted.length - 1]?.ts ?? null
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
