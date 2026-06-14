import { getBacktest } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";
import NavTabs from "@/components/NavTabs";

export const revalidate = 0;

const f3 = (n: number | null) => (n == null ? "—" : (n >= 0 ? "+" : "") + n.toFixed(3));
const f2 = (n: number | null) => (n == null ? "—" : (n >= 0 ? "+" : "") + n.toFixed(2) + "%");

export default async function VerifyPage() {
  if (!isSupabaseConfigured) {
    return <main className="container"><div className="notice">Supabase の環境変数が未設定です。</div></main>;
  }
  const bt = await getBacktest();
  const edge = bt && bt.buy_avg_return != null && bt.overall_avg_return != null
    ? bt.buy_avg_return - bt.overall_avg_return : null;

  return (
    <main className="container">
      <header className="header">
        <h1>📊 検証 — スコアの実績</h1>
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
    </main>
  );
}
