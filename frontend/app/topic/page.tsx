import { getTopicRows, getAllRows, getFundamentalsFull } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";
import NavTabs from "@/components/NavTabs";
import ConceptIcon from "@/components/ConceptIcon";
import TopicTable from "@/components/TopicTable";
import TopicNav from "@/components/TopicNav";
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

  const [{ allBuy, twoBuy, gcActive, gcNear, stats }, allRows, funds] = await Promise.all([
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
          順張り本命・未来のGAFAM候補・ゴールデンクロス銘柄を一覧する。
        </p>
      </header>

      <NavTabs active="topic" />

      {/* ── セクションナビ ────────────────────────────── */}
      <TopicNav />

      {/* ══════════════════════════════════════════════════
          ① 順張りおすすめ
      ══════════════════════════════════════════════════ */}
      <section id="momentum" className="layer topic-section" style={{ marginTop: 24 }}>
        <h2 className="layer-title">
          <ConceptIcon name="momentum" size={18} /> 順張りおすすめ — 短中長期 全力買い
        </h2>
        <p className="layer-subtitle">
          短期（25日線の上）・中期（AIBAスコア≥60）・長期（200日線の上）の3シグナルが全て揃った銘柄。
          モメンタムスコア降順。
        </p>

        <div className="topic-stats">
          <div className="topic-stat-card">
            <div className="topic-stat-label">短期 買い</div>
            <div className="topic-stat-body">
              <span className="topic-stat-val">{stats.shortBuyCount}</span>
              <span className="topic-stat-unit">銘柄</span>
            </div>
            <div className="topic-stat-desc">25日線の上（短期上昇基調）</div>
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
            <div className="topic-stat-desc">200日線の上（長期上昇トレンド）</div>
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

      {/* ══════════════════════════════════════════════════
          ② 未来のGAFAM候補
      ══════════════════════════════════════════════════ */}
      <section id="future-gafam" className="layer topic-section" style={{ marginTop: 56 }}>
        <h2 className="layer-title">
          <ConceptIcon name="forecast" size={18} /> 未来のGAFAM候補
        </h2>
        <p className="layer-subtitle">
          成長 × 研究熱量 × テーマ展開幅 × 事業の頑丈さ × 規模の伸びしろ を合成し、
          「今は中型でも次の巨大プラットフォームに化ける」候補を順位付け（投機的なヒューリスティック）。
        </p>
        <FutureGafamView rows={allRows} funds={funds} limit={10} />
      </section>

      {/* ══════════════════════════════════════════════════
          ③ ゴールデンクロス
      ══════════════════════════════════════════════════ */}
      <section id="golden-cross" className="layer topic-section" style={{ marginTop: 56 }}>
        <h2 className="layer-title">
          <ConceptIcon name="longterm" size={18} /> ゴールデンクロス
        </h2>
        <p className="layer-subtitle">
          25日移動平均線が75日移動平均線を上抜けた、または接近中の銘柄。
          短期トレンド転換の早期シグナル。
        </p>

        <div className="topic-stats">
          <div className="topic-stat-card topic-stat-highlight">
            <div className="topic-stat-label">GC中</div>
            <div className="topic-stat-body">
              <span className="topic-stat-val">{stats.gcActiveCount}</span>
              <span className="topic-stat-unit">銘柄</span>
            </div>
            <div className="topic-stat-desc">25日線が75日線の上（継続中）</div>
          </div>
          <div className="topic-stat-card">
            <div className="topic-stat-label">GC接近中</div>
            <div className="topic-stat-body">
              <span className="topic-stat-val">{stats.gcNearCount}</span>
              <span className="topic-stat-unit">銘柄</span>
            </div>
            <div className="topic-stat-desc">75日線まで3%以内（クロス前兆）</div>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          {gcActive.length === 0 ? (
            <div className="notice">現在、ゴールデンクロス中の銘柄はありません。</div>
          ) : (
            <TopicTable rows={gcActive} showTheme />
          )}
        </div>

        {gcNear.length > 0 && (
          <details className="collapse-section" style={{ marginTop: 16 }}>
            <summary>
              GC接近中（75日線まで3%以内）— {gcNear.length}銘柄
            </summary>
            <p className="layer-subtitle" style={{ margin: "0 0 12px" }}>
              25日線が75日線に迫っている。クロス前後のエントリーを検討する候補。
            </p>
            <TopicTable rows={gcNear} showTheme initial={15} />
          </details>
        )}
      </section>
    </main>
  );
}
