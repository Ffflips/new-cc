# AF Predict Engine (Adaptive Forecast)

A real-time market-structure monitoring system for OKX USDT perpetual swaps.
It does **not** place trades. It outputs probabilities:

- Probability of up / down move
- Confidence score
- Liquidity vacuum, wave phase, smart-money positioning
- A plain-language explanation for every number (never a bare "buy/sell")

Built as an 8-engine pipeline, matching the original design spec:

| Engine | File | Role |
|---|---|---|
| 1. Market Collector | `lib/okx.ts` | Pulls candles, order book, funding, OI from OKX's public REST API |
| 2. Wave Engine | `lib/wave-engine.ts`, `lib/math.ts` | FFT/Hilbert phase, Hurst exponent, fractal dimension, derivatives — no MACD/EMA |
| 3. Volume Profile Engine | `lib/volume-profile.ts` | POC / VAH / VAL / HVN / LVN / liquidity vacuum |
| 4. Smart Money Engine | `lib/smart-money.ts` | CVD, OI delta, funding, long-build vs short-cover vs trap scores |
| 5. Similarity Engine | `lib/similarity.ts` | Cosine + Euclidean + Pearson match against the stored knowledge base |
| 6. Forecast Engine | `lib/forecast.ts` | Turns top-20 matches into up/down probability |
| 7. Confidence Engine | `lib/forecast.ts` | Independent trust score; forecasts are withheld below a confidence floor (70) |
| 8. Explain Engine | `lib/explain.ts` | Human-readable rationale for every forecast |

Every engine is a plain, independently-testable module in `lib/` — swap or
upgrade any one of them without touching the others.

## Architecture notes

- **Frontend + API**: Next.js 14 (App Router), deployed as Vercel serverless
  functions. `app/api/predict/route.ts` orchestrates all 8 engines per request.
- **Knowledge base**: `lib/store.ts` persists resolved feature vectors
  (Raw Candle → Feature → Vector → Prediction → Outcome) to **Vercel KV**
  (Upstash Redis). Without KV configured it falls back to an in-memory store
  that's fine for local dev but **will not persist** in production — serverless
  functions don't share memory between invocations. Set this up before relying
  on the forecasts (see below).
- **Backfill**: a fresh knowledge base has nothing to compare against, so
  forecasts start at low confidence (the Confidence Engine is designed to
  refuse to call a direction until it has enough good matches — that's a
  guardrail, not a bug). Seed it two ways:
  - Small, quick: the "Backfill recent history" button on the dashboard, or
    `POST /api/backfill?instId=BTC-USDT-SWAP&bar=1m&pages=5`.
  - Large, real backfill: `npm run backfill -- --instId=BTC-USDT-SWAP --bar=1m --pages=2000`
    run locally against the same KV credentials as your Vercel project
    (serverless functions have execution time limits; a proper multi-month
    backfill should run outside one).

## Local development

```bash
npm install
cp .env.example .env.local   # optional: add KV creds for persistence
npm run dev
```

Open http://localhost:3000.

## Deploy: GitHub + Vercel

### 1. Push to GitHub

```bash
cd af-predict-engine
git init
git add .
git commit -m "Initial commit: AF Predict Engine"
git branch -M main
git remote add origin https://github.com/<your-username>/af-predict-engine.git
git push -u origin main
```

(Create the empty repo on GitHub first, e.g. via `gh repo create af-predict-engine --public --source=. --remote=origin` if you have the GitHub CLI installed.)

### 2. Import into Vercel

1. Go to https://vercel.com/new and import the GitHub repo.
2. Framework preset: **Next.js** (auto-detected). No build command changes needed.
3. Deploy. It'll work immediately — with the in-memory store fallback, so the
   knowledge base resets on every cold start until you add KV.

### 3. Add persistence (Vercel KV)

1. In your Vercel project, go to **Storage → Create Database → KV**.
2. Connect it to this project. Vercel injects `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` automatically.
3. Redeploy (Vercel does this automatically after connecting storage).

### 4. Enable continuous data collection (optional but recommended)

`vercel.json` already defines two cron jobs that hit `/api/predict` for BTC
and ETH every 5 minutes, so the knowledge base keeps growing even when
nobody has the dashboard open. Note: the Hobby plan restricts cron
frequency — check your plan's limits at https://vercel.com/docs/cron-jobs
and adjust the `schedule` values if needed.

### 5. Seed the knowledge base

Once deployed, run the CLI backfill from your machine (it just needs your
Vercel KV credentials in the environment):

```bash
KV_REST_API_URL=... KV_REST_API_TOKEN=... npm run backfill -- --instId=BTC-USDT-SWAP --bar=1m --pages=2000
KV_REST_API_URL=... KV_REST_API_TOKEN=... npm run backfill -- --instId=ETH-USDT-SWAP --bar=1m --pages=2000
```

## Roadmap (matches the original v1 → v2 → v3 plan)

- **v1 (this scaffold)**: Market Collector, Wave Engine, Volume Profile,
  Similarity Engine, Forecast/Confidence, dashboard.
- **v2**: richer Smart Money signals from raw trade-tick data (this scaffold
  approximates CVD from candle close-position — swap in `/market/trades` for
  a sharper signal), stored OI time series instead of single snapshots.
- **v3**: self-expanding Pattern Library — cluster resolved vectors into
  named regimes automatically, surface new recurring patterns instead of
  only matching against a fixed feature schema.

## Explicit constraints this codebase follows

1. No MACD/RSI/KDJ as core predictive logic — they're absent entirely; every
   signal here comes from spectral/fractal math or order-flow data.
2. Every forecast ships with an explanation (`lib/explain.ts`).
3. Forecasts are backed by historical matches with recorded outcomes, so win
   rate is always computable from the same data (`lib/forecast.ts`).
4. Engines are decoupled plain modules — replace any one independently.
5. The API and UI surface probability + confidence, never a buy/sell signal.
   Below the confidence floor, no directional lean is stated at all.

## Disclaimer

This is a probability-estimation tool built on historical pattern-matching.
It is not financial advice, does not execute trades, and historical
similarity is not a guarantee of future behavior.
