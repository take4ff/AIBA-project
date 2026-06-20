import Link from "next/link";
import { getAllRows, getFundamentalsFull } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";
import { platformScore, fmtCap } from "@/lib/platform";
import { themeLabel } from "@/lib/theme-meta";
import { parseDomainId } from "@/lib/regions";
import { scoreColor } from "@/lib/score-color";
import NavTabs from "@/components/NavTabs";
import ConceptIcon from "@/components/ConceptIcon";

export const revalidate = 600;

export default async function FutureGafamPage() {
  if (!isSupabaseConfigured) {
    return <main className="container"><div className="notice">Supabase の環境変数が未設定です。</div></main>;
  }
  const [rows, funds] = await Promise.all([getAllRows(), getFundamentalsFull()]);

  const scored = rows
    .filter((r) => r.kind === "stock" && r.aiba_score != null)
    .map((r) => ({ r, ...platformScore(r, funds[r.ticker]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);

  return (
    <main className="container">
      <header className="header">
        <h1><ConceptIcon name="forecast" size={24} /> 未来のGAFAM候補</h1>
        <p className="fullname">Advanced Investment &amp; Behavior Analytics</p>
        <p>
          <strong>成長 × 研究熱量 × テーマ展開幅 × 事業の頑丈さ × 規模の伸びしろ</strong> を合成し、
          「今は中型でも次の巨大プラットフォームに化ける」候補を順位付け（投機的なヒューリスティック）。
        </p>
      </header>
      <NavTabs active="future-gafam" />

      <section className="layer">
        <p className="layer-subtitle">規模の伸びしろは時価総額が小さいほど高得点（既に巨大なGAFAMは下位に）。展開幅＝主＋副テーマ数。</p>
        <div className="fg-list">
          {scored.map(({ r, score, parts }, i) => {
            const { theme } = parseDomainId(r.domain_id);
            return (
              <Link key={r.domain_id} href={`/domain/${r.domain_id}`} className="fg-card">
                <div className="fg-rank">{i + 1}</div>
                <div className="fg-main">
                  <div className="fg-name">
                    {r.domain_name}<span className="ticker">{r.ticker}</span>
                    <span className="fg-theme">{themeLabel(theme)}</span>
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
        <p className="guide-note" style={{ marginTop: 14 }}>
          ※ 投機的な総合指標で、将来の成功を保証しません。時価総額・成長・ファンダは翌営業日の日次バッチで更新。
          既存の巨大企業（GAFAM）は「伸びしろ」が低く下位に出ます（＝“未来の”候補を拾う設計）。
        </p>
      </section>
    </main>
  );
}
