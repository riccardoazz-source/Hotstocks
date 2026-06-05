import { scoreBg } from "@/lib/format";

export function ScoreBar({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  return (
    <div className={`h-2 w-full rounded-full bg-white/10 ${className}`}>
      <div
        className={`h-2 rounded-full ${scoreBg(value)}`}
        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
      />
    </div>
  );
}
