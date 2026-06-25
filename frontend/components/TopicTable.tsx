"use client";

import { useState } from "react";
import Link from "next/link";
import { RankingRow } from "@/lib/types";
import { scoreColor, fmt } from "@/lib/score-color";
import { parseDomainId } from "@/lib/regions";
import { money } from "@/lib/sell-signal";
import StarButton from "@/components/StarButton";

const IS_SHORT = (r: RankingRow) => (r.ma_deviation ?? -1) > 0;
const IS_MID = (r: RankingRow) => (r.aiba_score ?? 0) >= 60;
const IS_LONG = (r: RankingRow) => r.sentiment_trend > 1 && (r.sentiment_score ?? 0) >= 50;

function SignalDots({ row }: { row: RankingRow }) {
  const signals = [
    { key: "短", active: IS_SHORT(row), tip: `短期: 25日線の上 (乖離率 ${row.ma_deviation != null ? (row.ma_deviation > 0 ? "+" : "") + row.ma_deviation.toFixed(1) + "%" : "—"})` },
    { key: "中", active: IS_MID(row), tip: `中期: AIBAスコア ${row.aiba_score ?? "—"}（≥60で点灯）` },
    { key: "長", active: IS_LONG(row), tip: `長期: センチメント≥50かつ上昇傾向 (熱量${row.sentiment_score ?? "—"} / 傾き${row.sentiment_trend > 0 ? "+" : ""}${row.sentiment_trend})` },
  ];
  return (
    <span className="signal-dots">
      {signals.map(({ key, active, tip }) => (
        <span key={key} className={`signal-dot ${active ? "signal-on" : "signal-off"}`} title={tip}>
          {key}
        </span>
      ))}
    </span>
  );
}

function TopicTableInner({ rows, showTheme }: { rows: RankingRow[]; showTheme?: boolean }) {
  return (
    <div className="table-scroll">
      <table className="table">
        <colgroup>
          <col style={{ width: "3%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "17%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "7%" }} />
        </colgroup>
        <thead>
          <tr className="grp-row">
            <th></th>
            <th className="grp-head" colSpan={2}>シグナル</th>
            <th></th>
            <th colSpan={3} className="grp-head">総合スコア</th>
            <th colSpan={3} className="grp-head col-divider">構成スコア</th>
            <th></th>
          </tr>
          <tr>
            <th></th>
            <th title="短=25日線の上（乖離>0） / 中=AIBA≥60 / 長=センチメント≥50かつ傾き>1">短/中/長</th>
            <th>領域</th>
            <th className="num">株価</th>
            <th title="総合的な買い時度(0-100)">AIBAスコア</th>
            <th className="num" title="順張りモメンタム(0-100)：MA上・RSI強・直近上昇">モメンタム</th>
            <th className="num" title="1ヶ月後に買い場(AIBA≥60)入り確率">買い場確率</th>
            <th className="num col-divider" title="テクニカル指数(0-100)">テクニカル</th>
            <th className="num" title="研究熱量(0-100)。↑=上昇傾向">センチメント</th>
            <th className="num" title="RSI(14)">RSI</th>
            <th className="num" title="25日MA乖離率">乖離率</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const { region } = parseDomainId(r.domain_id);
            const score = r.aiba_score ?? 0;
            const priceVal = r.close_price;
            const currency: "JPY" | "USD" = region === "jp" ? "JPY" : "USD";
            const sentArrow = r.sentiment_trend > 1 ? "↑" : r.sentiment_trend < -1 ? "↓" : "→";
            return (
              <tr key={r.domain_id}>
                <td className="rank">
                  <StarButton domainId={r.domain_id} />
                  {i + 1}
                </td>
                <td><SignalDots row={r} /></td>
                <td>
                  <Link href={`/domain/${r.domain_id}`}>
                    <span className="name-line">
                      <span className="domain-name">{r.domain_name}</span>
                      <span className="ticker">{r.ticker}</span>
                    </span>
                    {showTheme && (
                      <span className="tag-row">
                        <span className="row2-theme">{r.theme_name}</span>
                      </span>
                    )}
                  </Link>
                </td>
                <td className="num">{money(priceVal, currency)}</td>
                <td>
                  <div className="score-cell">
                    <div className="score-bar-track">
                      <div className="score-bar-fill" style={{ width: `${score}%`, background: scoreColor(r.aiba_score) }} />
                    </div>
                    <span className="score-val" style={{ color: scoreColor(r.aiba_score) }}>{fmt(r.aiba_score)}</span>
                  </div>
                </td>
                <td className="num">
                  <span style={{ color: scoreColor(r.momentum_score), fontWeight: 700 }}>{r.momentum_score}</span>
                </td>
                <td className="num">
                  {r.buyzone_prob == null ? "—" : (
                    <span style={{ color: scoreColor(r.buyzone_prob * 100), fontWeight: 700 }}>
                      {(r.buyzone_prob * 100).toFixed(0)}%
                    </span>
                  )}
                </td>
                <td className="num col-divider">{fmt(r.technical_score)}</td>
                <td className="num">
                  {fmt(r.sentiment_score)}
                  <span className={`trend trend-${r.sentiment_trend > 1 ? "up" : r.sentiment_trend < -1 ? "down" : "flat"}`}>{sentArrow}</span>
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

export default function TopicTable({
  rows,
  initial = 30,
  step = 30,
  showTheme,
}: {
  rows: RankingRow[];
  initial?: number;
  step?: number;
  showTheme?: boolean;
}) {
  const [n, setN] = useState(initial);
  const shown = rows.slice(0, n);
  const remaining = rows.length - n;
  return (
    <>
      <TopicTableInner rows={shown} showTheme={showTheme} />
      {remaining > 0 && (
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <button className="more-link" onClick={() => setN((v) => v + step)}>
            もっと見る <span className="more-count">＋{Math.min(step, remaining)}</span>（残り {remaining}）
          </button>
        </div>
      )}
    </>
  );
}
