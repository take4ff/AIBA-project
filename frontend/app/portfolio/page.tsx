import Link from "next/link";
import { getPortfolio } from "@/lib/portfolio";
import { isSupabaseConfigured } from "@/lib/supabase";
import PortfolioTable from "@/components/PortfolioTable";

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
      <Link className="back-link" href="/">← ダッシュボードへ</Link>
      <header className="header" style={{ marginTop: 12 }}>
        <h1>💼 マイ・ポートフォリオ（売り時）</h1>
        <p>
          保有銘柄の<strong>過熱度</strong>から売り時を可視化。過熱度が高い（割高・買われすぎ）ほど売り検討。
          {tradeDate && <> 最新: <span className="date">{tradeDate}</span></>}
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="notice">
          データがありません。<code>db/portfolio.sql</code> 実行後、
          <code>backend/portfolio_job.py</code> を実行してください。
        </div>
      ) : (
        <PortfolioTable rows={rows} />
      )}

      <p className="guide-note" style={{ marginTop: 16 }}>
        ※ 投信（オルカン等の積立）と非上場（スペースX）は対象外。投信2本は同一指数のETFで代替し
        <strong>売り時のみ</strong>表示（損益は価格基準が異なるため非表示）。銘柄名クリックで過熱度チャート。
      </p>
    </main>
  );
}
