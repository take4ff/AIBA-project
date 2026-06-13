import { getRanking } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";
import { LAYER_META } from "@/lib/types";
import { Region, REGION_LABEL } from "@/lib/regions";
import RankingTable from "@/components/RankingTable";
import RegionTabs from "@/components/RegionTabs";

export default async function RegionDashboard({ region }: { region: Region }) {
  if (!isSupabaseConfigured) {
    return (
      <main className="container">
        <div className="notice">
          Supabase の環境変数が未設定です。<code>frontend/.env.local</code> を設定してください。
        </div>
      </main>
    );
  }

  const rows = await getRanking(region);
  const tradeDate = rows.map((r) => r.trade_date).sort().at(-1);
  const byLayer = (layer: number) =>
    rows.filter((r) => r.layer === layer).sort((a, b) => (b.aiba_score ?? 0) - (a.aiba_score ?? 0));

  return (
    <main className="container">
      <header className="header">
        <h1>📊 AIBA — 次世代技術投資分析</h1>
        <p>
          テクニカル指標とセンチメント指標の乖離から「買い時」を定量化。
          <span className="region-badge">{REGION_LABEL[region]}</span>
          {tradeDate && <> 最新データ: <span className="date">{tradeDate}</span></>}
        </p>
      </header>

      <RegionTabs active={region} />

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
              <RankingTable rows={layerRows} />
            </section>
          );
        })
      )}
    </main>
  );
}
