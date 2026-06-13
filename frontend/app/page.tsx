import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { RankingRow, LAYER_META } from "@/lib/types";
import RankingTable from "@/components/RankingTable";

// 常に最新データを反映（キャッシュ無効化）
export const revalidate = 0;

async function getRanking(): Promise<RankingRow[]> {
  const { data, error } = await supabase
    .from("latest_ranking")
    .select("*");
  if (error) {
    console.error("ranking fetch error:", error.message);
    return [];
  }
  return (data ?? []) as RankingRow[];
}

export default async function Home() {
  if (!isSupabaseConfigured) {
    return (
      <main className="container">
        <div className="notice">
          Supabase の環境変数が未設定です。<code>frontend/.env.local</code> に
          <code>NEXT_PUBLIC_SUPABASE_URL</code> と
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> を設定してください。
        </div>
      </main>
    );
  }

  const rows = await getRanking();
  const tradeDate = rows[0]?.trade_date;
  const byLayer = (layer: number) =>
    rows.filter((r) => r.layer === layer).sort((a, b) => (b.aiba_score ?? 0) - (a.aiba_score ?? 0));

  return (
    <main className="container">
      <header className="header">
        <h1>📊 AIBA — 次世代技術投資分析</h1>
        <p>
          テクニカル指標とセンチメント指標の乖離から「買い時」を定量化。
          {tradeDate && <> 最新データ: <span className="date">{tradeDate}</span></>}
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="notice">
          まだデータがありません。バックエンドの日次バッチ（<code>backend/run_daily.py</code>）を実行してください。
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
