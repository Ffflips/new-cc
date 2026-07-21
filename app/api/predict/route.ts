import { NextRequest, NextResponse } from "next/server";
import { getCandles, getFunding, getOpenInterest, type Bar } from "@/lib/okx";
import { computeWaveVector } from "@/lib/wave-engine";
import { computeVolumeProfile } from "@/lib/volume-profile";
import { computeSmartMoney } from "@/lib/smart-money";
import { findTopMatches } from "@/lib/similarity";
import { computeConfidence, computeForecast } from "@/lib/forecast";
import { buildExplanation } from "@/lib/explain";
import { resolveOutcomes } from "@/lib/resolver";
import { getAllVectors, knowledgeBaseSize, saveVector } from "@/lib/store";
import { std } from "@/lib/math";
import type { FeatureVector, PredictResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const instId = searchParams.get("instId") ?? "BTC-USDT-SWAP";
  const bar = (searchParams.get("bar") ?? "1m") as Bar;

  try {
    // Engine 1: Market Collector
    const [candles, funding, oi] = await Promise.all([
      getCandles(instId, bar, 300),
      getFunding(instId).catch(() => ({ ts: Date.now(), fundingRate: 0 })),
      getOpenInterest(instId).catch(() => ({ ts: Date.now(), oi: 0 }))
    ]);

    if (candles.length < 64) {
      return NextResponse.json({ error: "Not enough candle history returned by OKX yet." }, { status: 503 });
    }

    const latest = candles[candles.length - 1];

    // Engine 2, 3, 4
    const wave = computeWaveVector(candles);
    const volumeProfile = computeVolumeProfile(candles);
    // We don't persist a rolling OI time series in this minimal store yet, so
    // approximate the OI series with the two points we have (current snapshot
    // repeated). Swap in a stored OI history for a sharper oiDelta signal.
    const smartMoney = computeSmartMoney({ candles, oiSeries: [oi.oi, oi.oi], fundingRate: funding.fundingRate });

    const currentVector: FeatureVector = {
      id: randomId(),
      instId,
      bar,
      ts: latest.ts,
      wave,
      volumeProfile,
      smartMoney,
      price: latest.close
    };

    // Persist this snapshot so it can be matched against in the future, and
    // resolve any earlier snapshots whose outcome window has now elapsed.
    const history = await getAllVectors(instId, bar);
    await resolveOutcomes(instId, bar, history, candles);
    await saveVector(currentVector);

    // Engine 5: Similarity Engine
    const resolvedHistory = await getAllVectors(instId, bar);
    const topMatches = findTopMatches(currentVector, resolvedHistory, 20);
    const avgSimilarity = topMatches.length
      ? topMatches.reduce((a, m) => a + m.score, 0) / topMatches.length
      : 0;

    // Engine 6: Forecast Engine
    const forecast = computeForecast(topMatches);

    // Engine 7: Confidence Engine
    const recentReturns = candles.slice(-30).map((c, i, arr) => (i === 0 ? 0 : (c.close - arr[i - 1].close) / arr[i - 1].close * 100));
    forecast.confidence = computeConfidence({
      forecast,
      avgSimilarity,
      vacuum: volumeProfile.vacuum,
      smartMoney,
      recentVolatility: std(recentReturns)
    });

    // Engine 8: Explain Engine
    const explanation = buildExplanation({ instId, forecast, wave, volumeProfile, smartMoney, avgSimilarity });

    const kbSize = await knowledgeBaseSize(instId, bar);

    const response: PredictResponse = {
      instId,
      bar,
      ts: latest.ts,
      price: latest.close,
      wave,
      volumeProfile,
      smartMoney,
      forecast,
      topMatches: topMatches.slice(0, 5), // trim payload; full 20 used server-side for scoring
      explanation,
      knowledgeBaseSize: kbSize
    };

    return NextResponse.json(response);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
