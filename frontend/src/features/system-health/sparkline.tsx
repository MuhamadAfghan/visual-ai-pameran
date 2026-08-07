type Props = {
  values: number[];
  color?: string;
  height?: number;
  width?: number;
  fill?: boolean;
};

export function Sparkline({ values, color = "#10b981", height = 28, width = 100, fill = true }: Props) {
  if (values.length === 0) {
    return <div className="h-7 w-full bg-surface-elevated/40 rounded" />;
  }

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const areaPath = `M0,${height} L${points.replace(/,/g, " ").split(" ").reduce((acc, _, i, arr) => {
    if (i % 2 === 0) return acc + (acc ? " L" : "") + arr[i] + "," + arr[i + 1];
    return acc;
  }, "")} L${width},${height} Z`;

  const gradientId = `spark-${color.replace("#", "")}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className="block"
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradientId})`} />
        </>
      )}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
