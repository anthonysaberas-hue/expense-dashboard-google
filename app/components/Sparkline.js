/**
 * 6-bar mini sparkline chart.
 * data: number[]  (values, oldest first)
 * color: string   (bar color)
 * height: number  (px, default 32)
 */
export default function Sparkline({ data = [], color = "#2D6A4F", height = 32 }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  return (
    <div className="sparkline" style={{ height }} aria-hidden="true">
      {data.map((val, i) => (
        <div
          key={i}
          className="sparkline-bar"
          style={{
            height: `${Math.max((val / max) * 100, val > 0 ? 8 : 2)}%`,
            background: val > 0 ? color : "var(--border)",
            opacity: i === data.length - 1 ? 1 : 0.55 + (i / data.length) * 0.45,
          }}
        />
      ))}
    </div>
  );
}
