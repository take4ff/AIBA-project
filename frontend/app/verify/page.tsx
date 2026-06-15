import { getBacktest, getSnapshots, getBenchmark, SnapshotRow } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";
import NavTabs from "@/components/NavTabs";
import SnapshotChart from "@/components/SnapshotChart";
import EquityCurve from "@/components/EquityCurve";

export const revalidate = 0;

const f3 = (n: number | null) => (n == null ? "—" : (n >= 0 ? "+" : "") + n.toFixed(3));
const f2 = (n: number | null) => (n == null ? "—" : (n >= 0 ? "+" : "") + n.toFixed(2) + "%");

// 定点ログの集計：買い判定の平均リターン・勝率を horizon 別に
function aggregate(rows: SnapshotRow[], key: "ret_1m" | "ret_3m" | "ret_6m") {
  const buys = rows.filter((r) => r.is_buy && r[key] != null).map((r) => r[key] as number);
  const all = rows.filter((r) => r[key] != null).map((r) => r[key] as number);
  if (all.length === 0) return null;
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const win = buys.length ? (buys.filter((x) => x > 0).length / buys.length) * 100 : null;
  return {
    buyN: buys.length,
    buyAvg: buys.length ? mean(buys) : null,
    allAvg: mean(all),
    win,
  };
}

export default async function VerifyPage() {
  if (!isSupabaseConfigured) {
    return <main className="container"><div className="notice">Supabase の環境変数が未設定です。</div></main>;
  }
  const [bt, snaps, bench] = await Promise.all([getBacktest(), getSnapshots(), getBenchmark("ACWI")]);
  const edge = bt && bt.buy_avg_return != null && bt.overall_avg_return != null
    ? bt.buy_avg_return - bt.overall_avg_return : null;
  const snapDates = Array.from(new Set(snaps.map((s) => s.snapshot_date))).sort();
  const agg = { ret_1m: aggregate(snaps, "ret_1m"), ret_3m: aggregate(snaps, "ret_3m"), ret_6m: aggregate(snaps, "ret_6m") };
  const hasEval = agg.ret_1m || agg.ret_3m || agg.ret_6m;

  // 記録日ごとに「買い判定 / 全体」の 1/3/6ヶ月先リターン平均（時系列グラフ用）
  const mean = (a: number[]) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 100) / 100 : null);
  const horizonAvg = (rows: SnapshotRow[], k: "ret_1m" | "ret_3m" | "ret_6m", buyOnly: boolean) =>
    mean(rows.filter((s) => (buyOnly ? s.is_buy : true) && s[k] != null).map((s) => s[k] as number));
  const series = snapDates.map((d) => {
    const rows = snaps.filter((s) => s.snapshot_date === d);
    return {
      date: d,
      buy_1m: horizonAvg(rows, "ret_1m", true), buy_3m: horizonAvg(rows, "ret_3m", true), buy_6m: horizonAvg(rows, "ret_6m", true),
      all_1m: horizonAvg(rows, "ret_1m", false), all_3m: horizonAvg(rows, "ret_3m", false), all_6m: horizonAvg(rows, "ret_6m", false),
    };
  });

  // 月次リバランスの疑似エクイティカーブ（100スタート・ret_1mを複利で連結）
  // ベンチマーク（インデックス放置）も同じ「各アンカー→翌アンカー」窓の収益で連結し、比較可能にする。
  const benchClose = (d: string): number | null => {
    let c: number | null = null;
    for (const b of bench) { if (b.trade_date <= d) c = b.close; else break; }
    return c;
  };
  const benchOn = bench.length > 0;
  // 閾値別の買いコホート平均1ヶ月先リターン（該当が無い月は現金＝0%）
  const cohortAvg = (rows: SnapshotRow[], th: number) =>
    mean(rows.filter((s) => (s.aiba_score ?? 0) >= th && s.ret_1m != null).map((s) => s.ret_1m as number));
  const equity: { date: string; buy50: number; buy: number; buy70: number; all: number; idx: number | null }[] = [];
  let eb50 = 100, eb = 100, eb70 = 100, ea = 100, ei = 100;
  for (let i = 0; i < snapDates.length; i++) {
    const d = snapDates[i];
    const rows = snaps.filter((s) => s.snapshot_date === d);
    const ar = horizonAvg(rows, "ret_1m", false);
    if (ar == null) break;               // 直近の未評価日で打ち切り
    eb50 *= 1 + (cohortAvg(rows, 50) ?? 0) / 100;
    eb *= 1 + (cohortAvg(rows, 60) ?? 0) / 100;
    eb70 *= 1 + (cohortAvg(rows, 70) ?? 0) / 100;
    ea *= 1 + ar / 100;
    const dn = snapDates[i + 1];
    const c0 = benchClose(d), c1 = dn ? benchClose(dn) : null;
    if (c0 != null && c1 != null) ei *= c1 / c0;   // 指数を同じ窓で連結
    equity.push({
      date: d, buy50: Math.round(eb50 * 10) / 10, buy: Math.round(eb * 10) / 10, buy70: Math.round(eb70 * 10) / 10,
      all: Math.round(ea * 10) / 10, idx: benchOn ? Math.round(ei * 10) / 10 : null,
    });
  }

  return (
    <main className="container">
      <header className="header">
        <h1>📊 検証 — スコアの実績</h1>
        <p className="fullname">Advanced Investment &amp; Behavior Analytics</p>
        <p>AIBAスコアが将来リターンをどれだけ説明できているかをバックテストで確認。</p>
      </header>
      <NavTabs active="verify" />

      {!bt ? (
        <div className="notice" style={{ marginTop: 20 }}>
          まだバックテスト結果がありません。<code>db/backtest.sql</code> 実行後、
          <code>backend/backtest.py --save</code> を実行してください。
        </div>
      ) : (
        <>
          <section className="layer">
            <h2 className="layer-title">買いシグナルの実績</h2>
            <p className="layer-subtitle">AIBA≥{bt.buy_threshold} で買った場合の {bt.horizon}営業日先リターン（{bt.run_date} 時点・履歴{bt.n_samples}サンプル）</p>
            <div className="stat-grid">
              <div className="stat"><div className="stat-label">買い銘柄の平均先行リターン</div><div className="stat-val pos">{f2(bt.buy_avg_return)}</div></div>
              <div className="stat"><div className="stat-label">全体平均</div><div className="stat-val">{f2(bt.overall_avg_return)}</div></div>
              <div className="stat"><div className="stat-label">優位（差）</div><div className="stat-val pos">{edge == null ? "—" : (edge >= 0 ? "+" : "") + edge.toFixed(2) + "pt"}</div></div>
              <div className="stat"><div className="stat-label">対象件数</div><div className="stat-val">{bt.buy_count}</div></div>
            </div>
          </section>

          <section className="layer">
            <h2 className="layer-title">IC（先行性）</h2>
            <p className="layer-subtitle">スコアと {bt.horizon}営業日先リターンの順位相関。0より大きいほど先行性あり。</p>
            <div className="stat-grid">
              <div className="stat"><div className="stat-label">AIBA</div><div className="stat-val">{f3(bt.ic_aiba)}</div></div>
              <div className="stat"><div className="stat-label">テクニカル</div><div className="stat-val">{f3(bt.ic_technical)}</div></div>
              <div className="stat"><div className="stat-label">センチメント</div><div className="stat-val">{f3(bt.ic_sentiment)}</div></div>
            </div>
          </section>

          <section className="layer">
            <h2 className="layer-title">層別 最適重み（参考）</h2>
            <p className="layer-subtitle">IC最大化で探索したテクニカル重み（現行 L1 0.7 / L2 0.5 / L3 0.3）。</p>
            <div className="stat-grid">
              <div className="stat"><div className="stat-label">第1層</div><div className="stat-val">{bt.best_w_l1 ?? "—"}</div></div>
              <div className="stat"><div className="stat-label">第2層</div><div className="stat-val">{bt.best_w_l2 ?? "—"}</div></div>
              <div className="stat"><div className="stat-label">第3層</div><div className="stat-val">{bt.best_w_l3 ?? "—"}</div></div>
            </div>
          </section>

          <p className="guide-note" style={{ marginTop: 16 }}>
            ※ これは過去データ全体での集計（in-sample）で、履歴が浅い間は参考値です。先読みなしの厳密な検証は
            「定点記録」（各時点のスコアを保存し1/3/6ヶ月後に答え合わせ）で今後拡充します。
          </p>
        </>
      )}

      <section className="layer" style={{ marginTop: 40 }}>
        <h2 className="layer-title">定点記録（先読みなし検証）</h2>
        <p className="layer-subtitle">
          毎月スコアのスナップショットを保存し、1/3/6ヶ月後の実リターンで「買い判定(AIBA≥60)」の当否を検証。
          {snapDates.length > 0 && <>（記録 {snapDates.length} 回・最古 {snapDates[0]} 〜 最新 {snapDates.at(-1)}）</>}
        </p>
        {!hasEval ? (
          <div className="notice" style={{ marginTop: 0 }}>
            {snapDates.length === 0
              ? "まだスナップショットがありません（日次バッチで月初に記録されます）。"
              : "蓄積中：評価は記録から1ヶ月以上経過後に表示されます。"}
          </div>
        ) : (
          <>
          <SnapshotChart data={series} />
          <div className="table-scroll">
            <table className="table">
              <colgroup><col style={{ width: "22%" }} /><col style={{ width: "22%" }} /><col style={{ width: "22%" }} /><col style={{ width: "16%" }} /><col style={{ width: "18%" }} /></colgroup>
              <thead><tr>
                <th>期間</th><th className="num">買い銘柄 平均</th><th className="num">全体 平均</th><th className="num">買い勝率</th><th className="num">評価件数</th>
              </tr></thead>
              <tbody>
                {([["1ヶ月", "ret_1m"], ["3ヶ月", "ret_3m"], ["6ヶ月", "ret_6m"]] as const).map(([label, k]) => {
                  const a = agg[k];
                  return (
                    <tr key={k}>
                      <td>{label}</td>
                      <td className="num" style={{ color: a && a.buyAvg != null && a.buyAvg >= 0 ? "#34d399" : undefined }}>{a ? f2(a.buyAvg) : "—"}</td>
                      <td className="num">{a ? f2(a.allAvg) : "—"}</td>
                      <td className="num">{a && a.win != null ? a.win.toFixed(0) + "%" : "—"}</td>
                      <td className="num">{a ? a.buyN : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {equity.length >= 2 && (
            <>
              <h3 className="layer-title" style={{ fontSize: 16, marginTop: 28 }}>疑似エクイティカーブ（月次リバランス）</h3>
              <EquityCurve data={equity} />
            </>
          )}
          </>
        )}
      </section>
    </main>
  );
}
