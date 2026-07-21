"use client";

interface PhaseDialProps {
  phaseDeg: number;
  hurst: number;
  size?: number;
}

/**
 * The one deliberately "designed" element on the page: a compass/sextant-style
 * dial reading the Wave Engine's dominant phase angle. Degree ticks every 30°
 * (like a bearing instrument, not a generic donut gauge), a needle that points
 * to the current phase, and an inner ring whose color leans up/down-neutral
 * based on the Hurst exponent (trending vs mean-reverting regime).
 */
export default function PhaseDial({ phaseDeg, hurst, size = 220 }: PhaseDialProps) {
  const r = size / 2 - 18;
  const cx = size / 2;
  const cy = size / 2;
  const needleAngleRad = ((phaseDeg - 90) * Math.PI) / 180;
  const needleX = cx + r * 0.78 * Math.cos(needleAngleRad);
  const needleY = cy + r * 0.78 * Math.sin(needleAngleRad);

  const regimeColor = hurst > 0.55 ? "#4FD1A5" : hurst < 0.45 ? "#E0665A" : "#C9A15A";

  const ticks = Array.from({ length: 12 }, (_, i) => i * 30);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1F2933" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={r - 14} fill="none" stroke="#1F2933" strokeWidth={1} />

        {ticks.map((deg) => {
          const rad = ((deg - 90) * Math.PI) / 180;
          const outer = r;
          const inner = deg % 90 === 0 ? r - 12 : r - 7;
          const x1 = cx + outer * Math.cos(rad);
          const y1 = cy + outer * Math.sin(rad);
          const x2 = cx + inner * Math.cos(rad);
          const y2 = cy + inner * Math.sin(rad);
          return (
            <line
              key={deg}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={deg % 90 === 0 ? "#7C8A9A" : "#3A4552"}
              strokeWidth={deg % 90 === 0 ? 1.5 : 1}
            />
          );
        })}

        {/* Needle */}
        <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={regimeColor} strokeWidth={2} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={3.5} fill={regimeColor} />
        <circle cx={cx} cy={cy} r={r - 14} fill="none" stroke={regimeColor} strokeWidth={1} opacity={0.35} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-2xl tabular text-fg">{phaseDeg.toFixed(0)}°</span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted mt-1">Wave Phase</span>
      </div>
    </div>
  );
}
