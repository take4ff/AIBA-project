import Link from "next/link";
import { RankingRow } from "@/lib/types";
import { scoreColor } from "@/lib/score-color";

// センチメントスコアをグラデーション色に変換（青寄り：研究熱量の高まりを表現）
function sentColor(score: number): string {
  if (score >= 75) return "#818cf8"; // indigo
  if (score >= 62) return "#60a5fa"; // blue
  if (score >= 50) return "#38bdf8"; // sky
  if (score >= 38) return "#9aa0aa"; // gray
  return "#71717a";
}

function trendLabel(trend: number): string {
  if (trend >= 15) return "急騰";
  if (trend >= 8)  return "上昇";
  if (trend >= 3)  return "微増";
  return "微増";
}

function trendColor(trend: number): string {
  if (trend >= 15) return "#dc2626";
  if (trend >= 8)  return "#d97706";
  return "#15a34a";
}

export default function SentimentSurgeSection({ rows }: { rows: RankingRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section className="layer" style={{ marginTop: 32 }}>
      <h2 className="layer-title">センチメント急騰中（過去45日間）</h2>
      <p className="layer-subtitle">
        GitHub・arXiv 等の研究熱量（センチメントスコア）が直近45日で最も大きく上昇した銘柄。
        <strong>「乖離注目」</strong>は株価がまだ反応していない先行シグナル候補。
      </p>

      <div className="surge-grid">
        {rows.map((r, i) => {
          const sent = r.sentiment_score ?? 0;
          const trend = r.sentiment_trend;
          return (
            <Link
              key={r.domain_id}
              href={`/domain/${r.domain_id}`}
              className="surge-card"
            >
              <div className="surge-rank">{i + 1}</div>

              <div className="surge-body">
                <div className="surge-name">
                  {r.domain_name}
                  <span className="ticker" style={{ marginLeft: 6 }}>{r.ticker}</span>
                  {r.divergence && (
                    <span className="surge-badge-div">乖離注目</span>
                  )}
                </div>

                {/* センチメントスコアバー */}
                <div className="surge-bar-wrap">
                  <div
                    className="surge-bar"
                    style={{ width: `${sent}%`, background: sentColor(sent) }}
                  />
                  <span className="surge-bar-label" style={{ color: sentColor(sent) }}>
                    {sent.toFixed(0)}
                  </span>
                </div>
              </div>

              <div className="surge-right">
                <span className="surge-trend" style={{ color: trendColor(trend) }}>
                  ▲{trend.toFixed(1)}
                </span>
                <span className="surge-tag" style={{ background: trendColor(trend) }}>
                  {trendLabel(trend)}
                </span>
                <span className="surge-aiba" style={{ color: scoreColor(r.aiba_score) }}>
                  AIBA {r.aiba_score?.toFixed(0) ?? "—"}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <p className="guide-note" style={{ marginTop: 10 }}>
        ※ センチメントは GitHub リポジトリ活動・arXiv 論文数をベースとした研究熱量指数（0-100）。
        急上昇はテーマの注目度が高まっているシグナル。AIBAスコアが低くても先行して注目される銘柄を捉えます。
      </p>
    </section>
  );
}
