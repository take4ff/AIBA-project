import Link from "next/link";
import { RankingRow } from "@/lib/types";
import { scoreColor, fmt } from "@/lib/score-color";

export default function RankingTable({ rows }: { rows: RankingRow[] }) {
  return (
    <table className="table">
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
