"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { RankingRow } from "@/lib/types";
import { FullFundamentals } from "@/lib/data";
import { platformScore, fmtCap } from "@/lib/platform";
import { themeLabel } from "@/lib/theme-meta";
import { parseDomainId } from "@/lib/regions";
import { scoreColor } from "@/lib/score-color";

const CAPS: { key: string; label: string; max: number | null }[] = [
  { key: "all", label: "全て", max: null },
  { key: "100", label: "≤ $100B", max: 100e9 },
  { key: "50", label: "≤ $50B（中小型）", max: 50e9 },
  { key: "10", label: "≤ $10B（小型）", max: 10e9 },
];

export default function FutureGafamView({
  rows, funds,
}: { rows: RankingRow[]; funds: Record<string, FullFundamentals> }) {
  const [cap, setCap] = useState("all");
  const maxCap = CAPS.find((c) => c.key === cap)!.max;

  const scored = useMemo(() => {
    return rows
      .filter((r) => r.kind === "stock" && r.aiba_score != null)
      .filter((r) => {
        if (maxCap == null) return true;
        const mc = funds[r.ticker]?.market_cap;
        return mc != null && mc <= maxCap;   // 上限指定時は時価総額が判明し条件内のもののみ
      })
      .map((r) => ({ r, ...platformScore(r, funds[r.ticker]) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);
  }, [rows, funds, maxCap]);

  return (
    <section className="layer">
      <div className="kind-toggle" style={{ marginBottom: 12 }}>
        {CAPS.map((c) => (
          <button key={c.key} type="button" className={`kind-btn${cap === c.key ? " kind-active" : ""}`} onClick={() => setCap(c.key)}>{c.label}</button>
        ))}
      </div>
      <p className="layer-subtitle">規模の伸びしろは時価総額が小さいほど高得点（既に巨大なGAFAMは下位に）。展開幅＝主＋副テーマ数。上限フィルタで“真の中小型候補”だけを抽出できます。</p>
      {scored.length === 0 ? (
        <div className="notice">条件に合う銘柄がありません（時価総額データが未取得の可能性。日次バッチ後に反映）。</div>
      ) : (
        <div className="fg-list">
          {scored.map(({ r, score, parts }, i) => {
            const { theme } = parseDomainId(r.domain_id);
            const mc = funds[r.ticker]?.market_cap;
            return (
              <Link key={r.domain_id} href={`/domain/${r.domain_id}`} className="fg-card">
                <div className="fg-rank">{i + 1}</div>
                <div className="fg-main">
                  <div className="fg-name">
                    {r.domain_name}<span className="ticker">{r.ticker}</span>
                    <span className="fg-theme">{themeLabel(theme)}</span>
                    {mc != null && <span className="fg-theme">{fmtCap(mc)}</span>}
                    {r.tags?.map((t) => <span key={t} className="multi-tag">＋{themeLabel(t)}</span>)}
                  </div>
                  <div className="fg-parts">
                    {parts.map((p) => (
                      <span key={p.name} className="fg-part">{p.name} <strong>{Math.round(p.pts)}</strong> <span className="fg-note">{p.note}</span></span>
                    ))}
                  </div>
                </div>
                <div className="fg-score" style={{ color: scoreColor(score) }}>{score}</div>
              </Link>
            );
          })}
        </div>
      )}
      <p className="guide-note" style={{ marginTop: 14 }}>
        ※ 投機的な総合指標で、将来の成功を保証しません。時価総額・成長・ファンダは日次バッチで更新。
        既存の巨大企業（GAFAM）は「伸びしろ」が低く下位に出ます（＝“未来の”候補を拾う設計）。
      </p>
    </section>
  );
}
