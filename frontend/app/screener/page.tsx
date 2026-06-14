import { getAllRows, getFundamentalsMap, getUsdJpy } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";
import NavTabs from "@/components/NavTabs";
import ScreenerClient from "@/components/ScreenerClient";

export const revalidate = 0;

export default async function ScreenerPage() {
  if (!isSupabaseConfigured) {
    return (
      <main className="container">
        <div className="notice">Supabase の環境変数が未設定です。</div>
      </main>
    );
  }

  const [rows, funds, usdjpy] = await Promise.all([getAllRows(), getFundamentalsMap(), getUsdJpy()]);
  const tradeDate = rows.map((r) => r.trade_date).filter(Boolean).sort().at(-1);

  return (
    <main className="container">
      <header className="header">
        <h1>🔎 スクリーナー — 多条件で絞り込み</h1>
        <p className="fullname">Advanced Investment &amp; Behavior Analytics</p>
        <p>
          地域・種別・階層・AIBA・買い場確率・予想PER・熱量・乖離を組み合わせて、条件に合う銘柄を即時抽出。
          {tradeDate && <> 最新: <span className="date">{tradeDate}</span></>}
        </p>
      </header>

      <NavTabs active="screener" />

      <ScreenerClient rows={rows} funds={funds} usdjpy={usdjpy} />
    </main>
  );
}
