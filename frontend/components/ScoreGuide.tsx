// スコアの見方を説明する折りたたみパネル。

const ITEMS: { term: string; desc: string }[] = [
  {
    term: "AIBAスコア (0–100)",
    desc: "総合的な「買い時度」。高いほど割安・買い場。層ごとにテクニカルとセンチメントを重み付けして算出し、RSIが過熱(50超)だと減点される。",
  },
  {
    term: "成長×割安 (0–100)",
    desc: "「今割安(AIBA)」と「研究熱量の上昇(センチメントの傾き)」を合成した指標。高いほど“今買い時かつ将来も伸びそう”な候補。第2・3層で高いものが狙い目。",
  },
  {
    term: "テクニカル (0–100)",
    desc: "株価の「割安感」。RSIが低い(売られすぎ)・移動平均より株価が下にあるほど高得点。",
  },
  {
    term: "センチメントの ↑↓",
    desc: "センチメントの直近の傾き。↑=研究開発の熱量が上昇中(将来の伸びの先行サイン)、↓=減速、→=横ばい。",
  },
  {
    term: "🔀 乖離",
    desc: "センチメント(先行指標)が上昇しているのに株価がまだ追いついていない状態。本システムが狙う「仕込み好機」のサイン。",
  },
  {
    term: "保有目安 🌱長期 / ⚡短期 / ⚖️両面",
    desc: "買い場候補(AIBA≥55)の性質。🌱長期=第2/3層＋熱量で構造的成長、⚡短期=売られすぎの技術的リバウンド狙い、⚖️両面=その両方。",
  },
  {
    term: "センチメント (0–100)",
    desc: "GitHub・arXivの研究開発の熱量。50=横ばい、50超=加速、50未満=減速。地域共通の先行指標。",
  },
  {
    term: "RSI(14)",
    desc: "相対力指数。一般に70超で買われすぎ(過熱)、30未満で売られすぎ。AIBAは50超に過熱ペナルティを課す。",
  },
  {
    term: "乖離率",
    desc: "25日移動平均からの株価の乖離[%]。マイナス=平均より下(割安)、プラス=上(割高)。",
  },
  {
    term: "買い場確率(1ヶ月)",
    desc: "今後およそ1ヶ月以内に AIBA が買い場(60以上)へ入る確率。平均回帰＋確率モデルによる予測。",
  },
];

export default function ScoreGuide() {
  return (
    <details className="guide">
      <summary>📖 スコアの見方</summary>
      <div className="guide-body">
        <dl className="guide-list">
          {ITEMS.map((it) => (
            <div key={it.term} className="guide-item">
              <dt>{it.term}</dt>
              <dd>{it.desc}</dd>
            </div>
          ))}
        </dl>

        <div className="guide-legend">
          <span className="guide-legend-title">色の目安（高いほど買い場）：</span>
          <span className="lg" style={{ background: "#dc2626" }}>〜38 見送り</span>
          <span className="lg" style={{ background: "#d97706" }}>〜48</span>
          <span className="lg" style={{ background: "#2456e6" }}>〜58 中立</span>
          <span className="lg" style={{ background: "#0d9488" }}>〜70</span>
          <span className="lg" style={{ background: "#15a34a" }}>70〜 買い場</span>
        </div>

        <p className="guide-note">
          タブ＝地域（Global/米国/日本）、トグル＝業界ETF/個別株。並び順はその地域の
          <strong>業界ETFスコア順</strong>で固定（ETF↔個別株を切替えても業界の位置が揃う）。
          領域名をクリックすると時系列チャート（株価×スコア、買い場ハイライト）が見られます。
        </p>
      </div>
    </details>
  );
}
