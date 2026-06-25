"use client";

import { useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, ResponsiveContainer,
} from "recharts";
import Link from "next/link";
import { RankingRow } from "@/lib/types";
import { EtfSentimentPoint, CapexPoint } from "@/lib/data";
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
const CAPEX_COLORS: Record<string, string> = { AMZN: "#f59e0b", MSFT: "#6366f1", GOOGL: "#10b981", META: "#f43f5e" };

interface Phase { label: string; color: string; desc: string }

// CAPEX実額からフェーズを判定（直近4四半期 vs 前4四半期の合計比較）
function determinePhaseFromCapex(capex: CapexPoint[]): Phase | null {
  if (capex.length < 5) return null;
  const sum = (pts: CapexPoint[]) =>
    pts.reduce((s, p) => s + (p.AMZN ?? 0) + (p.MSFT ?? 0) + (p.GOOGL ?? 0), 0);
  const recent = sum(capex.slice(-4));
  const prev = sum(capex.slice(-8, -4));
  if (prev === 0) return null;
  const growth = (recent - prev) / prev;
  if (growth >= 0.2)  return { label: "急拡大フェーズ", color: "#16a34a", desc: `CAPEX前年比 +${(growth * 100).toFixed(0)}%。恩恵銘柄に強い追い風` };
  if (growth >= 0.05) return { label: "拡大フェーズ",   color: "#65a30d", desc: `CAPEX前年比 +${(growth * 100).toFixed(0)}%。恩恵銘柄に追い風` };
  if (growth >= -0.05) return { label: "横ばい",         color: "#d97706", desc: "CAPEXは概ね前年並み" };
  return { label: "縮小フェーズ", color: "#dc2626", desc: `CAPEX前年比 ${(growth * 100).toFixed(0)}%。恩恵銘柄に向かい風` };
}

// フォールバック: ETFセンチメントからフェーズ判定
function determinePhaseFromSentiment(history: EtfSentimentPoint[]): Phase {
  if (history.length < 8) return { label: "判定中", color: "var(--muted)", desc: "履歴不足" };
  const recent = history.slice(-8);
  const first = recent[0], last = recent[recent.length - 1];
  const avg = (p: EtfSentimentPoint) => {
    const vals = [p.cloud_infra, p.data_center, p.semiconductor].filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 50;
  };
  const levelNow = avg(last), trend = levelNow - avg(first);
  if (levelNow >= 60 && trend >= 0) return { label: "拡大フェーズ",  color: "#16a34a", desc: "研究熱量が高水準で上昇中" };
  if (levelNow >= 55 && trend >= -3) return { label: "高水準維持",    color: "#65a30d", desc: "研究熱量は高水準を継続中" };
  if (trend >= 3)  return { label: "回復・転換期",  color: "#2563eb", desc: "研究熱量が上昇中。転換サイン" };
  if (levelNow < 45 && trend < 0) return { label: "縮小フェーズ", color: "#dc2626", desc: "研究熱量が低下中" };
  return { label: "踊り場", color: "#d97706", desc: "方向感が定まらない状態" };
}

function fmtQuarter(d: string): string {
  const date = new Date(d);
  const m = date.getMonth() + 1;
  const q = m <= 3 ? "Q1" : m <= 6 ? "Q2" : m <= 9 ? "Q3" : "Q4";
  return `${String(date.getFullYear()).slice(2)}/${q}`;
}

export default function HyperscalerView({
  etfHistory, stocks, capex,
}: {
  etfHistory: EtfSentimentPoint[];
  stocks: RankingRow[];
  capex: CapexPoint[];
}) {
  const stockMap = useMemo(() => new Map(stocks.map((s) => [s.domain_id, s])), [stocks]);
  const phase = useMemo(
    () => determinePhaseFromCapex(capex) ?? determinePhaseFromSentiment(etfHistory),
    [capex, etfHistory],
  );
  const hasCapex = capex.length > 0;
  const fmtDate = (d: string) => d.slice(2, 7).replace("-", "/");

  return (
    <div>
      {/* フェーズインジケーター */}
      <div className="hsc-phase">
        <span className="hsc-phase-label">現在のCAPEXフェーズ</span>
        <span className="hsc-phase-verdict" style={{ color: phase.color }}>{phase.label}</span>
        <span className="hsc-phase-desc">{phase.desc}</span>
      </div>

      {/* CAPEX実額推移チャート */}
      <div className="chart-wrap" style={{ marginTop: 20 }}>
        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
          四半期CAPEX実額（十億ドル）─ yfinance / 決算ベース
          {!hasCapex && <span style={{ marginLeft: 8, color: "#d97706" }}>※ データ未取得（月次Actionsで自動更新）</span>}
        </p>
        {hasCapex ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={capex.slice(-12)} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#e6e8ec" strokeDasharray="3 3" />
              <XAxis dataKey="quarter" tickFormatter={fmtQuarter} fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => `$${v}B`} />
              <Tooltip formatter={(v: number) => `$${v}B`} labelFormatter={fmtQuarter} />
              <Legend />
              {(["AMZN", "MSFT", "GOOGL", "META"] as const).map((t) => (
                <Bar key={t} dataKey={t} name={t} fill={CAPEX_COLORS[t]} stackId={undefined} maxBarSize={20} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ padding: "20px 0", color: "var(--muted)", fontSize: 13 }}>
            初回データ取得は月次 Actions（毎月1日）または手動で<code>python backend/capex_job.py</code>を実行してください。
          </div>
        )}
        {hasCapex && (
          <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
            AWS(AMZN)・Azure(MSFT)・GCP(GOOGL)・Meta の四半期設備投資額。直近12四半期表示。
          </p>
        )}
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
