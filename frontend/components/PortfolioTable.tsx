import Link from "next/link";
import { PortfolioRow } from "@/lib/portfolio";
import { overheatColor, assessSell, money, pct, earningsLabel } from "@/lib/sell-signal";
import { fmt } from "@/lib/score-color";

export default function PortfolioTable({ rows }: { rows: PortfolioRow[] }) {
  return (
    <div className="table-scroll">
    <table className="table">
      <colgroup>
        <col style={{ width: "20%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "9%" }} />
        <col style={{ width: "7%" }} />
        <col style={{ width: "9%" }} />
        <col style={{ width: "15%" }} />
        <col style={{ width: "20%" }} />
      </colgroup>
      <thead>
        <tr>
          <th>銘柄</th>
          <th className="num" title="取得単価。投信(代替ETF)は価格基準が異なるため非表示">取得単価</th>
          <th className="num">現在値</th>
          <th className="num" title="取得単価比の損益。投信(代替ETF)は非表示">損益</th>
          <th className="num" title="相対力指数。70超で買われすぎ(過熱)">RSI</th>
          <th className="num" title="過熱度(0-100)。高いほど割高・売り時">過熱度</th>
          <th>売りシグナル</th>
          <th title="次回決算発表予定日。7日以内は⚠️。ETF/投信は対象外">次回決算</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const a = assessSell(r);
          return (
            <tr key={r.id}>
              <td>
                <Link href={`/portfolio/${r.id}`}>
                  <span className="domain-name">{r.name}</span>
                  <span className="ticker">{r.ticker}</span>
                  <span className="theme-sub">
                    {r.kind === "proxy" ? "投信→代替ETF（売り時のみ）" : " "}
                  </span>
                </Link>
              </td>
              <td className="num">{r.kind === "proxy" ? "—" : money(r.avg_cost, r.currency)}</td>
              <td className="num">{money(r.close_price, r.currency)}</td>
              <td className="num" style={{ color: r.return_pct == null ? undefined : r.return_pct >= 0 ? "#34d399" : "#ef4444" }}>
                {pct(r.return_pct)}
              </td>
              <td className="num">{fmt(r.rsi_14)}</td>
              <td className="num">
                {r.overheat == null ? (
                  "—"
                ) : (
                  <span className="combo-pill" style={{ background: overheatColor(r.overheat) }}>
                    {Math.round(r.overheat)}
                  </span>
                )}
              </td>
              <td><span className={`sell-badge ${a.badge.cls}`} title={a.tooltip}>{a.badge.label}</span></td>
              <td>
                {(() => {
                  const e = earningsLabel(r.next_earnings_date);
                  return <span style={{ color: e.soon ? "#f59e0b" : "var(--muted)", fontWeight: e.soon ? 700 : 400 }}>
                    {e.soon ? "⚠️ " : ""}{e.text}
                  </span>;
                })()}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}
