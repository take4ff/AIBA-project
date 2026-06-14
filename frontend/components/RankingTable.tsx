import Link from "next/link";
import { RankingRow } from "@/lib/types";
import { scoreColor, fmt } from "@/lib/score-color";

export default function RankingTable({ rows, showTheme = false }: { rows: RankingRow[]; showTheme?: boolean }) {
  return (
    <table className="table">
      <colgroup>
        <col style={{ width: "4%" }} />
        <col style={{ width: "27%" }} />
        <col style={{ width: "20%" }} />
        <col style={{ width: "9%" }} />
        <col style={{ width: "9%" }} />
        <col style={{ width: "8%" }} />
        <col style={{ width: "8%" }} />
        <col style={{ width: "15%" }} />
      </colgroup>
      <thead>
        <tr>
          <th></th>
          <th>領域</th>
          <th title="総合的な買い時度(0-100)。高いほど割安・買い場。色: 緑=買い場 / 赤=見送り">AIBAスコア</th>
          <th className="num" title="株価の割安感(0-100)。RSIが低い・移動平均より下ほど高得点">テクニカル</th>
          <th className="num" title="GitHub/arXivの研究熱量(0-100)。50=横ばい、50超=加速">センチメント</th>
          <th className="num" title="相対力指数。70超=過熱、30未満=売られすぎ。50超はAIBA減点">RSI(14)</th>
          <th className="num" title="25日移動平均からの乖離[%]。マイナス=平均より下(割安)">乖離率</th>
          <th className="num" title="今後約1ヶ月でAIBAが買い場(60以上)に入る確率の予測">買い場確率<br />(1ヶ月)</th>
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
              <td className="num">
                {r.buyzone_prob == null ? (
                  "—"
                ) : (
                  <span style={{ color: scoreColor(r.buyzone_prob * 100), fontWeight: 700 }}>
                    {(r.buyzone_prob * 100).toFixed(0)}%
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
