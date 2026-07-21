// Closes the loop between "Prediction" and "Outcome" in the knowledge base.
// A feature vector stored at time T is only useful to the Similarity Engine
// once we know what actually happened `horizonBars` later. This walks
// unresolved vectors and fills in their outcome once enough candles exist.

import type { Candle, FeatureVector } from "./types";
import { updateOutcome } from "./store";

const DEFAULT_HORIZON_BARS = 15; // e.g. 15 x 1m bars = 15 minutes ahead
const FLAT_THRESHOLD_PCT = 0.05;

export async function resolveOutcomes(
  instId: string,
  bar: string,
  history: FeatureVector[],
  latestCandles: Candle[]
): Promise<void> {
  const closesByTs = new Map(latestCandles.map((c) => [c.ts, c.close]));
  const sortedTs = latestCandles.map((c) => c.ts).sort((a, b) => a - b);

  for (const v of history) {
    if (v.outcome) continue;
    const targetIdx = sortedTs.findIndex((ts) => ts === v.ts);
    if (targetIdx === -1) continue;
    const resolveIdx = targetIdx + DEFAULT_HORIZON_BARS;
    if (resolveIdx >= sortedTs.length) continue; // not enough future data yet

    const futureClose = closesByTs.get(sortedTs[resolveIdx])!;
    const pctChange = ((futureClose - v.price) / v.price) * 100;
    const direction = pctChange > FLAT_THRESHOLD_PCT ? "up" : pctChange < -FLAT_THRESHOLD_PCT ? "down" : "flat";

    await updateOutcome(instId, bar, v.id, {
      horizonBars: DEFAULT_HORIZON_BARS,
      pctChange: Math.round(pctChange * 1000) / 1000,
      direction,
      resolvedAt: Date.now()
    });
  }
}

export { DEFAULT_HORIZON_BARS };
