import { getMarketMonthly } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";
import NavTabs from "@/components/NavTabs";
import MarketHeatmap from "@/components/MarketHeatmap";

export const revalidate = 3600; // 月次データなので1時間キャッシュ

export default async function MarketPage() {
  if (!isSupabaseConfigured) {
    return <main className="container"><div className="notice">Supabase の環境変数が未設定です。</div></main>;
  }

  const [sp500, topix] = await Promise.all([
    getMarketMonthly("sp500"),
    getMarketMonthly("topix"),
  ]);

  return (
    <main className="container">
      <header className="header">
        <h1>マーケット セクター動向</h1>
        <p>S&amp;P500（GICS11セクター）と日本（TOPIX-17）の月次セクター騰落率。毎月1日自動更新。</p>
      </header>
      <NavTabs active="market" />
      <MarketHeatmap sp500={sp500} topix={topix} />
      <p className="guide-note" style={{ marginTop: 16 }}>
        ※ S&amp;P500はGICSセクター別の月次平均リターン。日本はTOPIX-17セクターETFの月次リターン。投資助言ではありません。
      </p>
    </main>
  );
}
