"use client";

import { useState } from "react";
import NavTabs from "@/components/NavTabs";
import {
  GraduationCap, BookOpen, TrendingUp, BarChart3, ChevronDown, ChevronUp,
  Lightbulb, ArrowRight, HelpCircle, Star, Layers, Zap, Globe,
  Target, Calculator, ListChecks, CheckCircle2,
} from "lucide-react";
import Link from "next/link";

/* ----------------------------------------------------------------
   型定義
---------------------------------------------------------------- */
interface Term {
  id: string;
  term: string;
  short: string;
  detail: string;
  example?: string;
  tip?: string;
}

interface Faq {
  q: string;
  a: string;
}

/* ----------------------------------------------------------------
   Chapter 1 — 投資の基本用語
---------------------------------------------------------------- */
const BASICS: Term[] = [
  {
    id: "stock",
    term: "株式（かぶしき）",
    short: "会社の「所有権」を小さく分けたもの",
    detail:
      "企業が資金を集めるために発行する証券です。株を買うとその会社のオーナーの一員になり、会社が利益を出せば配当金を受け取ったり、株価が上がれば売却益を得たりできます。",
    example:
      "例：トヨタの株を1株買う = トヨタという会社の一部を所有する。トヨタが好調なら株価が上がり、売れば利益になる。",
    tip: "株価は常に変動します。値下がりリスクもあることを理解した上で投資しましょう。",
  },
  {
    id: "etf",
    term: "ETF（上場投資信託）",
    short: "たくさんの株をまとめて1本のパックにした投資商品",
    detail:
      "Exchange Traded Fundの略。複数の銘柄をひとまとめにしたパッケージで、株式市場でリアルタイムに売買できます。個別株より分散されていてリスクを抑えやすく、コストも低めです。AIBAが監視するのもETFと個別株の両方です。",
    example:
      "例：「半導体ETF（SMH）」を1株買う = エヌビディア・TSMC・インテルなど半導体企業数十社にまとめて投資したのと同じ効果。",
    tip: "テーマETFは個別株より安全ですが、構成銘柄の動向によって大きく動くこともあります。",
  },
  {
    id: "index",
    term: "インデックス投資",
    short: "市場全体の平均点を買う、最もシンプルな長期投資法",
    detail:
      "S&P500（米国上位500社）や全世界株（ACWI）などの指数に連動するファンドに積み立て投資する方法。個別銘柄を選ぶ手間なく、市場全体の成長を取り込めます。長期的に多くのプロのファンドを上回ってきた実績があります。",
    example:
      "例：毎月3万円を全世界株インデックスに積み立てる = 世界8,000社以上に少額ずつ自動分散投資。",
    tip: "AIBAの「コア・サテライト戦略」では、インデックスがコア（土台）の役割を果たします。",
  },
  {
    id: "nisa",
    term: "NISA（ニーサ）",
    short: "投資の利益が非課税になる、日本の優遇制度",
    detail:
      "本来、株や投資信託で得た利益には約20%の税金がかかります。NISAを使うと、年間360万円（成長投資枠240万円＋つみたて投資枠120万円）まで、非課税で投資できます。長期投資では税金の差が非常に大きくなります。",
    example:
      "例：100万円の利益が出た場合、通常なら約20万円が税金に。NISAなら0円。その20万円も運用に回せる。",
    tip: "まずNISA口座を開設するのが日本での投資の第一歩です。",
  },
  {
    id: "diversification",
    term: "分散投資",
    short: "「卵をひとつのカゴに盛るな」— リスクを複数に分ける",
    detail:
      "1つの銘柄に全額集中すると、その銘柄が暴落したとき大損になります。複数の銘柄・業種・地域に分けて投資することで、一部が下がっても全体への影響を抑えられます。",
    example:
      "例：AI株だけに100万円投資 vs AI・半導体・再エネ・ヘルスケアに25万円ずつ投資。後者の方が1つのテーマ暴落時のダメージが小さい。",
    tip: "AIBAのポートフォリオ機能の「配分分析」で、自分の投資が偏っていないか確認できます。",
  },
  {
    id: "compound",
    term: "複利（ふくり）",
    short: "利益が利益を生む「雪だるま式」の増殖",
    detail:
      "運用で得た利益を再投資し続けることで、時間とともに資産が加速度的に増える仕組みです。元本だけ運用する「単利」と比べ、長期では大きな差が生まれます。",
    example:
      "例：100万円を年5%で運用した場合\n• 10年後：単利 = 150万円 / 複利 = 163万円\n• 30年後：単利 = 250万円 / 複利 = 432万円（約1.7倍の差！）",
    tip: "複利の恩恵を最大化するには「長く持ち続けること」が最重要。AIBAも長期保有前提のツールです。",
  },
];

/* ----------------------------------------------------------------
   Chapter 2 — テクニカル指標
---------------------------------------------------------------- */
const TECHNICALS: Term[] = [
  {
    id: "rsi",
    term: "RSI（相対力指数）",
    short: "「買われすぎ」「売られすぎ」を数値で示す体温計",
    detail:
      "Relative Strength Indexの略。直近14日間の値上がり幅と値下がり幅の比率から算出する0〜100の指標です。一般的に70以上で「買われすぎ（過熱）」、30以下で「売られすぎ（割安）」のサインとされます。",
    example:
      "例：RSI=25 → 急落で売られすぎの可能性あり（反発を狙う入口候補）\nRSI=80 → 短期的に買われすぎで、調整が来る可能性あり",
    tip: "AIBAスコアはRSI50超を「過熱ペナルティ」として減点します。RSIが低いほどAIBAスコアが上がりやすい。",
  },
  {
    id: "ma",
    term: "移動平均線（MA）",
    short: "株価の「ならした平均」で、トレンドの方向を見る線",
    detail:
      "過去N日間の終値の平均を繋いだ線です。25日・200日など期間によって短期〜長期のトレンドを確認できます。株価が移動平均を下回っている状態は、平均より安く買えるチャンスとも言えます。",
    example:
      "例：25日線が右上がり → 上昇トレンド継続中\n株価が25日線を大きく下回る → 一時的な売られすぎの可能性",
    tip: "AIBAでは25日MA乖離率（短期）と200日MA乖離率（長期）の両方を確認できます。",
  },
  {
    id: "deviation",
    term: "乖離率（かいりりつ）",
    short: "移動平均線から株価がどれだけ離れているかの割合",
    detail:
      "「（現在の株価 ÷ 移動平均値 − 1）× 100」で計算します。マイナスなら平均より安い（割安感）、プラスなら平均より高い（割高感）を意味します。",
    example:
      "例：25日線=1000円、現在値=900円 → 乖離率 = −10%（平均より10%安い状態）",
    tip: "AIBAの「購入目安」に表示される「押し目買い目安（−1σ）」は、乖離率とボリンジャーバンドを組み合わせた目安価格です。",
  },
  {
    id: "bb",
    term: "ボリンジャーバンド",
    short: "株価の「想定変動範囲」を統計的に示すバンド",
    detail:
      "20日移動平均±2標準偏差（σ）のバンド。統計的に株価は約95%の確率でこのバンド内に収まります。下限付近は売られすぎ、上限付近は買われすぎの目安になります。",
    example:
      "例：バンド下限 = 800円、上限 = 1200円、現在値 = 820円\n→ 下限付近 = 売られすぎの可能性。反発を期待した入口候補。",
    tip: "銘柄詳細チャートでボリンジャーバンドを確認できます。",
  },
  {
    id: "macd",
    term: "MACD（マックディー）",
    short: "2本の移動平均の差でトレンドの「勢い」を測る指標",
    detail:
      "短期（12日）EMAと長期（26日）EMAの差（MACDライン）と、その9日平均（シグナルライン）を比較します。MACDがシグナルを下から上に抜ける「ゴールデンクロス」は上昇転換のサインとされます。",
    example:
      "例：MACDがゼロラインを上に突破 → 上昇モメンタムが強まっているサイン\nMACDがシグナルを下に割る → トレンド転換・調整の可能性",
    tip: "銘柄詳細ページのチャートでMACDを確認できます。",
  },
  {
    id: "per",
    term: "PER（株価収益率）",
    short: "「この株は業績に比べて割高か割安か」を見る指標",
    detail:
      "Price Earnings Ratioの略。株価 ÷ 1株当たり利益（EPS）で計算します。同業他社と比べたときの相対的な割安・割高感を判断します。ただし成長株は将来への期待でPERが高くなりがちです。",
    example:
      "例：A社PER=20倍、同業平均=30倍 → A社は同業より約33%割安\nAIBAの「フェアバリュー」欄でこの比較を自動計算しています。",
    tip: "AIBAの銘柄詳細で「相対PERフェアバリュー」を確認できます。同テーマの他社と自動比較。",
  },
];

/* ----------------------------------------------------------------
   Chapter 3 — AIBAの使い方
---------------------------------------------------------------- */
const FLOW_STEPS = [
  {
    icon: Globe,
    title: "①ランキングでテーマを探す",
    desc: 'Global / 米国 / 日本タブでAIBAスコア順に表示。スコア60以上の銘柄が「買い場候補」。特に🔀乖離マークがついているものは「センチメント先行×株価出遅れ」の仕込み好機サイン。',
    link: "/",
    linkText: "ランキングを見る",
  },
  {
    icon: Star,
    title: "②気になる銘柄を詳細で確認",
    desc: "銘柄名をクリックして詳細ページへ。健康度レーダー・フェアバリュー・チャート（RSI・ボリンジャーバンド・MACD）・1ヶ月予測を総合的に確認する。",
    link: null,
    linkText: null,
  },
  {
    icon: Layers,
    title: "③スクリーナーで絞り込む",
    desc: "地域・テーマ・AIBAスコア・買い場確率・乖離フラグなど複数条件を組み合わせて候補を絞り込む。「今すぐ買える候補」をリストアップするのに便利。",
    link: "/screener",
    linkText: "スクリーナーを試す",
  },
  {
    icon: Zap,
    title: "④Pickupで横断チェック",
    desc: '地域やETF/個別を問わず「今買い」候補を横断抽出。忙しいときはここを見るだけでも主要な買い場候補を把握できる。',
    link: "/pickup",
    linkText: "Pickupを見る",
  },
];

const FAQS: Faq[] = [
  {
    q: "AIBAスコアが高ければ必ず上がりますか？",
    a: "いいえ、保証はありません。AIBAは「統計的に押し目になりやすい状態」を示す指標であり、将来の株価を予測するものではありません。バックテストでは1ヶ月の買い優位（勝率61%）が確認されていますが、39%は負けます。投資はあくまでご自身の判断と責任で行ってください。",
  },
  {
    q: "AIBAスコアはどのくらいの頻度で更新されますか？",
    a: "平日の日次で自動更新されます（GitHub Actionsによる自動実行）。週末・祝日は更新されません。スコアが古い場合は最終更新日を確認してください。",
  },
  {
    q: "センチメントとは何ですか？",
    a: "「研究開発の熱量」を表す先行指標です。GitHub（リポジトリ数・コミット活動）、arXiv（論文数）、Hacker News（注目記事数）、Google Trends（検索関心）、特許（EPO）の増加率を集計しています。株価が動く前に、その技術への関心が先行して高まる傾向を利用しています。",
  },
  {
    q: "「乖離（かいり）」シグナルとはどういう意味ですか？",
    a: "センチメント（研究熱量）が上昇しているのに、株価がまだ追いついていない状態です。「水面下で熱を帯びているのに市場がまだ気づいていない」という仕込みの好機を示します。ランキングで🔀マーク、またはスクリーナーの乖離フィルターで絞り込めます。",
  },
  {
    q: "どのくらいの期間で保有すればいいですか？",
    a: "AIBAは「入口（押し目）」を計るためのツールです。入口を計ったあとは、テーマの構造的成長を取りに行くための長期保有が基本です。短期売買には向いていません。目安として、少なくとも1〜3年以上の保有を前提にするのが推奨スタンスです。",
  },
  {
    q: "ETFと個別株はどちらを選べばいいですか？",
    a: "初心者にはETFがおすすめです。1銘柄でそのテーマの複数企業に分散投資でき、個別企業のリスク（業績悪化・不祥事など）を薄めることができます。AIBAに慣れてきたら個別株のスコアも参考にしてみてください。",
  },
];

/* ----------------------------------------------------------------
   サブコンポーネント
---------------------------------------------------------------- */
function TermCard({ term }: { term: Term }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`learn-term-card${open ? " learn-term-card--open" : ""}`}>
      <button
        className="learn-term-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        id={`term-${term.id}`}
      >
        <div className="learn-term-left">
          <span className="learn-term-name">{term.term}</span>
          <span className="learn-term-short">{term.short}</span>
        </div>
        {open ? (
          <ChevronUp size={18} className="learn-chevron" />
        ) : (
          <ChevronDown size={18} className="learn-chevron" />
        )}
      </button>
      {open && (
        <div className="learn-term-body">
          <p className="learn-term-detail">{term.detail}</p>
          {term.example && (
            <div className="learn-example">
              <Lightbulb size={14} className="learn-example-ico" />
              <pre className="learn-example-text">{term.example}</pre>
            </div>
          )}
          {term.tip && (
            <div className="learn-tip">
              <span className="learn-tip-label"><Lightbulb size={12} style={{ verticalAlign: "-0.1em", marginRight: 4 }} />AIBAでの確認方法</span>
              <span className="learn-tip-text">{term.tip}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FaqItem({ faq, idx }: { faq: Faq; idx: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`learn-faq-item${open ? " learn-faq-item--open" : ""}`}>
      <button
        className="learn-faq-q"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        id={`faq-${idx}`}
      >
        <HelpCircle size={16} className="learn-faq-ico" />
        <span>{faq.q}</span>
        {open ? <ChevronUp size={16} className="learn-chevron" /> : <ChevronDown size={16} className="learn-chevron" />}
      </button>
      {open && <p className="learn-faq-a">{faq.a}</p>}
    </div>
  );
}

/* ----------------------------------------------------------------
   複利シミュレーター
---------------------------------------------------------------- */
function CompoundCalc() {
  const [principal, setPrincipal] = useState(100);
  const [monthly, setMonthly] = useState(3);
  const [rate, setRate] = useState(5);
  const [years, setYears] = useState(20);

  const calc = () => {
    const r = rate / 100 / 12;
    let balance = principal * 10000;
    for (let m = 0; m < years * 12; m++) {
      balance = balance * (1 + r) + monthly * 10000;
    }
    return Math.round(balance / 10000);
  };

  const total = calc();
  const invested = principal + monthly * 12 * years;
  const gain = total - invested;

  return (
    <div className="learn-calc">
      <h3 className="learn-calc-title"><Calculator size={16} style={{ verticalAlign: "-0.15em", marginRight: 7, color: "var(--accent)" }} />積立複利シミュレーター</h3>
      <div className="learn-calc-inputs">
        <label className="learn-calc-label">
          元本（万円）
          <input
            id="calc-principal"
            type="number"
            className="learn-calc-input"
            value={principal}
            min={0}
            max={10000}
            onChange={(e) => setPrincipal(Number(e.target.value))}
          />
        </label>
        <label className="learn-calc-label">
          毎月積立（万円）
          <input
            id="calc-monthly"
            type="number"
            className="learn-calc-input"
            value={monthly}
            min={0}
            max={100}
            onChange={(e) => setMonthly(Number(e.target.value))}
          />
        </label>
        <label className="learn-calc-label">
          年利（%）
          <input
            id="calc-rate"
            type="number"
            className="learn-calc-input"
            value={rate}
            min={0}
            max={30}
            step={0.5}
            onChange={(e) => setRate(Number(e.target.value))}
          />
        </label>
        <label className="learn-calc-label">
          期間（年）
          <input
            id="calc-years"
            type="number"
            className="learn-calc-input"
            value={years}
            min={1}
            max={50}
            onChange={(e) => setYears(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="learn-calc-result">
        <div className="learn-calc-stat">
          <span className="learn-calc-stat-label">総資産</span>
          <span className="learn-calc-stat-val learn-calc-stat-main">{total.toLocaleString()}万円</span>
        </div>
        <div className="learn-calc-stat">
          <span className="learn-calc-stat-label">投資元本合計</span>
          <span className="learn-calc-stat-val">{invested.toLocaleString()}万円</span>
        </div>
        <div className="learn-calc-stat">
          <span className="learn-calc-stat-label">運用益</span>
          <span className="learn-calc-stat-val learn-calc-gain">+{gain.toLocaleString()}万円</span>
        </div>
      </div>
      <p className="learn-calc-note">※ 税金・手数料は考慮していません。参考値としてご利用ください。</p>
    </div>
  );
}

/* ----------------------------------------------------------------
   メインページ
---------------------------------------------------------------- */
const CHAPTERS = [
  { key: "basics", label: "投資の基本", icon: BookOpen },
  { key: "technicals", label: "テクニカル指標", icon: TrendingUp },
  { key: "aiba", label: "AIBAの使い方", icon: BarChart3 },
];

export default function LearnPage() {
  const [chapter, setChapter] = useState("basics");

  return (
    <main className="container">
      <header className="header">
        <h1>
          <GraduationCap
            size={24}
            strokeWidth={2.2}
            style={{ verticalAlign: "-0.15em", color: "var(--accent)" }}
          />{" "}
          投資講座
        </h1>
        <p className="fullname">AIBA Investment Academy</p>
        <p>投資の基礎からAIBAダッシュボードの使い方まで、初心者向けに解説します。</p>
      </header>

      <NavTabs active="learn" />

      {/* チャプターナビ */}
      <div className="learn-chapter-nav" role="tablist" aria-label="投資講座の章">
        {CHAPTERS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            id={`chapter-tab-${key}`}
            role="tab"
            aria-selected={chapter === key}
            className={`learn-chapter-btn${chapter === key ? " learn-chapter-active" : ""}`}
            onClick={() => setChapter(key)}
          >
            <Icon size={16} className="learn-chapter-ico" />
            {label}
          </button>
        ))}
      </div>

      {/* Chapter 1: 投資の基本 */}
      {chapter === "basics" && (
        <section className="learn-section" aria-labelledby="chapter-tab-basics">
          <div className="learn-intro">
            <h2 className="learn-section-title">Chapter 1：投資の基本用語</h2>
            <p className="learn-section-desc">
              投資を始める前に知っておきたい基本的な概念を解説します。
              各用語をクリックすると詳しい説明と例が表示されます。
            </p>
          </div>

          <div className="learn-terms-list">
            {BASICS.map((term) => (
              <TermCard key={term.id} term={term} />
            ))}
          </div>

          <CompoundCalc />

          <div className="learn-next-hint">
            <p><CheckCircle2 size={15} style={{ verticalAlign: "-0.2em", marginRight: 6, color: "var(--green)" }} />基本を押さえたら、次はテクニカル指標を学びましょう</p>
            <button
              className="learn-next-btn"
              onClick={() => setChapter("technicals")}
              id="next-to-technicals"
            >
              Chapter 2 へ <ArrowRight size={16} />
            </button>
          </div>
        </section>
      )}

      {/* Chapter 2: テクニカル指標 */}
      {chapter === "technicals" && (
        <section className="learn-section" aria-labelledby="chapter-tab-technicals">
          <div className="learn-intro">
            <h2 className="learn-section-title">Chapter 2：テクニカル指標の基礎</h2>
            <p className="learn-section-desc">
              株価チャートに表示される指標の見方を学びましょう。
              AIBAダッシュボードで実際に使われている指標を中心に解説します。
            </p>
          </div>

          <div className="learn-terms-list">
            {TECHNICALS.map((term) => (
              <TermCard key={term.id} term={term} />
            ))}
          </div>

          <div className="learn-guide-cta">
            <BookOpen size={16} />
            <span>各指標の計算式・重みの詳細は</span>
            <Link href="/guide" className="back-link">
              スコア定義ページ
            </Link>
            <span>で確認できます。</span>
          </div>

          <div className="learn-next-hint">
            <p><CheckCircle2 size={15} style={{ verticalAlign: "-0.2em", marginRight: 6, color: "var(--green)" }} />指標を理解したら、AIBAの使い方に進みましょう</p>
            <button
              className="learn-next-btn"
              onClick={() => setChapter("aiba")}
              id="next-to-aiba"
            >
              Chapter 3 へ <ArrowRight size={16} />
            </button>
          </div>
        </section>
      )}

      {/* Chapter 3: AIBAの使い方 */}
      {chapter === "aiba" && (
        <section className="learn-section" aria-labelledby="chapter-tab-aiba">
          <div className="learn-intro">
            <h2 className="learn-section-title">Chapter 3：AIBAダッシュボードの使い方</h2>
            <p className="learn-section-desc">
              AIBAを使って次世代技術テーマの「仕込み好機」を見つける実践的な流れを解説します。
            </p>
          </div>

          {/* コア・サテライト解説 */}
          <div className="learn-strategy-card">
            <h3 className="learn-strategy-title"><Target size={16} style={{ verticalAlign: "-0.15em", marginRight: 7, color: "var(--accent)" }} />基本戦略：コア・サテライト</h3>
            <div className="learn-strategy-grid">
              <div className="learn-strategy-item learn-strategy-core">
                <span className="learn-strategy-label">コア（土台）</span>
                <span className="learn-strategy-pct">70〜80%</span>
                <p>全世界株・S&P500などのインデックス。ほったらかし・長期保有。資産の安定した基盤。</p>
              </div>
              <div className="learn-strategy-sep">+</div>
              <div className="learn-strategy-item learn-strategy-satellite">
                <span className="learn-strategy-label">サテライト（成長枠）</span>
                <span className="learn-strategy-pct">20〜30%</span>
                <p>AIBAで見つけた次世代技術テーマ。少額トッピングで長期成長を取りに行く。</p>
              </div>
            </div>
            <p className="learn-strategy-note">
              ※ AIBAは「入口（押し目）のタイミング」を計るツールです。入口を計ったあとは長期保有が基本。日々のスコア変動に一喜一憂しないことが重要です。
            </p>
          </div>

          {/* 使い方フロー */}
          <h3 className="learn-flow-title"><ListChecks size={16} style={{ verticalAlign: "-0.15em", marginRight: 7, color: "var(--accent)" }} />実践フロー：AIBAの使い方ステップ</h3>
          <div className="learn-flow">
            {FLOW_STEPS.map((step, i) => (
              <div key={i} className="learn-flow-step">
                <div className="learn-flow-icon">
                  <step.icon size={20} />
                </div>
                <div className="learn-flow-content">
                  <h4 className="learn-flow-step-title">{step.title}</h4>
                  <p className="learn-flow-step-desc">{step.desc}</p>
                  {step.link && (
                    <Link href={step.link} className="learn-flow-link">
                      {step.linkText} <ArrowRight size={14} />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* スコアの読み方 */}
          <div className="learn-score-guide">
            <h3 className="learn-score-guide-title"><BarChart3 size={16} style={{ verticalAlign: "-0.15em", marginRight: 7, color: "var(--accent)" }} />AIBAスコアの目安</h3>
            <div className="learn-score-bands">
              {[
                { range: "70〜100", label: "強い買い場", color: "#22c55e", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.3)" },
                { range: "60〜69", label: "買い場候補", color: "#84cc16", bg: "rgba(132,204,22,0.1)", border: "rgba(132,204,22,0.3)" },
                { range: "50〜59", label: "中立・様子見", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)" },
                { range: "40〜49", label: "やや高め", color: "#f97316", bg: "rgba(249,115,22,0.1)", border: "rgba(249,115,22,0.3)" },
                { range: "0〜39", label: "過熱・見送り", color: "#ef4444", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)" },
              ].map(({ range, label, color, bg, border }) => (
                <div key={range} className="learn-score-band" style={{ background: bg, borderColor: border }}>
                  <span className="learn-score-band-range" style={{ color }}>{range}</span>
                  <span className="learn-score-band-label">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* FAQ */}
          <h3 className="learn-faq-title"><HelpCircle size={16} style={{ verticalAlign: "-0.15em", marginRight: 7, color: "var(--accent)" }} />よくある質問</h3>
          <div className="learn-faq-list">
            {FAQS.map((faq, i) => (
              <FaqItem key={i} faq={faq} idx={i} />
            ))}
          </div>

          <div className="learn-guide-cta">
            <BookOpen size={16} />
            <span>各スコアの計算式・技術的詳細は</span>
            <Link href="/guide" className="back-link">スコア定義ページ</Link>
            <span>で確認できます。</span>
          </div>

          <p className="guide-note" style={{ marginTop: 32 }}>
            ※ 本ページは投資助言ではありません。スコアは公開データに基づく定量指標であり、将来の成果を保証しません。投資はご自身の判断と責任で行ってください。
          </p>
        </section>
      )}
    </main>
  );
}
