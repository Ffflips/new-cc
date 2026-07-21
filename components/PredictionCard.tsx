import type { PredictResponse } from "@/lib/types";
import PhaseDial from "./PhaseDial";
import MetricTile from "./MetricTile";

const CONFIDENCE_FLOOR = 70;

export default function PredictionCard({ data }: { data: PredictResponse }) {
  const { forecast, wave, volumeProfile, smartMoney } = data;
  const hasCall = forecast.confidence >= CONFIDENCE_FLOOR && forecast.sampleSize >= 5;
  const direction = forecast.upProbability >= 50 ? "up" : "down";
  const prob = direction === "up" ? forecast.upProbability : forecast.downProbability;

  return (
    <div className="border border-panelLine bg-panel rounded-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-panelLine px-6 py-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted">{data.bar} · perpetual swap</div>
          <div className="font-display text-2xl font-medium mt-0.5">{data.instId}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted">Last Price</div>
          <div className="font-mono text-2xl tabular mt-0.5">
            {data.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Hero: probability + phase dial */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 px-6 py-8 border-b border-panelLine grid-texture">
        <div className="flex flex-col justify-center">
          {hasCall ? (
            <>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted mb-2">
                Probability of move {direction}
              </div>
              <div className={`font-display text-6xl font-bold tabular ${direction === "up" ? "text-up" : "text-down"}`}>
                {prob.toFixed(1)}
                <span className="text-2xl align-top ml-1">%</span>
              </div>
              <div className="mt-3 h-1.5 w-full max-w-xs bg-panelLine rounded-full overflow-hidden">
                <div
                  className={`h-full ${direction === "up" ? "bg-up" : "bg-down"}`}
                  style={{ width: `${prob}%` }}
                />
              </div>
              <div className="text-sm text-muted mt-3">
                Expected move {forecast.expectedMovePct >= 0 ? "+" : ""}
                {forecast.expectedMovePct.toFixed(2)}% over ~{forecast.expectedTimeMinutes}min
              </div>
            </>
          ) : (
            <>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted mb-2">Forecast</div>
              <div className="font-display text-3xl font-bold text-brass">No call — confidence below floor</div>
              <div className="text-sm text-muted mt-3 max-w-md">
                Confidence is {forecast.confidence.toFixed(1)}, under the {CONFIDENCE_FLOOR} threshold this system
                requires before stating a lean. This is a guardrail against thin or noisy historical matches, not a
                bug.
              </div>
            </>
          )}
        </div>
        <div className="flex justify-center md:justify-end">
          <PhaseDial phaseDeg={wave.phase} hurst={wave.hurst} />
        </div>
      </div>

      {/* Metric grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-panelLine">
        <MetricTile label="Confidence" value={forecast.confidence.toFixed(1)} accent={hasCall ? "brass" : "neutral"} />
        <MetricTile label="Similarity" value={`${avgScore(data).toFixed(1)}%`} />
        <MetricTile label="History Matches" value={String(forecast.sampleSize)} sub={`win rate ${forecast.winRate.toFixed(1)}%`} />
        <MetricTile label="Knowledge Base" value={String(data.knowledgeBaseSize)} sub="stored patterns" />

        <MetricTile label="Liquidity Vacuum" value={String(volumeProfile.vacuum)} accent={volumeProfile.vacuum > 60 ? "brass" : "neutral"} />
        <MetricTile label="Nearest LVN" value={`${volumeProfile.nearestLvnDistance >= 0 ? "+" : ""}${volumeProfile.nearestLvnDistance.toFixed(2)}%`} />
        <MetricTile label="POC" value={volumeProfile.poc.toLocaleString(undefined, { maximumFractionDigits: 1 })} />
        <MetricTile label="Value Area" value={`${volumeProfile.val.toFixed(0)} – ${volumeProfile.vah.toFixed(0)}`} />

        <MetricTile label="Hurst" value={wave.hurst.toFixed(2)} sub={wave.hurst > 0.55 ? "trending" : wave.hurst < 0.45 ? "mean-reverting" : "neutral"} />
        <MetricTile label="Entropy" value={wave.entropy.toFixed(2)} />
        <MetricTile
          label="Smart Money"
          value={smartMoney.longOpenScore >= smartMoney.shortCoverScore ? "Building Long" : "Covering Short"}
          accent={smartMoney.cvd >= 0 ? "up" : "down"}
        />
        <MetricTile label="Trap Risk" value={`${smartMoney.trapProbability.toFixed(0)}%`} accent={smartMoney.trapProbability > 60 ? "down" : "neutral"} />
      </div>

      {/* Explain panel */}
      <div className="px-6 py-5 border-t border-panelLine">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted mb-2">Why</div>
        <p className="text-sm leading-relaxed text-fg/90">{data.explanation}</p>
      </div>
    </div>
  );
}

function avgScore(data: PredictResponse): number {
  if (data.topMatches.length === 0) return 0;
  return data.topMatches.reduce((a, m) => a + m.score, 0) / data.topMatches.length;
}
