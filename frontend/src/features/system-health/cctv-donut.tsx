type Segment = {
  label: string;
  value: number;
  color: string;
};

type Props = {
  segments: Segment[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerSubLabel?: string;
};

export function CctvDonut({
  segments,
  size = 160,
  strokeWidth = 16,
  centerLabel,
  centerSubLabel
}: Props) {
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  let offset = 0;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="var(--surface-border)"
          strokeWidth={strokeWidth}
          opacity={0.4}
        />
        {total > 0 &&
          segments.map((s, i) => {
            if (s.value === 0) return null;
            const len = (s.value / total) * circumference;
            const dashArray = `${len} ${circumference - len}`;
            const dashOffset = -offset;
            offset += len;
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={strokeWidth}
                strokeLinecap="butt"
                strokeDasharray={dashArray}
                strokeDashoffset={dashOffset}
                style={{ transition: "stroke-dasharray 600ms ease, stroke-dashoffset 600ms ease" }}
              />
            );
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-3xl font-bold text-content tabular-nums leading-none">{centerLabel ?? total}</p>
        {centerSubLabel && (
          <p className="text-[10px] uppercase tracking-wider text-content-muted mt-1">{centerSubLabel}</p>
        )}
      </div>
    </div>
  );
}
