// Engine 3: Volume Profile Engine
// Builds a price-by-volume histogram over the lookback window and derives
// the point of control, value area, and a "liquidity vacuum" score that
// measures how thin the volume is between the current price and the
// nearest high-volume node in the direction of travel.

import type { Candle, VolumeProfileVector } from "./types";

const BINS = 48;

export function computeVolumeProfile(candles: Candle[]): VolumeProfileVector {
  const lo = Math.min(...candles.map((c) => c.low));
  const hi = Math.max(...candles.map((c) => c.high));
  const range = hi - lo || hi * 0.0001 || 1;
  const binSize = range / BINS;

  const histogram = new Array(BINS).fill(0);
  for (const c of candles) {
    // Distribute each candle's volume across the bins it spans (typical-price weighting).
    const typical = (c.high + c.low + c.close) / 3;
    let idx = Math.floor((typical - lo) / binSize);
    idx = Math.max(0, Math.min(BINS - 1, idx));
    histogram[idx] += c.volume;
  }

  const totalVolume = histogram.reduce((a, b) => a + b, 0) || 1;
  const pocIdx = histogram.indexOf(Math.max(...histogram));
  const poc = lo + (pocIdx + 0.5) * binSize;

  // Value area: expand outward from POC until it contains 70% of volume.
  let covered = histogram[pocIdx];
  let lowIdx = pocIdx;
  let highIdx = pocIdx;
  while (covered / totalVolume < 0.7 && (lowIdx > 0 || highIdx < BINS - 1)) {
    const belowVol = lowIdx > 0 ? histogram[lowIdx - 1] : -1;
    const aboveVol = highIdx < BINS - 1 ? histogram[highIdx + 1] : -1;
    if (aboveVol >= belowVol) {
      highIdx++;
      covered += histogram[highIdx];
    } else {
      lowIdx--;
      covered += histogram[lowIdx];
    }
  }
  const val = lo + lowIdx * binSize;
  const vah = lo + (highIdx + 1) * binSize;

  // HVN/LVN: bins in the top/bottom quartile of volume density.
  const sorted = [...histogram].sort((a, b) => a - b);
  const lvnThreshold = sorted[Math.floor(BINS * 0.25)];
  const hvnThreshold = sorted[Math.floor(BINS * 0.75)];

  const currentPrice = candles[candles.length - 1].close;
  const currentIdx = Math.max(0, Math.min(BINS - 1, Math.floor((currentPrice - lo) / binSize)));

  const lvnIndices = histogram
    .map((v, i) => (v <= lvnThreshold ? i : -1))
    .filter((i) => i >= 0);
  const hvnIndices = histogram
    .map((v, i) => (v >= hvnThreshold ? i : -1))
    .filter((i) => i >= 0);

  const nearestLvnIdx = nearestIndex(lvnIndices, currentIdx);
  const nearestHvnIdx = nearestIndex(hvnIndices, currentIdx);

  const nearestLvnPrice = lo + (nearestLvnIdx + 0.5) * binSize;
  const nearestHvnPrice = lo + (nearestHvnIdx + 0.5) * binSize;

  const nearestLvnDistance = pctDistance(currentPrice, nearestLvnPrice);
  const nearestHvnDistance = pctDistance(currentPrice, nearestHvnPrice);

  // Vacuum score: how much low-volume space sits between current price and
  // the value area boundary in the direction the price is currently moving.
  const movingUp = candles[candles.length - 1].close >= candles[candles.length - 2].close;
  const boundaryIdx = movingUp ? highIdx : lowIdx;
  const span = Math.abs(boundaryIdx - currentIdx) || 1;
  let thinBins = 0;
  const step = movingUp ? 1 : -1;
  for (let i = currentIdx; i !== boundaryIdx; i += step) {
    if (i < 0 || i >= BINS) break;
    if (histogram[i] <= lvnThreshold) thinBins++;
  }
  const vacuum = Math.round((thinBins / span) * 100);

  return {
    poc: round(poc),
    vah: round(vah),
    val: round(val),
    nearestHvnDistance: round(nearestHvnDistance, 3),
    nearestLvnDistance: round(nearestLvnDistance, 3),
    vacuum: Math.max(0, Math.min(100, vacuum))
  };
}

export function volumeProfileToArray(v: VolumeProfileVector, currentPrice: number): number[] {
  return [
    pctDistance(currentPrice, v.poc) / 100,
    pctDistance(currentPrice, v.vah) / 100,
    pctDistance(currentPrice, v.val) / 100,
    v.nearestHvnDistance / 100,
    v.nearestLvnDistance / 100,
    v.vacuum / 100
  ];
}

function nearestIndex(candidates: number[], from: number): number {
  if (candidates.length === 0) return from;
  return candidates.reduce((best, i) => (Math.abs(i - from) < Math.abs(best - from) ? i : best));
}

function pctDistance(a: number, b: number): number {
  return a === 0 ? 0 : ((b - a) / a) * 100;
}

function round(x: number, dp = 2) {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
