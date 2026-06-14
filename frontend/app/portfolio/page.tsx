import Link from "next/link";
import { getPortfolio } from "@/lib/portfolio";
import { isSupabaseConfigured } from "@/lib/supabase";
import PortfolioTable from "@/components/PortfolioTable";
import NavTabs from "@/components/NavTabs";

export const revalidate = 0;

export default async function PortfolioPage() {
  if (!isSupabaseConfigured) {
    return (
      <main className="container">
        <Link className="back-link" href="/">← ダッシュボードへ</Link>
        <div className="notice">Supabase の環境変数が未設定です。</div>
      </main>
    );
  }

  const rows = await getPortfolio();
  const tradeDate = rows.map((r) => r.trade_date).filter(Boolean).sort().at(-1);

  return (
    <main className="container">
      <header className="header">
        <h1>💼 マイ・ポートフォリオ（売り時）</h1>
        <p>
          保有銘柄の<strong>過熱度</strong>から売り時を可視化。過熱度が高い（割高・買われすぎ）ほど売り検討。
          {tradeDate && <> 最新: <span className="date">{tradeDate}</span></>}
        </p>
      </header>

      <NavTabs active="portfolio" />

      {rows.length === 0 ? (
        <div className="notice">
          データがありません。<code>db/portfolio.sql</code> 実行後、
          <code>backend/portfolio_job.py</code> を実行してください。
        </div>
      ) : (
        <PortfolioTable rows={rows} />
      )}

      <p className="guide-note" style={{ marginTop: 16 }}>
        ※ 売りシグナルは <strong>テクニカル過熱＋ファンダ（割高/減益で上乗せ）</strong> の合成。
        <span style={{ color: "#c084fc" }}>🟣決算前</span>（7日以内）はイベントリスクのため様子見推奨。
        バッジにカーソルで内訳を表示。投信（オルカン等の積立）・非上場（スペースX）は対象外、
        投信2本は同一指数ETFで代替し売り時のみ（損益は非表示）。銘柄名クリックで過熱度チャート。
      </p>
    </main>
  );
}
