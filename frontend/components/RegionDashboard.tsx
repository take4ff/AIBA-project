import { getRanking } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";
import { LAYER_META } from "@/lib/types";
import { Region, Kind, REGION_LABEL, KIND_LABEL, regionHasStocks, regionHasEtf } from "@/lib/regions";
import RankingTableMore from "@/components/RankingTableMore";
import NavTabs from "@/components/NavTabs";
import KindToggle from "@/components/KindToggle";
import ScoreGuide from "@/components/ScoreGuide";
import ConceptIcon from "@/components/ConceptIcon";

export default async function RegionDashboard({
  region,
  kind = "etf",
}: {
  region: Region;
  kind?: Kind;
}) {
  if (!isSupabaseConfigured) {
    return (
      <main className="container">
        <div className="notice">
          Supabase の環境変数が未設定です。<code>frontend/.env.local</code> を設定してください。
        </div>
      </main>
    );
  }

  // Global=ETFのみ / その他(row)=個別株のみ / US・JP=指定 kind
  const effectiveKind: Kind = !regionHasEtf(region) ? "stock"
    : regionHasStocks(region) ? kind : "etf";
  const rows = await getRanking(region, effectiveKind);
  const tradeDate = rows.map((r) => r.trade_date).sort().at(-1);
  // 並び順は「業界ETFスコア」基準（ETF/個別株を切り替えても業界の順番が揃う）
  const byLayer = (layer: number) =>
    rows.filter((r) => r.layer === layer).sort((a, b) => b.order_key - a.order_key);

  return (
    <main className="container">
      <header className="header">
        <h1><ConceptIcon name="verify" size={24} /> AIBA — 次世代技術投資分析</h1>
        <p className="fullname">Advanced Investment &amp; Behavior Analytics</p>
        <p>
          テクニカル指標とセンチメント指標の乖離から<strong>「入口（押し目）」</strong>を定量化。次世代技術テーマを<strong>長期で育てるサテライト枠</strong>向け。
          <span className="region-badge">{REGION_LABEL[region]} / {KIND_LABEL[effectiveKind]}</span>
          {tradeDate && <> 最新データ: <span className="date">{tradeDate}</span></>}
        </p>
      </header>

      <NavTabs active={region} />

      <ScoreGuide />
      <KindToggle region={region} active={effectiveKind} />

      {rows.length === 0 ? (
        <div className="notice">
          この地域のデータがまだありません。バックフィル（<code>backend/backfill.py</code>）または
          日次バッチを実行してください。
        </div>
      ) : (
        [1, 2, 3].map((layer) => {
          const meta = LAYER_META[layer];
          const layerRows = byLayer(layer);
          if (layerRows.length === 0) return null;
          return (
            <section className="layer" key={layer}>
              <h2 className="layer-title">{meta.title}</h2>
              <p className="layer-subtitle">{meta.subtitle}</p>
              <RankingTableMore rows={layerRows} showTheme={effectiveKind === "stock"} initial={20} />
            </section>
          );
        })
      )}
    </main>
  );
}
