"use client";

// recharts の <Legend content={...}> 用。実線/破線をサンプル線で再現し、
// クリックで表示/非表示を切り替える共有凡例。
export default function ClickableLegend({
  payload, hidden, onToggle,
}: {
  payload?: any[];
  hidden: Record<string, boolean>;
  onToggle: (k: string) => void;
}) {
  return (
    <div className="chart-legend">
      {(payload ?? []).map((e: any) => {
        const color = e.payload?.stroke && !String(e.payload.stroke).startsWith("url") ? e.payload.stroke : e.color;
        const dash = e.payload?.strokeDasharray;
        const off = hidden[e.dataKey];
        return (
          <span key={e.dataKey} className="cl-item" style={{ opacity: off ? 0.4 : 1 }} onClick={() => onToggle(String(e.dataKey))}>
            <svg width="24" height="10" aria-hidden>
              <line x1="1" y1="5" x2="23" y2="5" stroke={color} strokeWidth="2.4"
                strokeDasharray={dash ? "4 3" : undefined} strokeLinecap="round" />
            </svg>
            <span style={{ textDecoration: off ? "line-through" : "none" }}>{e.value}</span>
          </span>
        );
      })}
    </div>
  );
}
