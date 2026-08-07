type Props = {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  stroke?: string;
  fill?: string;
};

export function Sparkline({
  data,
  width = 160,
  height = 40,
  className,
  stroke = "currentColor",
  fill = "currentColor",
}: Props) {
  if (data.length === 0) {
    return <svg width={width} height={height} className={className} />;
  }

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : width;

  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y] as const;
  });

  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${(points[points.length - 1][0]).toFixed(1)},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={areaPath} fill={fill} opacity={0.15} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
