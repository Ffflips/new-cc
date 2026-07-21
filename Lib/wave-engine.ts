// Engine 2: Wave Engine
// This is the mathematical core of AF. No MACD, no EMA — every field here
// comes from spectral analysis, fractal geometry, or calculus on the price
// path itself (constraint #1 from the project spec).

import type { Candle, WaveVector } from "./types";
import {
  derivatives,
  dominantFrequency,
  higuchiFractalDimension,
  hurstExponent,
  instantaneousPhase,
  localCurvature,
  spectralEntropy
} from "./math";

export function computeWaveVector(candles: Candle[]): WaveVector {
  if (candles.length < 32) {
    throw new Error("Wave Engine needs at least 32 candles to produce a stable estimate.");
  }
  const closes = candles.map((c) => c.close);

  // De-trend to log-returns for the spectral analysis so the FFT sees
  // oscillation, not the underlying price level.
  const logReturns = closes.slice(1).map((c, i) => Math.log(c / closes[i]));

  const { freq, energy } = dominantFrequency(logReturns);
  const entropy = spectralEntropy(logReturns);
  const phase = instantaneousPhase(logReturns);
  const hurst = hurstExponent(logReturns);
  const fractal = higuchiFractalDimension(closes);
  const { velocity, acceleration, jerk } = derivatives(closes);
  const curvature = localCurvature(closes);

  return {
    phase: round(phase, 1),
    freq: round(freq, 4),
    energy: round(clamp01(energy), 3),
    entropy: round(clamp01(entropy), 3),
    hurst: round(hurst, 3),
    fractal: round(fractal, 3),
    velocity: round(velocity, 5),
    acceleration: round(acceleration, 5),
    jerk: round(jerk, 5),
    curvature: round(curvature, 5)
  };
}

/** Flattens a WaveVector into a numeric array for similarity comparisons. */
export function waveVectorToArray(w: WaveVector): number[] {
  return [
    w.phase / 360,
    w.freq,
    w.energy,
    w.entropy,
    w.hurst,
    w.fractal / 2,
    w.velocity,
    w.acceleration,
    w.jerk,
    w.curvature
  ];
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function round(x: number, dp: number) {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
