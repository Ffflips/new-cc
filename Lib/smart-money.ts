// Engine 4: Smart Money Engine
// Distinguishes "real" positioning from noise using cumulative volume delta,
// open-interest change, and funding — then flags when a move looks like a
// liquidity trap (price moves one way while positioning data disagrees).

import type { Candle, SmartMoneyVector } from "./types";

export interface SmartMoneyInputs {
  candles: Candle[];
  oiSeries: number[]; // recent open-interest snapshots, oldest -> newest
  fundingRate: number;
}

export function computeSmartMoney({ candles, oiSeries, fundingRate }: SmartMoneyInputs): SmartMoneyVector {
  // Approximate per-candle delta using the classic "close position within range" proxy:
  // a close near the high implies buy-side aggression, near the low implies sell-side.
  // This is a standard approximation when raw tick-level trade data isn't being stored.
  let cumulativeDelta = 0;
  let maxAbsCum = 0;
  const cumSeries: number[] = [];
  for (const c of candles) {
    const range = c.high - c.low || 1e-9;
    const buyRatio = (c.close - c.low) / range; // 0 = all sell pressure, 1 = all buy pressure
    const delta = (buyRatio - 0.5) * 2 * c.volume;
    cumulativeDelta += delta;
    cumSeries.push(cumulativeDelta);
    maxAbsCum = Math.max(maxAbsCum, Math.abs(cumulativeDelta));
  }
  const cvd = maxAbsCum > 0 ? clamp(cumulativeDelta / maxAbsCum, -1, 1) : 0;

  const oiStart = oiSeries[0] ?? 0;
  const oiEnd = oiSeries[oiSeries.length - 1] ?? 0;
  const oiDelta = oiStart > 0 ? ((oiEnd - oiStart) / oiStart) * 100 : 0;

  const priceStart = candles[0].close;
  const priceEnd = candles[candles.length - 1].close;
  const priceUp = priceEnd >= priceStart;

  // Long-building: price up + OI up + positive delta all agree.
  const longOpenScore = clamp(
    scoreAgreement([priceUp, oiDelta > 0, cvd > 0]) * 100,
    0,
    100
  );

  // Short-covering: price up + OI down (shorts closing, not new longs) + positive delta.
  const shortCoverScore = clamp(
    scoreAgreement([priceUp, oiDelta < 0, cvd > 0]) * 100,
    0,
    100
  );

  // Trap probability: price direction disagrees with CVD/OI — classic stop-hunt signature.
  const priceDeltaAgree = priceUp === cvd > 0;
  const trapProbability = clamp(
    (priceDeltaAgree ? 0 : 60) + (Math.abs(fundingRate) > 0.0005 ? 20 : 0) + (Math.abs(oiDelta) > 5 && !priceDeltaAgree ? 20 : 0),
    0,
    100
  );

  return {
    cvd: round(cvd, 3),
    oiDelta: round(oiDelta, 3),
    fundingRate: round(fundingRate, 6),
    longOpenScore: round(longOpenScore, 1),
    shortCoverScore: round(shortCoverScore, 1),
    trapProbability: round(trapProbability, 1)
  };
}

export function smartMoneyToArray(s: SmartMoneyVector): number[] {
  return [s.cvd, s.oiDelta / 100, s.fundingRate * 1000, s.longOpenScore / 100, s.shortCoverScore / 100, s.trapProbability / 100];
}

function scoreAgreement(flags: boolean[]): number {
  return flags.filter(Boolean).length / flags.length;
}

function clamp(x: number, min: number, max: number) {
  return Math.max(min, Math.min(max, x));
}

function round(x: number, dp: number) {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
