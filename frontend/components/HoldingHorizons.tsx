"use client";

import { holdingHorizons } from "@/lib/indicators";

const vColor = (v: "売り" | "中立" | "継続") => (v === "売り" ? "#dc2626" : v === "継続" ? "#15a34a" : "var(--muted)");
const vIcon = (v: "売り" | "中立" | "継続") => (v === "売り" ? "売り" : v === "継続" ? "継続保有" : "中立");

/**
 * 保有期間別（短期/中期/長期）の「売り or 継続保有」判定パネル。
 * 期間ごとに適した指標群で集計し、売り票>継続票なら「売り」。
 */
export default function HoldingHorizons({
  closes, rsi, overheat = null, sentimentTrend = null,
}: {
  closes: (number | null)[];
  rsi: number | null;
  overheat?: number | null;
  sentimentTrend?: number | null;
}) {
  const rows = holdingHorizons(closes, rsi, overheat, sentimentTrend);
  if (rows.length === 0) return null;
  return (
    <section className="layer">
      <h2 className="layer-title">保有期間別の判定（売り / 継続保有）</h2>
      <p className="layer-subtitle">すでに保有している前提で「売り時か・継続か」を集計。短期＝逆張り/過熱、長期＝トレンド/テーマ成長。新規購入の割安感は上の「購入判断の目安」を参照。</p>
      <div className="hh-grid">
        {rows.map((r) => (
          <div key={r.label} className="hh-card">
            <div className="hh-head">
              <span className="hh-label">{r.label}<span className="hh-period">{r.period}</span></span>
              <span className="hh-verdict" style={{ color: vColor(r.verdict) }}>{vIcon(r.verdict)}</span>
            </div>
            <div className="hh-tally">継続 {r.hold} ・ 売り {r.sell}</div>
            <ul className="hh-reasons">
              {r.reasons.map((x, i) => (
                <li key={i} style={{ color: x.startsWith("▲") ? "#dc2626" : "#15a34a" }}>{x}</li>
              ))}
              {r.reasons.length === 0 && <li style={{ color: "var(--muted)" }}>判定材料が不足（履歴待ち）</li>}
            </ul>
          </div>
        ))}
      </div>
      <p className="guide-note" style={{ marginTop: 10 }}>
        ※ ▲＝売り材料／▼＝継続材料。終値ベースの目安で売買を保証するものではありません。長期はテーマの構造的成長を取りに行く枠（短期の過熱だけで手放さない）。
      </p>
    </section>
  );
}
