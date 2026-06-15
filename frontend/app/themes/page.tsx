import Link from "next/link";
import { getAllRows } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";
import { parseDomainId } from "@/lib/regions";
import { LAYER_META } from "@/lib/types";
import { scoreColor, fmt } from "@/lib/score-color";
import { THEME_KEYWORDS } from "@/lib/theme-meta";
import NavTabs from "@/components/NavTabs";

export const revalidate = 0;

const trendArrow = (t: number) => (t > 1 ? "↑" : t < -1 ? "↓" : "→");
const trendDir = (t: number) => (t > 1 ? "up" : t < -1 ? "down" : "flat");

interface ThemeCard {
  theme: string; name: string; layer: number;
  aiba: number | null; sentiment: number | null; trend: number; rising: boolean;
}

export default async function ThemesPage() {
  if (!isSupabaseConfigured) {
    return (
      <main className="container">
        <div className="notice">Supabase の環境変数が未設定です。</div>
      </main>
    );
  }

  const rows = await getAllRows();
  // テーマごとの代表＝global ETF 行（センチメントはテーマ共通）
  const cards: ThemeCard[] = [];
  for (const r of rows) {
    const p = parseDomainId(r.domain_id);
    if (p.region !== "global" || p.kind !== "etf") continue;
    cards.push({
      theme: p.theme, name: r.theme_name, layer: r.layer,
      aiba: r.aiba_score, sentiment: r.sentiment_score, trend: r.sentiment_trend, rising: false,
    });
  }
  // 「話題上昇中」＝センチメント傾き上位3テーマ
  [...cards].sort((a, b) => b.trend - a.trend).slice(0, 3).forEach((c) => { if (c.trend > 1) c.rising = true; });

  const tradeDate = rows.map((r) => r.trade_date).filter(Boolean).sort().at(-1);
  const byLayer = [1, 2, 3].map((l) => ({
    layer: l,
    items: cards.filter((c) => c.layer === l).sort((a, b) => (b.sentiment ?? 0) - (a.sentiment ?? 0)),
  }));

  return (
    <main className="container">
      <header className="header">
        <h1>🧭 テーマ一覧</h1>
        <p className="fullname">Advanced Investment &amp; Behavior Analytics</p>
        <p>
          監視テーマを階層別に俯瞰。各テーマの<strong>研究熱量</strong>（関連ワードの活動量＝センチメント）と業界AIBAを併記。
          {tradeDate && <> 最新: <span className="date">{tradeDate}</span></>}
        </p>
      </header>

      <NavTabs active="themes" />

      {byLayer.map(({ layer, items }) => (
        <section key={layer} className="layer">
          <h2 className="layer-title">{LAYER_META[layer].title}</h2>
          <p className="layer-subtitle">{LAYER_META[layer].subtitle}</p>
          <div className="themes-grid">
            {items.map((c) => (
              <Link key={c.theme} href={`/theme/${c.theme}/global`} className="theme-card">
                <div className="tc-head">
                  <span className="tc-name">{c.name}</span>
                  {c.rising && <span className="tc-rising">🔥 話題上昇中</span>}
                </div>
                <div className="tc-metrics">
                  <span className="combo-pill" style={{ background: scoreColor(c.aiba) }} title="業界ETFのAIBAスコア">
                    AIBA {fmt(c.aiba)}
                  </span>
                  <span className={`tc-heat heat-${trendDir(c.trend)}`} title="研究熱量（センチメント）と傾き">
                    熱量 {fmt(c.sentiment)} <strong>{trendArrow(c.trend)}</strong>
                  </span>
                </div>
                <div className="theme-tags">
                  {(THEME_KEYWORDS[c.theme] ?? []).map((k) => (
                    <span key={k} className="theme-tag">{k}</span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <p className="guide-note" style={{ marginTop: 16 }}>
        ※ 熱量＝GitHub/arXiv/HN/Trends等の関連ワード活動量から算出したセンチメント（50=横ばい）。
        傾き ↑=加速 / ↓=減速。カードをクリックすると業界ページ（ETF＋個別株のAIBA比較）へ。
      </p>
    </main>
  );
}
