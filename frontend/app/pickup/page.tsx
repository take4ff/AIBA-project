import { getPickup } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";
import RankingTable from "@/components/RankingTable";
import NavTabs from "@/components/NavTabs";

export const revalidate = 0;

export default async function PickupPage() {
  if (!isSupabaseConfigured) {
    return (
      <main className="container">
        <div className="notice">Supabase の環境変数が未設定です。</div>
      </main>
    );
  }

  const rows = await getPickup();
  const tradeDate = rows.map((r) => r.trade_date).filter(Boolean).sort().at(-1);

  return (
    <main className="container">
      <header className="header">
        <h1>⭐ Pickup — 今買いの候補</h1>
        <p className="fullname">Advanced Investment &amp; Behavior Analytics</p>
        <p>
          地域・ETF/個別株を問わず、AIBAスコアが買い水準（60以上）または乖離（仕込み好機）の銘柄を横断抽出。
          {tradeDate && <> 最新: <span className="date">{tradeDate}</span></>}
        </p>
      </header>

      <NavTabs active="pickup" />

      {rows.length === 0 ? (
        <div className="notice" style={{ marginTop: 20 }}>現在、買い水準の候補はありません。</div>
      ) : (
        <section className="layer">
          <RankingTable rows={rows} showTheme showRegion linkMode="auto" />
        </section>
      )}
    </main>
  );
}
