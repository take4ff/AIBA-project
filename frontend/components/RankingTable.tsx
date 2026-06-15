import Link from "next/link";
import { RankingRow } from "@/lib/types";
import { scoreColor, fmt } from "@/lib/score-color";
import { parseDomainId } from "@/lib/regions";
import { holdingStance } from "@/lib/stance";
import { money } from "@/lib/sell-signal";
import StarButton from "@/components/StarButton";
import ConceptIcon from "@/components/ConceptIcon";

const STANCE_ICON: Record<string, string> = { "st-long": "long", "st-short": "short", "st-both": "both", "st-neutral": "neutral" };

const trendDir = (t: number) => (t > 1 ? "up" : t < -1 ? "down" : "flat");
const trendArrow = (t: number) => (t > 1 ? "↑" : t < -1 ? "↓" : "→");
const REGION_BADGE: Record<string, string> = { global: "Global", us: "米国", jp: "日本" };

function rowHref(r: RankingRow, linkMode: "auto" | "domain"): string {
  if (linkMode === "auto" && r.kind === "etf") {
    const { theme, region } = parseDomainId(r.domain_id);
    return `/theme/${theme}/${region}`;
  }
  return `/domain/${r.domain_id}`;
}

export default function RankingTable({
  rows,
  showTheme = false,
  linkMode = "auto",
  showRegion = false,
  displayCurrency,
  usdjpy,
}: {
  rows: RankingRow[];
  showTheme?: boolean;
  linkMode?: "auto" | "domain";
  showRegion?: boolean;
  displayCurrency?: "JPY" | "USD";   // 指定時は全行をこの通貨に換算表示
  usdjpy?: number;                   // 換算用 USD/JPY レート
}) {
  return (
    <div className="table-scroll">
    <table className="table">
      <colgroup>
        <col style={{ width: "4%" }} />
        <col style={{ width: "19%" }} />
        <col style={{ width: "9%" }} />
        {/* 総合スコア */}
        <col style={{ width: "14%" }} />
        <col style={{ width: "11%" }} />
        <col style={{ width: "11%" }} />
        {/* 構成スコア */}
        <col style={{ width: "8%" }} />
        <col style={{ width: "10%" }} />
        <col style={{ width: "7%" }} />
        <col style={{ width: "7%" }} />
      </colgroup>
      <thead>
        <tr className="grp-row">
          <th></th>
          <th></th>
          <th></th>
          <th colSpan={3} className="grp-head">総合スコア</th>
          <th colSpan={4} className="grp-head col-divider">構成スコア（元データ）</th>
        </tr>
        <tr>
          <th></th>
          <th>領域</th>
          <th className="num">株価</th>
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
          const stance = holdingStance(r);
          const nativeCur = r.region === "jp" ? "JPY" : "USD";
          // 表示通貨指定があれば換算（無ければネイティブ通貨）
          let priceVal = r.close_price;
          let currency: "JPY" | "USD" = nativeCur;
          if (displayCurrency && usdjpy && priceVal != null && displayCurrency !== nativeCur) {
            priceVal = displayCurrency === "JPY" ? priceVal * usdjpy : priceVal / usdjpy;
          }
          if (displayCurrency) currency = displayCurrency;
          return (
            <tr key={r.domain_id}>
              <td className="rank"><StarButton domainId={r.domain_id} />{i + 1}</td>
              <td>
                <Link href={rowHref(r, linkMode)}>
                  <span className="name-line">
                    <span className="domain-name">{r.domain_name}</span>
                    <span className="ticker">{r.ticker}</span>
                    {showRegion && <span className="region-tag">{REGION_BADGE[r.region] ?? r.region}</span>}
                  </span>
                  {/* 2行目：乖離・保有目安タグ＋（個別株表示時の）テーマ名 */}
                  <span className="tag-row">
                    {r.divergence && (
                      <span className="div-badge" title="センチメント上昇 × 株価が出遅れ＝仕込み好機（乖離）"><ConceptIcon name="divergence" /> 乖離</span>
                    )}
                    {stance && <span className={`stance-badge ${stance.cls}`} title={stance.reason}><ConceptIcon name={STANCE_ICON[stance.cls] ?? "neutral"} /> {stance.label}</span>}
                    {r.momentum_score >= 65 && (
                      <span className="mom-badge" title="順張りモメンタム：MAより上・RSI強い・直近上昇。勢いに乗る視点（AIBAの逆張りと対）"><ConceptIcon name="momentum" /> 順張り{r.momentum_score}</span>
                    )}
                    {showTheme && <span className="row2-theme">{r.theme_name}</span>}
                  </span>
                </Link>
              </td>
              <td className="num">{money(priceVal, currency)}</td>
              {/* --- 総合スコア --- */}
              <td>
                <div className="score-cell">
                  <div className="score-bar-track">
                    <div className="score-bar-fill" style={{ width: `${score}%`, background: scoreColor(r.aiba_score) }} />
                  </div>
                  <span className="score-val" style={{ color: scoreColor(r.aiba_score) }}>{fmt(r.aiba_score)}</span>
                </div>
              </td>
              <td>
                <span className="combo-pill" style={{ background: scoreColor(r.combo_score) }}>{r.combo_score}</span>
              </td>
              <td className="num">
                {r.buyzone_prob == null ? "—" : (
                  <span style={{ color: scoreColor(r.buyzone_prob * 100), fontWeight: 700 }}>{(r.buyzone_prob * 100).toFixed(0)}%</span>
                )}
              </td>
              {/* --- 構成スコア --- */}
              <td className="num col-divider">{fmt(r.technical_score)}</td>
              <td className="num">
                {fmt(r.sentiment_score)}
                <span className={`trend trend-${trendDir(r.sentiment_trend)}`}>{trendArrow(r.sentiment_trend)}</span>
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
