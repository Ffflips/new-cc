// Core domain types shared across every engine.
// Keeping these in one place is what lets Engine 1-8 stay decoupled
// (constraint #4 from the project spec: every engine can be swapped independently
// as long as it speaks this shape).

export interface Candle {
  ts: number; // ms epoch, candle open time
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // base-asset volume
  volCcyQuote?: number; // quote-asset volume, when available
}

export interface OrderBookSnapshot {
  ts: number;
  bids: [number, number][]; // [price, size]
  asks: [number, number][];
}

export interface FundingSnapshot {
  ts: number;
  fundingRate: number;
  nextFundingRate?: number;
}

export interface OpenInterestSnapshot {
  ts: number;
  oi: number; // in contracts
  oiCcy?: number; // in underlying currency
}

// ---------- Engine 2: Wave Engine ----------
export interface WaveVector {
  phase: number; // degrees, 0-360 — dominant-cycle phase angle (Hilbert transform)
  freq: number; // dominant normalized frequency (cycles / bar) from FFT
  energy: number; // 0-1, spectral energy concentration in dominant band
  entropy: number; // 0-1, Shannon entropy of the normalized power spectrum
  hurst: number; // Hurst exponent (R/S analysis) — >0.5 trending, <0.5 mean-reverting
  fractal: number; // Higuchi fractal dimension, ~1.0-2.0
  velocity: number; // first derivative of price (normalized)
  acceleration: number; // second derivative of price (normalized)
  jerk: number; // third derivative of price (normalized)
  curvature: number; // local curvature of the price path
}

// ---------- Engine 3: Volume Profile Engine ----------
export interface VolumeProfileVector {
  poc: number; // point of control (price)
  vah: number; // value area high
  val: number; // value area low
  nearestHvnDistance: number; // % distance to nearest high-volume node
  nearestLvnDistance: number; // % distance to nearest low-volume node
  vacuum: number; // 0-100, how "empty" the path ahead is (liquidity vacuum score)
}

// ---------- Engine 4: Smart Money Engine ----------
export interface SmartMoneyVector {
  cvd: number; // normalized cumulative volume delta, -1..1
  oiDelta: number; // % change in open interest over the window
  fundingRate: number; // current funding rate
  longOpenScore: number; // 0-100, likelihood recent OI increase = new longs
  shortCoverScore: number; // 0-100, likelihood recent move = short covering
  trapProbability: number; // 0-100, likelihood the current move is a liquidity trap
}

// Full feature vector persisted to the knowledge base for similarity search.
export interface FeatureVector {
  id: string;
  instId: string;
  bar: string; // e.g. "1m", "5m"
  ts: number;
  wave: WaveVector;
  volumeProfile: VolumeProfileVector;
  smartMoney: SmartMoneyVector;
  price: number;
  // Outcome is filled in later (Engine 6 needs ground truth to backtest against).
  outcome?: {
    horizonBars: number;
    pctChange: number; // % price change `horizonBars` after `ts`
    direction: "up" | "down" | "flat";
    resolvedAt: number;
  };
}

// ---------- Engine 5: Similarity Engine ----------
export interface SimilarityMatch {
  vector: FeatureVector;
  score: number; // 0-100 combined similarity
  cosine: number;
  euclidean: number;
  pearson: number;
}

// ---------- Engine 6/7: Forecast + Confidence ----------
export interface ForecastResult {
  upProbability: number; // 0-100
  downProbability: number; // 0-100
  sampleSize: number; // how many historical matches informed this
  winRate: number; // 0-100, of matches that resolved in the predicted direction
  expectedMovePct: number; // signed, average pct move of matching historical cases
  expectedTimeMinutes: number; // average time-to-resolution of matching cases
  confidence: number; // 0-100, Engine 7 output
}

export interface PredictResponse {
  instId: string;
  bar: string;
  ts: number;
  price: number;
  wave: WaveVector;
  volumeProfile: VolumeProfileVector;
  smartMoney: SmartMoneyVector;
  forecast: ForecastResult;
  topMatches: SimilarityMatch[];
  explanation: string;
  knowledgeBaseSize: number;
}
