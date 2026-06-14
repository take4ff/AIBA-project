import Link from "next/link";
import { RankingRow } from "@/lib/types";
import { scoreColor, fmt } from "@/lib/score-color";

export default function RankingTable({ rows, showTheme = false }: { rows: RankingRow[]; showTheme?: boolean }) {
  return (
    <table className="table">
      <colgroup>
        <col style={{ width: "5%" }} />
        <col style={{ width: "33%" }} />
        <col style={{ width: "24%" }} />
        <col style={{ width: "9.5%" }} />
        <col style={{ width: "9.5%" }} />
        <col style={{ width: "9%" }} />
        <col style={{ width: "10%" }} />
      </colgroup>
      <thead>
        <tr>
          <th></th>
          <th>領域</th>
          <th>AIBAスコア</th>
          <th className="num">テクニカル</th>
          <th className="num">センチメント</th>
          <th className="num">RSI(14)</th>
          <th className="num">乖離率</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const score = r.aiba_score ?? 0;
          return (
            <tr key={r.domain_id}>
              <td className="rank">{i + 1}</td>
              <td>
                <Link href={`/domain/${r.domain_id}`}>
                  <span className="domain-name">{r.domain_name}</span>
                  <span className="ticker">{r.ticker}</span>
                  {/* ETF/個別株の切替で行高が変わらないよう、サブ行は常に確保 */}
                  <span className="theme-sub">{showTheme ? r.theme_name : " "}</span>
                </Link>
              </td>
              <td>
                <div className="score-cell">
                  <div className="score-bar-track">
                    <div
                      className="score-bar-fill"
                      style={{ width: `${score}%`, background: scoreColor(r.aiba_score) }}
                    />
                  </div>
                  <span className="score-val" style={{ color: scoreColor(r.aiba_score) }}>
                    {fmt(r.aiba_score)}
                  </span>
                </div>
              </td>
              <td className="num">{fmt(r.technical_score)}</td>
              <td className="num">{fmt(r.sentiment_score)}</td>
              <td className="num">{fmt(r.rsi_14)}</td>
              <td className="num">{fmt(r.ma_deviation, 2)}%</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
