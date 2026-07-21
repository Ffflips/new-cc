// Engine 6: Forecast Engine — turns the top-N similarity matches into a
// probability, never a "prediction" in the buy/sell sense.
// Engine 7: Confidence Engine — a second, independent score for how much to
// trust that probability. Below the configured threshold, the API refuses
// to state a directional lean at all (constraint: "低于70，禁止预测" — the
// project spec's explicit ban on forecasting under low confidence).

import type { ForecastResult, SimilarityMatch, VolumeProfileVector, SmartMoneyVector } from "./types";

const CONFIDENCE_FLOOR = 70;

export function computeForecast(matches: SimilarityMatch[]): ForecastResult {
  const sampleSize = matches.length;
  if (sampleSize === 0) {
    return {
      upProbability: 50,
      downProbability: 50,
      sampleSize: 0,
      winRate: 0,
      expectedMovePct: 0,
      expectedTimeMinutes: 0,
      confidence: 0
    };
  }

  // Weight each historical case by its similarity score so closer matches
  // count more than the 20th-nearest one.
  const totalWeight = matches.reduce((a, m) => a + m.score, 0) || 1;
  let upWeight = 0;
  let moveSum = 0;
  let timeSum = 0;

  for (const m of matches) {
    const outcome = m.vector.outcome!;
    if (outcome.direction === "up") upWeight += m.score;
    moveSum += outcome.pctChange * m.score;
    timeSum += outcome.horizonBars * m.score;
  }

  const upProbability = round((upWeight / totalWeight) * 100, 1);
  const downProbability = round(100 - upProbability, 1);
  const expectedMovePct = round(moveSum / totalWeight, 3);
  const expectedTimeMinutes = Math.round(timeSum / totalWeight);

  const majorityDirection = upProbability >= 50 ? "up" : "down";
  const agreeing = matches.filter((m) => m.vector.outcome!.direction === majorityDirection);
  const winRate = round((agreeing.length / sampleSize) * 100, 1);

  return {
    upProbability,
    downProbability,
    sampleSize,
    winRate,
    expectedMovePct,
    expectedTimeMinutes,
    confidence: 0 // filled in by computeConfidence
  };
}

export interface ConfidenceInputs {
  forecast: ForecastResult;
  avgSimilarity: number; // mean score of the top matches, 0-100
  vacuum: VolumeProfileVector["vacuum"];
  smartMoney: SmartMoneyVector;
  recentVolatility: number; // stdev of recent returns, as a %
}

export function computeConfidence({
  forecast,
  avgSimilarity,
  vacuum,
  smartMoney,
  recentVolatility
}: ConfidenceInputs): number {
  if (forecast.sampleSize < 5) return 0; // not enough history to say anything.

  const sampleFactor = clamp01(forecast.sampleSize / 20) * 100;
  const consensusFactor = Math.abs(forecast.upProbability - 50) * 2; // 0 at 50/50, 100 at 0/100
  const winRateFactor = forecast.winRate;
  const similarityFactor = avgSimilarity;
  const trapPenalty = smartMoney.trapProbability;
  const volPenalty = clamp01(recentVolatility / 5) * 100; // very high vol erodes confidence

  const raw =
    0.3 * similarityFactor +
    0.25 * winRateFactor +
    0.2 * consensusFactor +
    0.15 * sampleFactor +
    0.1 * (100 - volPenalty) -
    0.15 * trapPenalty;

  return round(clamp(raw, 0, 100), 1);
}

export function meetsConfidenceFloor(confidence: number): boolean {
  return confidence >= CONFIDENCE_FLOOR;
}

export { CONFIDENCE_FLOOR };

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}
function clamp(x: number, min: number, max: number) {
  return Math.max(min, Math.min(max, x));
}
function round(x: number, dp: number) {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
