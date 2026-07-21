// Engine 8: AI Explain Engine
// Never says "go long." Always says why the forecast engine landed where it
// did, in terms a human can check against the underlying data.

import type { ForecastResult, SmartMoneyVector, VolumeProfileVector, WaveVector } from "./types";
import { CONFIDENCE_FLOOR, meetsConfidenceFloor } from "./forecast";

export function buildExplanation(params: {
  instId: string;
  forecast: ForecastResult;
  wave: WaveVector;
  volumeProfile: VolumeProfileVector;
  smartMoney: SmartMoneyVector;
  avgSimilarity: number;
}): string {
  const { instId, forecast, wave, volumeProfile, smartMoney, avgSimilarity } = params;

  if (!meetsConfidenceFloor(forecast.confidence)) {
    return (
      `${instId}: confidence is ${forecast.confidence.toFixed(1)}, below the ${CONFIDENCE_FLOOR} floor ` +
      `this system requires before stating a directional lean. Reasons include a small or noisy sample ` +
      `of historical matches (${forecast.sampleSize} found), weak similarity to prior cases ` +
      `(avg ${avgSimilarity.toFixed(1)}%), or elevated trap risk (${smartMoney.trapProbability}%). ` +
      `No forecast is issued — this is a deliberate guardrail, not a missing feature.`
    );
  }

  const direction = forecast.upProbability >= 50 ? "up" : "down";
  const prob = direction === "up" ? forecast.upProbability : forecast.downProbability;
  const upCount = Math.round((forecast.upProbability / 100) * forecast.sampleSize);
  const downCount = forecast.sampleSize - upCount;

  const parts: string[] = [];
  parts.push(
    `${instId}: ${forecast.sampleSize} historically similar structures found (avg similarity ${avgSimilarity.toFixed(1)}%).`
  );
  parts.push(`Of those, ${upCount} resolved up and ${downCount} resolved down.`);

  if (volumeProfile.vacuum >= 60) {
    parts.push(`Price is entering a liquidity vacuum (score ${volumeProfile.vacuum}) with little volume to slow it down.`);
  }
  if (smartMoney.oiDelta > 2 && smartMoney.cvd > 0) {
    parts.push(`Open interest is rising (${smartMoney.oiDelta.toFixed(1)}%) alongside positive delta — consistent with new positioning, not just covering.`);
  } else if (smartMoney.oiDelta < -2) {
    parts.push(`Open interest is falling (${smartMoney.oiDelta.toFixed(1)}%), suggesting position unwinding rather than fresh conviction.`);
  }
  if (Math.abs(smartMoney.fundingRate) > 0.0005) {
    parts.push(`Funding is stretched (${(smartMoney.fundingRate * 100).toFixed(4)}%), which raises the odds of a squeeze in either direction.`);
  }
  parts.push(`Dominant wave phase is ${wave.phase.toFixed(0)}° with a Hurst exponent of ${wave.hurst.toFixed(2)} (${wave.hurst > 0.55 ? "trending" : wave.hurst < 0.45 ? "mean-reverting" : "neutral"} regime).`);

  parts.push(
    `Net read: ${prob.toFixed(1)}% probability of a move ${direction}, expected magnitude ${forecast.expectedMovePct >= 0 ? "+" : ""}${forecast.expectedMovePct.toFixed(2)}% ` +
      `over roughly ${forecast.expectedTimeMinutes} minutes, confidence ${forecast.confidence.toFixed(1)}.`
  );
  parts.push("This is a probability estimate derived from historical pattern matches, not a trade instruction.");

  return parts.join(" ");
}
