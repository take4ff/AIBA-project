"use client";

import { technicalSummary } from "@/lib/indicators";

const vColor = (v: "買い" | "売り" | "中立") => (v === "買い" ? "#15a34a" : v === "売り" ? "#dc2626" : "var(--muted)");

/**
 * テクニカル総合判定パネル（買い・売り目安の網羅）。
 * 終値配列＋最新RSIから、移動平均(25/200)・MACD・一目均衡表（トレンド系）と
 * RSI・ボリンジャー・ストキャスティクス（オシレーター系）を 買い/売り/中立 で一覧化する。
 * 銘柄詳細（ランキング経由）とポートフォリオ詳細の両方で共有。
 */
export default function TechSummary({ closes, rsi, collapsible = false }: { closes: (number | null)[]; rsi: number | null; collapsible?: boolean }) {
  const tech = technicalSummary(closes, rsi);
  if (tech.signals.length < 3) return null;
  const Wrap = collapsible ? "details" : "section";
  return (
    <Wrap className={collapsible ? "collapse-section" : "layer"}>
      {collapsible
        ? <summary>テクニカル総合判定（買い・売り目安の網羅）</summary>
        : <h2 className="layer-title">テクニカル総合判定（買い・売り目安の網羅）</h2>}
      <p className="layer-subtitle">
        主要指標の現在のシグナルを一覧化。総合：
        <span style={{ fontWeight: 800, marginLeft: 6, color: tech.overall.includes("買") ? "#15a34a" : tech.overall.includes("売") ? "#dc2626" : "var(--muted)" }}>{tech.overall}</span>
        <span style={{ marginLeft: 8, color: "var(--muted)" }}>（買い {tech.buy}・中立 {tech.neutral}・売り {tech.sell}）</span>
      </p>
      {(["トレンド", "オシレーター"] as const).map((grp) => (
        <div key={grp} style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>{grp}系{grp === "オシレーター" ? "（売られすぎ＝押し目／買われすぎ＝売り）" : "（順張りの方向）"}</div>
          <div className="tech-grid">
            {tech.signals.filter((s) => s.group === grp).map((s) => (
              <div key={s.name} className="tech-sig" title={s.detail}>
                <span className="tech-sig-name">{s.name}</span>
                <span className="tech-sig-verdict" style={{ color: vColor(s.verdict) }}>{s.verdict}</span>
                <span className="tech-sig-detail">{s.detail}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="guide-note" style={{ marginTop: 10 }}>
        ※ トレンド系（移動平均25/200・MACD・一目均衡表）は順張りの方向、オシレーター系（RSI・ボリンジャー・ストキャス）は逆張り（押し目/過熱＝売り）の目安。
        指標は終値ベースの目安で、売買を保証するものではありません。
      </p>
    </Wrap>
  );
}
