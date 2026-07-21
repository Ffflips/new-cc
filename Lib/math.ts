// Signal-processing primitives for Engine 2 (Wave Engine).
// These are deliberately dependency-free, pure-TS implementations so the
// engine can run inside a Vercel serverless function without native bindings.

/** Discrete Fourier Transform (O(n^2), fine for the 240-320 sample windows used here). */
export function dft(signal: number[]): { re: number[]; im: number[] } {
  const N = signal.length;
  const re = new Array(N).fill(0);
  const im = new Array(N).fill(0);
  for (let k = 0; k < N; k++) {
    let sumRe = 0;
    let sumIm = 0;
    for (let n = 0; n < N; n++) {
      const angle = (-2 * Math.PI * k * n) / N;
      sumRe += signal[n] * Math.cos(angle);
      sumIm += signal[n] * Math.sin(angle);
    }
    re[k] = sumRe;
    im[k] = sumIm;
  }
  return { re, im };
}

/** Power spectrum (magnitude^2) from a real-valued signal, positive frequencies only. */
export function powerSpectrum(signal: number[]): number[] {
  const { re, im } = dft(signal);
  const N = signal.length;
  const half = Math.floor(N / 2);
  const power = new Array(half);
  for (let k = 0; k < half; k++) {
    power[k] = re[k] * re[k] + im[k] * im[k];
  }
  return power;
}

/** Dominant frequency (as a fraction of Nyquist, i.e. cycles/bar) and its normalized energy. */
export function dominantFrequency(signal: number[]): { freq: number; energy: number } {
  const power = powerSpectrum(signal);
  // Skip bin 0 (DC component) — it carries the mean level, not cyclical info.
  let maxIdx = 1;
  let maxVal = -Infinity;
  let total = 0;
  for (let i = 1; i < power.length; i++) {
    total += power[i];
    if (power[i] > maxVal) {
      maxVal = power[i];
      maxIdx = i;
    }
  }
  const freq = maxIdx / signal.length;
  const energy = total > 0 ? maxVal / total : 0;
  return { freq, energy };
}

/** Shannon entropy of a normalized power spectrum, scaled to 0-1. */
export function spectralEntropy(signal: number[]): number {
  const power = powerSpectrum(signal);
  const total = power.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  const probs = power.map((p) => p / total).filter((p) => p > 0);
  const H = -probs.reduce((acc, p) => acc + p * Math.log2(p), 0);
  const Hmax = Math.log2(power.length);
  return Hmax > 0 ? H / Hmax : 0;
}

/**
 * Hilbert-transform-derived instantaneous phase (degrees) of the most recent sample.
 * Implemented via the DFT: zero out negative frequencies, double positive ones,
 * inverse-transform, and take arg(analytic signal).
 */
export function instantaneousPhase(signal: number[]): number {
  const N = signal.length;
  const { re, im } = dft(signal);
  // Build the analytic signal spectrum.
  const are = new Array(N).fill(0);
  const aim = new Array(N).fill(0);
  const half = Math.floor(N / 2);
  for (let k = 0; k < N; k++) {
    let mult = 0;
    if (k === 0 || (N % 2 === 0 && k === N / 2)) mult = 1;
    else if (k < half || (N % 2 !== 0 && k === half)) mult = 2;
    are[k] = re[k] * mult;
    aim[k] = im[k] * mult;
  }
  // Inverse DFT of just the last sample's contribution is enough for the phase at n = N-1.
  const n = N - 1;
  let sumRe = 0;
  let sumIm = 0;
  for (let k = 0; k < N; k++) {
    const angle = (2 * Math.PI * k * n) / N;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    sumRe += are[k] * cos - aim[k] * sin;
    sumIm += are[k] * sin + aim[k] * cos;
  }
  const phaseRad = Math.atan2(sumIm, sumRe);
  const deg = (phaseRad * 180) / Math.PI;
  return deg < 0 ? deg + 360 : deg;
}

/** Hurst exponent via classic rescaled-range (R/S) analysis. */
export function hurstExponent(signal: number[]): number {
  const N = signal.length;
  if (N < 20) return 0.5;
  const chunkSizes = [8, 16, 32, 64].filter((n) => n < N / 2);
  const points: [number, number][] = [];

  for (const size of chunkSizes) {
    const chunks = Math.floor(N / size);
    if (chunks < 1) continue;
    let rsSum = 0;
    let count = 0;
    for (let c = 0; c < chunks; c++) {
      const chunk = signal.slice(c * size, (c + 1) * size);
      const mean = chunk.reduce((a, b) => a + b, 0) / chunk.length;
      const deviations = chunk.map((x) => x - mean);
      const cumulative: number[] = [];
      deviations.reduce((acc, d, i) => {
        const v = acc + d;
        cumulative[i] = v;
        return v;
      }, 0);
      const range = Math.max(...cumulative) - Math.min(...cumulative);
      const std = Math.sqrt(chunk.reduce((a, b) => a + (b - mean) ** 2, 0) / chunk.length);
      if (std > 0) {
        rsSum += range / std;
        count++;
      }
    }
    if (count > 0) {
      points.push([Math.log(size), Math.log(rsSum / count)]);
    }
  }

  if (points.length < 2) return 0.5;
  // Linear regression slope = Hurst exponent.
  const n = points.length;
  const sumX = points.reduce((a, [x]) => a + x, 0);
  const sumY = points.reduce((a, [, y]) => a + y, 0);
  const sumXY = points.reduce((a, [x, y]) => a + x * y, 0);
  const sumXX = points.reduce((a, [x]) => a + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0.5;
  const slope = (n * sumXY - sumX * sumY) / denom;
  return Math.max(0, Math.min(1, slope));
}

/** Higuchi fractal dimension — measures the "roughness" of the price path. */
export function higuchiFractalDimension(signal: number[], kMax = 8): number {
  const N = signal.length;
  const points: [number, number][] = [];

  for (let k = 1; k <= kMax; k++) {
    let Lk = 0;
    for (let m = 0; m < k; m++) {
      let Lmk = 0;
      let count = 0;
      for (let i = 1; i < Math.floor((N - m) / k); i++) {
        Lmk += Math.abs(signal[m + i * k] - signal[m + (i - 1) * k]);
        count++;
      }
      if (count > 0) {
        Lmk = (Lmk * (N - 1)) / (count * k * k);
        Lk += Lmk;
      }
    }
    Lk = Lk / k;
    if (Lk > 0) points.push([Math.log(1 / k), Math.log(Lk)]);
  }

  if (points.length < 2) return 1.5;
  const n = points.length;
  const sumX = points.reduce((a, [x]) => a + x, 0);
  const sumY = points.reduce((a, [, y]) => a + y, 0);
  const sumXY = points.reduce((a, [x, y]) => a + x * y, 0);
  const sumXX = points.reduce((a, [x]) => a + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 1.5;
  const slope = (n * sumXY - sumX * sumY) / denom;
  return Math.max(1, Math.min(2, slope));
}

/** Simple finite-difference derivatives (velocity/acceleration/jerk) of the last few samples. */
export function derivatives(signal: number[]): { velocity: number; acceleration: number; jerk: number } {
  const N = signal.length;
  if (N < 4) return { velocity: 0, acceleration: 0, jerk: 0 };
  const d1 = signal.map((v, i) => (i === 0 ? 0 : v - signal[i - 1]));
  const d2 = d1.map((v, i) => (i === 0 ? 0 : v - d1[i - 1]));
  const d3 = d2.map((v, i) => (i === 0 ? 0 : v - d2[i - 1]));
  const scale = signal[N - 1] || 1;
  return {
    velocity: d1[N - 1] / scale,
    acceleration: d2[N - 1] / scale,
    jerk: d3[N - 1] / scale
  };
}

/** Local curvature at the end of the series via a 3-point discrete approximation. */
export function localCurvature(signal: number[]): number {
  const N = signal.length;
  if (N < 3) return 0;
  const [a, b, c] = [signal[N - 3], signal[N - 2], signal[N - 1]];
  const scale = c || 1;
  return (a - 2 * b + c) / scale;
}

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function std(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

export function zscoreNormalize(xs: number[]): number[] {
  const m = mean(xs);
  const s = std(xs) || 1;
  return xs.map((x) => (x - m) / s);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

export function pearsonCorrelation(a: number[], b: number[]): number {
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  const denom = Math.sqrt(da * db);
  return denom === 0 ? 0 : num / denom;
}
