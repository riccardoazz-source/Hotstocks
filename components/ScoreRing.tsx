import { scoreColor } from "@/lib/format";

/** A compact circular progress ring showing a 0-100 score. */
export function ScoreRing({
  value,
  size = 60,
  label,
}: {
  value: number;
  size?: number;
  label?: string;
}) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const dash = (pct / 100) * c;

  const colorClass = scoreColor(value);

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-label={label ? `${label}: ${value}` : `Score ${value}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-white/10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          className={colorClass}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-lg font-extrabold leading-none ${colorClass}`}>
          {value.toFixed(0)}
        </span>
      </div>
    </div>
  );
}
