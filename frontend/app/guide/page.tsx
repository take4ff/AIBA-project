import NavTabs from "@/components/NavTabs";
import { scoreColor } from "@/lib/score-color";

export const metadata = { title: "スコア定義 — AIBA" };

// 静的な定義ページ（データ取得なし）。実装ロジックに対応。
export default function GuidePage() {
  const legend = [
    { v: 30, label: "〜38 見送り" },
    { v: 44, label: "〜48" },
    { v: 54, label: "〜58 中立" },
    { v: 64, label: "〜70" },
    { v: 80, label: "70〜 買い場" },
  ];

  return (
    <main className="container">
      <header className="header">
        <h1>📖 スコア定義</h1>
        <p className="fullname">Advanced Investment &amp; Behavior Analytics</p>
        <p>各スコアの定義・計算式・見方をまとめています。実装（<code>backend/aiba/score.py</code> ほか）に対応。</p>
      </header>

      <NavTabs active="guide" />

      {/* 運用の考え方（コア・サテライト） */}
      <section className="layer def-section">
        <h2 className="layer-title">🧭 このツールの使い方（コア・サテライト戦略）</h2>
        <p>
          AIBAは<strong>本業優先・放置/長期保有</strong>を前提に、次世代技術テーマを<strong>サテライト（長期の成長枠）</strong>として育てるためのツールです。
          短期売買の道具ではありません。
        </p>
        <ul className="def-list">
          <li><strong>コア（放置）</strong>：全世界株などのインデックス投資。資産の土台として基本ほったらかし。</li>
          <li><strong>サテライト（長期成長枠）</strong>：AIBAで見つけた次世代技術テーマを少額トッピング。<strong>長期で保有</strong>し成長を取りに行く。</li>
          <li><strong>AIBAの役割</strong>：センチメント先行 × 株価出遅れの<strong>乖離</strong>から<strong>「入口（押し目）のタイミング」</strong>を計る。狙いは“安く仕込む”。そこから先は長期保有でテーマの成長を取りに行く。</li>
        </ul>
        <p className="guide-note">
          ※ レジーム拡張(2022〜2026)の検証では、買いシグナルの<strong>安定した優位は「1ヶ月（押し目の入口）」</strong>（買い +5.4% vs 全体 +2.6%・勝率61%／<a className="back-link" href="/verify">検証</a>）。
          中〜長期では明確な優位は確認できず＝<strong>AIBAは“入口を計る”道具</strong>。長期保有はシグナルが長期を当てるからではなく、<strong>テーマの構造的成長</strong>を取りに行くためのもの。日々の確認は不要です。
        </p>
      </section>

      {/* AIBAスコア */}
      <section className="layer def-section">
        <h2 className="layer-title">AIBAスコア（0–100）— 総合「買い時度」</h2>
        <p>テクニカルの「割安感」とセンチメントの「研究熱量」を、領域の階層に応じた重みで合成し、過熱（RSI&gt;50）を減点した総合スコア。高いほど割安・買い場。</p>
        <pre className="formula">AIBA = clamp( w_tech × テクニカル + w_sent × センチメント − RSIペナルティ , 0, 100)</pre>
        <table className="def-table">
          <thead><tr><th>階層</th><th>狙い</th><th className="num">w_tech</th><th className="num">w_sent</th></tr></thead>
          <tbody>
            <tr><td>第1層：現在のブーム</td><td>過熱が収まった押し目を狙う</td><td className="num">0.70</td><td className="num">0.30</td></tr>
            <tr><td>第2層：次なる波</td><td>バランス成長を捉える</td><td className="num">0.50</td><td className="num">0.50</td></tr>
            <tr><td>第3層：未来の開拓地</td><td>水面下の研究熱量を先取り</td><td className="num">0.30</td><td className="num">0.70</td></tr>
          </tbody>
        </table>
        <p className="guide-note">RSIペナルティ＝(RSI − 50) × 0.5（RSI≤50 は 0）。過熱した銘柄ほど減点される。</p>
      </section>

      {/* テクニカル */}
      <section className="layer def-section">
        <h2 className="layer-title">テクニカルスコア（0–100）— 株価の割安感</h2>
        <p>RSI割安スコアと移動平均乖離スコアの平均。RSIが低い（売られすぎ）・移動平均より株価が下にあるほど高得点。</p>
        <pre className="formula">{`RSI割安スコア   = clamp(100 − RSI, 0, 100)
MA乖離スコア    = 100 / (1 + exp(0.1 × 乖離率[%]))   ← 平均より下=高得点
テクニカル      = (RSI割安スコア + MA乖離スコア) / 2`}</pre>
      </section>

      {/* センチメント */}
      <section className="layer def-section">
        <h2 className="layer-title">センチメントスコア（0–100）— 研究開発の熱量</h2>
        <p>「水面下の熱量」を、基準日からの直近30日とその前30日の活動量の比（増加率）で捉える。50=横ばい、50超=加速、50未満=減速。地域共通の先行指標。</p>
        <pre className="formula">{`比 = (直近30日の件数 + 1) / (前30日の件数 + 1)
スコア = 100 / (1 + exp(−1.5 × ln(比)))      ← 比≈2倍で約75点`}</pre>
        <p>下記5ソースのうち<strong>取得できた指標のみ平均</strong>（失敗指標は中立50で薄めず除外）：</p>
        <ul className="def-list">
          <li><strong>GitHub</strong>：キーワードに合致する新規リポジトリ数＋コミット活動量の増加率</li>
          <li><strong>arXiv</strong>：論文数（submittedDate範囲）の増加率</li>
          <li><strong>Hacker News</strong>：注目ストーリー（points≥10）数の増加率</li>
          <li><strong>Google Trends</strong>：検索関心の増加率</li>
          <li><strong>特許（EPO OPS）</strong>：タイトル一致の公開特許件数（公開日）の増加率 ※APIキー設定時のみ</li>
        </ul>
      </section>

      {/* 成長×割安 */}
      <section className="layer def-section">
        <h2 className="layer-title">成長×割安スコア（0–100）</h2>
        <p>「今割安（AIBA）」と「研究熱量の上昇（センチメントの傾き）」を合成。高いほど“今買い時かつ将来も伸びそう”。第2・3層で高いものが狙い目。</p>
        <pre className="formula">{`熱量モメンタム = clamp(50 + センチメント傾き × 3, 0, 100)
成長×割安      = 0.5 × AIBA + 0.5 × 熱量モメンタム`}</pre>
      </section>

      {/* 順張りモメンタム */}
      <section className="layer def-section">
        <h2 className="layer-title">順張りモメンタム（0–100）— AIBAと対の視点</h2>
        <p>AIBAが「押し目・逆張り」特化なのに対し、<strong>勢いに乗る（順張り）</strong>ための補助スコア。移動平均より上・RSIが強い・直近が上昇しているほど高い。投資スタイルに応じて使い分ける。</p>
        <pre className="formula">{`MA位置   = clamp(50 + 乖離率[%] × 3)
RSI勢い  = clamp(RSI − max(0, RSI−80) × 2)   ← 80超は過熱で減衰
直近上昇 = clamp(50 + 直近の株価変化[%] × 2)
モメンタム = (MA位置 + RSI勢い + 直近上昇) / 3`}</pre>
        <p className="guide-note">ランキングでは65以上で「🚀 順張り」タグ、銘柄詳細では数値と基調（上昇/中立/下降）を表示。</p>
      </section>

      {/* 傾き・乖離 */}
      <section className="layer def-section">
        <h2 className="layer-title">センチメント傾き（↑↓）と 🔀乖離</h2>
        <ul className="def-list">
          <li><strong>センチメント傾き ↑↓</strong>：直近のセンチメント変化。↑=熱量上昇（将来の伸びの先行サイン）、↓=減速、→=横ばい。</li>
          <li><strong>🔀乖離</strong>：センチメント（先行指標）が上昇しているのに株価がまだ追いついていない状態（傾き&gt;1 かつ 株価変化&lt;2%）。本システムが狙う<strong>仕込み好機</strong>のサイン。</li>
        </ul>
      </section>

      {/* 長期トレンド（放置・長期保有向け） */}
      <section className="layer def-section">
        <h2 className="layer-title">長期トレンド指標（放置・長期保有向け）</h2>
        <p>短期のRSI/25日線に対し、<strong>長期の押し目</strong>を見るための指標。銘柄詳細とチャート（200日線）に表示。</p>
        <ul className="def-list">
          <li><strong>200日移動平均乖離 [%]</strong>：長期トレンドからの位置。<strong>マイナスが大きいほど長期の押し目</strong>（−12%以下＝長期の買い場、−3〜+8%＝中立、+20%超＝割高）。</li>
          <li><strong>52週レンジ内の位置</strong>：直近1年の安値0〜高値100。低いほど長期の値ごろ感。</li>
        </ul>
        <p className="guide-note">数ヶ月に一度の「真の長期買い場」を捉える狙い。日々のRSI変動に一喜一憂せず、200日線割れ等の長期サインを重視。</p>
      </section>

      {/* 補助テクニカル */}
      <section className="layer def-section">
        <h2 className="layer-title">補助テクニカル指標</h2>
        <ul className="def-list">
          <li><strong>RSI(14)</strong>：相対力指数。一般に70超で買われすぎ（過熱）、30未満で売られすぎ。AIBAは50超に過熱ペナルティ。</li>
          <li><strong>乖離率</strong>：25日移動平均からの株価の乖離[%]。マイナス=平均より下（割安）、プラス=上（割高）。</li>
          <li><strong>ボリンジャーバンド(20, 2σ)</strong>：20日平均±2σ。下限付近は売られすぎ、上限付近は過熱の目安。</li>
          <li><strong>MACD</strong>：短期(12)・長期(26)EMAの差とそのシグナル(9)。ゴールデン/デッドクロスでトレンド転換を読む。</li>
          <li><strong>購入目安</strong>：妥当値=25日MA／押し目買い目安=−1σ／下値支持=60日安値。</li>
        </ul>
      </section>

      {/* 1ヶ月予測 */}
      <section className="layer def-section">
        <h2 className="layer-title">1ヶ月先予測</h2>
        <ul className="def-list">
          <li><strong>買い場入り確率</strong>：今後およそ1ヶ月（21営業日）以内に AIBA が買い場（60以上）へ入る確率。ロジスティック回帰による。</li>
          <li><strong>予測AIBA</strong>：21営業日先の AIBA の点推定（平均回帰モデル）。</li>
        </ul>
        <p className="guide-note">小サンプルでの過学習を避け、平均回帰＋ロジスティックの単純モデルを採用（naive 比較で検証）。実績は「📊 検証」ページ参照。</p>
      </section>

      {/* 売り管理 */}
      <section className="layer def-section">
        <h2 className="layer-title">保有管理（売り）</h2>
        <ul className="def-list">
          <li><strong>過熱度（0–100）</strong>＝100 − テクニカルスコア。高いほど割高・過熱。</li>
          <li><strong>売りシグナル合成</strong>：テクニカル過熱＋ファンダ（高PER/減益）＋決算接近 を合成して売り場を判定。</li>
          <li><strong>損益％</strong>：（現在値 − 平均取得単価）/ 平均取得単価。</li>
        </ul>
      </section>

      {/* 保有目安バッジ */}
      <section className="layer def-section">
        <h2 className="layer-title">保有目安バッジ</h2>
        <p>買い場候補（AIBA≥55）の性質を示す：</p>
        <ul className="def-list">
          <li><strong>🌱長期</strong>：第2/3層＋熱量で構造的成長が見込める</li>
          <li><strong>⚡短期</strong>：売られすぎからの技術的リバウンド狙い</li>
          <li><strong>⚖️両面</strong>：その両方</li>
        </ul>
      </section>

      {/* 分析系 */}
      <section className="layer def-section">
        <h2 className="layer-title">銘柄詳細・ポートフォリオの分析</h2>
        <ul className="def-list">
          <li><strong>フェアバリュー（相対PER）</strong>：自社の予想PER vs 同一地域・同テーマのピア予想PER中央値。「◯%割安/割高」（表示は±60%上限）。成長率差が大きい銘柄は参考程度。</li>
          <li><strong>健康度レーダー</strong>：AIBA／割安(テク)／熱量／非過熱(=100−RSI)／押し目度／業績 を0–100で可視化。外側ほど良好。</li>
          <li><strong>配分分析</strong>：保有のテーマ別・地域別ウェイト。<strong>実効銘柄数 = 1 / HHI</strong>（HHI=各ウェイトの二乗和）。実効銘柄数が実銘柄数に近いほど分散。</li>
        </ul>
      </section>

      {/* 色の凡例 */}
      <section className="layer def-section">
        <h2 className="layer-title">色の目安（高いほど買い場）</h2>
        <div className="guide-legend">
          {legend.map((l) => (
            <span key={l.label} className="lg" style={{ background: scoreColor(l.v) }}>{l.label}</span>
          ))}
        </div>
        <p className="guide-note" style={{ marginTop: 12 }}>
          ※ 本ページは投資助言ではありません。スコアは公開データに基づく定量指標であり、将来の成果を保証しません。
        </p>
      </section>
    </main>
  );
}
