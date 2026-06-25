"use client";

import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, ResponsiveContainer,
} from "recharts";
import Link from "next/link";
import { RankingRow } from "@/lib/types";
import { EtfSentimentPoint } from "@/lib/data";
import { scoreColor, fmt } from "@/lib/score-color";

const GROUPS = [
  {
    key: "hyperscaler",
    label: "① ハイパースケーラ本体",
    desc: "CAPEXを発注する側（AWS・Azure・GCP）",
    ids: ["cloud_infra_us_amzn", "generative_ai_us_msft", "generative_ai_us_googl"],
    color: "#6366f1",
  },
  {
    key: "semiconductor",
    label: "② 半導体（直接恩恵）",
    desc: "GPU・チップの主要サプライヤー",
    ids: ["advanced_semiconductor_us_nvda", "advanced_semiconductor_us_amd", "advanced_semiconductor_us_avgo"],
    color: "#f59e0b",
  },
  {
    key: "datacenter",
    label: "③ DC機器・ネットワーク",
    desc: "サーバー・スイッチ・設備",
    ids: ["cloud_infra_us_smci", "cloud_infra_us_anet"],
    color: "#0ea5e9",
  },
  {
    key: "software",
    label: "④ クラウドSaaS",
    desc: "クラウドインフラ上のソフトウェア層",
    ids: ["cloud_infra_us_snow", "cloud_infra_us_ddog", "cloud_infra_us_net"],
    color: "#10b981",
  },
];

const ETF_COLORS = { cloud_infra: "#6366f1", data_center: "#0ea5e9", semiconductor: "#f59e0b" };
const ETF_LABELS = { cloud_infra: "クラウドインフラ", data_center: "データセンター", semiconductor: "半導体" };

interface Phase { label: string; color: string; desc: string }

function determinePhase(history: EtfSentimentPoint[]): Phase {
  if (history.length < 8) return { label: "判定中", color: "var(--muted)", desc: "履歴不足" };
  const recent = history.slice(-8);
  const first = recent[0], last = recent[recent.length - 1];
  const avg = (p: EtfSentimentPoint) => {
    const vals = [p.cloud_infra, p.data_center, p.semiconductor].filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 50;
  };
  const levelNow = avg(last), levelPast = avg(first);
  const trend = levelNow - levelPast;

  if (levelNow >= 60 && trend >= 0) return { label: "拡大フェーズ", color: "#16a34a", desc: "CAPEX積極投資局面。恩恵銘柄に追い風" };
  if (levelNow >= 55 && trend >= -3) return { label: "高水準維持", color: "#65a30d", desc: "CAPEXは高水準を継続中" };
  if (trend >= 3) return { label: "回復・転換期", color: "#2563eb", desc: "センチメントが上昇中。拡大への転換サイン" };
  if (levelNow < 45 && trend < 0) return { label: "縮小フェーズ", color: "#dc2626", desc: "CAPEXペースが鈍化。恩恵銘柄に向かい風" };
  return { label: "踊り場", color: "#d97706", desc: "方向感が定まらない状態" };
}

export default function HyperscalerView({
  etfHistory, stocks,
}: {
  etfHistory: EtfSentimentPoint[];
  stocks: RankingRow[];
}) {
  const stockMap = useMemo(() => new Map(stocks.map((s) => [s.domain_id, s])), [stocks]);
  const phase = useMemo(() => determinePhase(etfHistory), [etfHistory]);
  const fmtDate = (d: string) => d.slice(2, 7).replace("-", "/");

  return (
    <div>
      {/* フェーズインジケーター */}
      <div className="hsc-phase">
        <span className="hsc-phase-label">現在のCAPEXフェーズ</span>
        <span className="hsc-phase-verdict" style={{ color: phase.color }}>{phase.label}</span>
        <span className="hsc-phase-desc">{phase.desc}</span>
      </div>

      {/* ETFセンチメント推移チャート */}
      <div className="chart-wrap" style={{ marginTop: 20 }}>
        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
          研究熱量（センチメントスコア）推移 ─ CAPEXサイクルのプロキシ（週次）
        </p>
        {etfHistory.length === 0 ? (
          <div className="notice">ETFのデータがまだありません。</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={etfHistory} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#e6e8ec" strokeDasharray="3 3" />
              <XAxis dataKey="trade_date" tickFormatter={fmtDate} fontSize={11} />
              <YAxis domain={[25, 80]} fontSize={11}
                label={{ value: "熱量", angle: -90, position: "insideLeft", fill: "#9aa0aa", fontSize: 11 }} />
              <ReferenceLine y={50} stroke="#9aa0aa" strokeDasharray="4 3"
                label={{ value: "中立 50", position: "insideTopLeft", fontSize: 10, fill: "#9aa0aa" }} />
              <Tooltip formatter={(v: number) => v.toFixed(1)} labelFormatter={(d) => String(d)} />
              <Legend formatter={(k) => ETF_LABELS[k as keyof typeof ETF_LABELS] ?? k} />
              {(["cloud_infra", "data_center", "semiconductor"] as const).map((k) => (
                <Line key={k} type="monotone" dataKey={k} name={k}
                  stroke={ETF_COLORS[k]} strokeWidth={2} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
        <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
          GitHub/arXiv/HN の研究活動量を数値化。50＝横ばい、50超＝加速。CAPEXの実数値ではなく、投資判断・研究活動の活発さを捉えるプロキシ。
          3テーマが揃って上昇 → 拡大フェーズ。
        </p>
      </div>

      {/* CAPEXフロー → 恩恵銘柄 */}
      <div style={{ marginTop: 28 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px", color: "var(--ink)" }}>
          CAPEXフロー別 恩恵銘柄
        </h3>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 16px" }}>
          ①→②→③→④の順に波及。AIBAスコアが高い（★=60以上）ほど現在の買い場に近い。
        </p>
        <div className="hsc-groups">
          {GROUPS.map((g) => {
            const groupStocks = g.ids.map((id) => stockMap.get(id)).filter(Boolean) as RankingRow[];
            return (
              <div key={g.key} className="hsc-group">
                <div className="hsc-group-head" style={{ borderLeftColor: g.color }}>
                  <span className="hsc-group-label">{g.label}</span>
                  <span className="hsc-group-desc">{g.desc}</span>
                </div>
                <div className="hsc-stock-list">
                  {groupStocks.length === 0 ? (
                    <div style={{ color: "var(--muted)", fontSize: 12, padding: "4px 0" }}>データなし</div>
                  ) : groupStocks.map((r) => {
                    const score = r.aiba_score ?? 0;
                    const isBuy = score >= 60;
                    return (
                      <Link key={r.domain_id} href={`/domain/${r.domain_id}`} className="hsc-stock-row">
                        <span className="hsc-ticker">{r.ticker}</span>
                        <span className="hsc-name">{r.domain_name}</span>
                        <div className="hsc-bar-wrap">
                          <div className="hsc-bar-fill" style={{ width: `${score}%`, background: scoreColor(r.aiba_score) }} />
                        </div>
                        <span className="hsc-score" style={{ color: scoreColor(r.aiba_score), fontWeight: isBuy ? 800 : 600 }}>
                          {fmt(r.aiba_score)}{isBuy && <span className="hsc-buy-mark"> ★</span>}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="guide-note" style={{ marginTop: 16 }}>
        ※ センチメントはCAPEX実数値の代替プロキシ。実際の設備投資額は各社決算資料を参照。AIBAスコアは割安感・研究熱量の合成で、将来の株価を保証しません。
      </p>
    </div>
  );
}
