import Link from "next/link";
import { RankingRow } from "@/lib/types";
import { scoreColor, fmt } from "@/lib/score-color";

// センチメントの傾き（直近変化）を矢印で表す。±1未満は横ばい扱い。
const trendDir = (t: number) => (t > 1 ? "up" : t < -1 ? "down" : "flat");
const trendArrow = (t: number) => (t > 1 ? "↑" : t < -1 ? "↓" : "→");

export default function RankingTable({ rows, showTheme = false }: { rows: RankingRow[]; showTheme?: boolean }) {
  return (
    <div className="table-scroll">
    <table className="table">
      <colgroup>
        <col style={{ width: "4%" }} />
        <col style={{ width: "20%" }} />
        {/* 総合スコア */}
        <col style={{ width: "15%" }} />
        <col style={{ width: "12%" }} />
        <col style={{ width: "12%" }} />
        {/* 構成スコア（元データ）*/}
        <col style={{ width: "9%" }} />
        <col style={{ width: "12%" }} />
        <col style={{ width: "7%" }} />
        <col style={{ width: "9%" }} />
      </colgroup>
      <thead>
        <tr className="grp-row">
          <th></th>
          <th></th>
          <th colSpan={3} className="grp-head">総合スコア</th>
          <th colSpan={4} className="grp-head col-divider">構成スコア（元データ）</th>
        </tr>
        <tr>
          <th></th>
          <th>領域</th>
          <th title="総合的な買い時度(0-100)。高いほど割安・買い場。色: 緑=買い場 / 赤=見送り">AIBAスコア</th>
          <th title="成長×割安(0-100)。割安(AIBA)と研究熱量の上昇を合成。今買い時かつ将来伸びそうな候補を探す指標">成長×割安</th>
          <th className="num" title="今後約1ヶ月でAIBAが買い場(60以上)に入る確率の予測">買い場確率<br />(1ヶ月)</th>
          <th className="num col-divider" title="株価の割安感(0-100)。RSIが低い・移動平均より下ほど高得点">テクニカル</th>
          <th className="num" title="GitHub/arXiv/HNの研究熱量(0-100)。50=横ばい、50超=加速。↑↓は直近の傾き">センチメント</th>
          <th className="num" title="相対力指数。70超=過熱、30未満=売られすぎ。50超はAIBA減点">RSI(14)</th>
          <th className="num" title="25日移動平均からの乖離[%]。マイナス=平均より下(割安)">乖離率</th>
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
                  {r.divergence && (
                    <span className="div-badge" title="センチメント上昇 × 株価が出遅れ＝仕込み好機（乖離）">🔀 乖離</span>
                  )}
                  {/* ETF/個別株の切替で行高が変わらないよう、サブ行は常に確保 */}
                  <span className="theme-sub">{showTheme ? r.theme_name : " "}</span>
                </Link>
              </td>
              {/* --- 総合スコア --- */}
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
              <td>
                <span className="combo-pill" style={{ background: scoreColor(r.combo_score) }}>
                  {r.combo_score}
                </span>
              </td>
              <td className="num">
                {r.buyzone_prob == null ? (
                  "—"
                ) : (
                  <span style={{ color: scoreColor(r.buyzone_prob * 100), fontWeight: 700 }}>
                    {(r.buyzone_prob * 100).toFixed(0)}%
                  </span>
                )}
              </td>
              {/* --- 構成スコア（元データ）--- */}
              <td className="num col-divider">{fmt(r.technical_score)}</td>
              <td className="num">
                {fmt(r.sentiment_score)}
                <span className={`trend trend-${trendDir(r.sentiment_trend)}`}>
                  {trendArrow(r.sentiment_trend)}
                </span>
              </td>
              <td className="num">{fmt(r.rsi_14)}</td>
              <td className="num">{fmt(r.ma_deviation, 2)}%</td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}
