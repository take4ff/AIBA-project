import { getTopicRows, getAllRows, getFundamentalsFull } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";
import NavTabs from "@/components/NavTabs";
import ConceptIcon from "@/components/ConceptIcon";
import TopicTable from "@/components/TopicTable";
import FutureGafamView from "@/components/FutureGafamView";

export const revalidate = 600;

export default async function TopicPage() {
  if (!isSupabaseConfigured) {
    return (
      <main className="container">
        <div className="notice">Supabase の環境変数が未設定です。</div>
      </main>
    );
  }

  const [{ allBuy, twoBuy, stats }, allRows, funds] = await Promise.all([
    getTopicRows(),
    getAllRows(),
    getFundamentalsFull(),
  ]);

  return (
    <main className="container">
      <header className="header">
        <h1><ConceptIcon name="momentum" size={24} /> トピック</h1>
        <p className="fullname">Advanced Investment &amp; Behavior Analytics</p>
        <p>
          短中長期シグナルが揃った順張り本命と、次の巨大プラットフォームに化ける未来のGAFAM候補を一覧する。
        </p>
      </header>

      <NavTabs active="topic" />

      {/* ── 順張りおすすめ ────────────────────────────── */}
      <section className="layer" style={{ marginTop: 24 }}>
        <h2 className="layer-title">
          <ConceptIcon name="momentum" size={18} /> 順張りおすすめ — 短中長期 全力買い
        </h2>
        <p className="layer-subtitle">
          短期（モメンタム≥60）・中期（AIBAスコア≥60）・長期（センチメント上昇）の3シグナルが全て揃った銘柄。
          短/中/長 の ● = 条件達成。モメンタムスコア降順。
        </p>

        {/* シグナル統計カード */}
        <div className="topic-stats">
          <div className="topic-stat-card">
            <div className="topic-stat-label">短期 買い</div>
            <div className="topic-stat-body">
              <span className="topic-stat-val">{stats.shortBuyCount}</span>
              <span className="topic-stat-unit">銘柄</span>
            </div>
            <div className="topic-stat-desc">モメンタム≥60（MA上・RSI良）</div>
          </div>
          <div className="topic-stat-card">
            <div className="topic-stat-label">中期 買い</div>
            <div className="topic-stat-body">
              <span className="topic-stat-val">{stats.midBuyCount}</span>
              <span className="topic-stat-unit">銘柄</span>
            </div>
            <div className="topic-stat-desc">AIBAスコア≥60（買い場圏内）</div>
          </div>
          <div className="topic-stat-card">
            <div className="topic-stat-label">長期 買い</div>
            <div className="topic-stat-body">
              <span className="topic-stat-val">{stats.longBuyCount}</span>
              <span className="topic-stat-unit">銘柄</span>
            </div>
            <div className="topic-stat-desc">センチメント上昇（研究熱量↑）</div>
          </div>
          <div className="topic-stat-card topic-stat-highlight">
            <div className="topic-stat-label">3シグナル 全一致</div>
            <div className="topic-stat-body">
              <span className="topic-stat-val">{stats.allBuyCount}</span>
              <span className="topic-stat-unit">銘柄</span>
            </div>
            <div className="topic-stat-desc">短＋中＋長 全て買い圏内</div>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          {allBuy.length === 0 ? (
            <div className="notice">現在、3シグナル全てが揃う銘柄はありません。</div>
          ) : (
            <TopicTable rows={allBuy} showTheme />
          )}
        </div>

        {twoBuy.length > 0 && (
          <details className="collapse-section" style={{ marginTop: 16 }}>
            <summary>
              2シグナル買い（あと1条件で全揃い）— {twoBuy.length}銘柄
            </summary>
            <p className="layer-subtitle" style={{ margin: "0 0 12px" }}>
              3シグナル中2つが買い圏内。残りひとつが揃えば本命入り。
            </p>
            <TopicTable rows={twoBuy} showTheme initial={15} />
          </details>
        )}
      </section>

      {/* ── 未来のGAFAM候補 ──────────────────────────── */}
      <section className="layer" style={{ marginTop: 48 }}>
        <h2 className="layer-title">
          <ConceptIcon name="forecast" size={18} /> 未来のGAFAM候補
        </h2>
        <p className="layer-subtitle">
          成長 × 研究熱量 × テーマ展開幅 × 事業の頑丈さ × 規模の伸びしろ を合成し、
          「今は中型でも次の巨大プラットフォームに化ける」候補を順位付け（投機的なヒューリスティック）。
        </p>
        <FutureGafamView rows={allRows} funds={funds} limit={10} />
      </section>
    </main>
  );
}
