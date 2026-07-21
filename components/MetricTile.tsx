interface MetricTileProps {
  label: string;
  value: string;
  accent?: "up" | "down" | "brass" | "neutral";
  sub?: string;
}

const accentClass: Record<NonNullable<MetricTileProps["accent"]>, string> = {
  up: "text-up",
  down: "text-down",
  brass: "text-brass",
  neutral: "text-fg"
};

export default function MetricTile({ label, value, accent = "neutral", sub }: MetricTileProps) {
  return (
    <div className="border border-panelLine bg-panel/60 rounded-sm px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.15em] text-muted mb-1.5">{label}</div>
      <div className={`font-mono text-xl tabular leading-none ${accentClass[accent]}`}>{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
}
