interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  max?: number;
}

export function Sparkline({ data, width = 300, height = 48, color = 'var(--mauve)', max = 100 }: SparklineProps) {
  if (data.length < 2) return <svg width={width} height={height} />;

  const step = width / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * step;
    const y = height - (Math.min(v, max) / max) * height;
    return `${x},${y}`;
  });

  const areaPoints = [`0,${height}`, ...points, `${width},${height}`].join(' ');

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polygon points={areaPoints} fill={color} fillOpacity={0.15} stroke="none" />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}
