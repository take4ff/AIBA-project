"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { scoreColor } from "@/lib/score-color";
import { RankingRow } from "@/lib/types";
import {
  getAccount, createAccount, getPositions, getOrders, getRoundMetrics, executeTrade, advanceRound, resetGame,
  SimAccount, SimPosition, SimOrder, RoundMetric,
} from "@/lib/simulator";

const INITIAL = 1_000_000;
const yen = (n: number) => "¥" + Math.round(n).toLocaleString("ja-JP");
const pct = (n: number | null | undefined) =>
  n == null ? "—" : (n >= 0 ? "+" : "") + n.toFixed(2) + "%";

type Tab = "play" | "portfolio" | "history";
const TABS: { key: Tab; label: string }[] = [
  { key: "play", label: "銘柄選択" },
  { key: "portfolio", label: "ポートフォリオ" },
  { key: "history", label: "取引履歴" },
];

interface OrderForm {
  domain_id: string;
  side: "buy" | "sell";
  shares: string;
}

interface RoundResult {
  domain_id: string;
  curPrice: number | null;
  nextPrice: number | null;
  weekReturn: number | null;
  shares: number;
  avgCost: number;
}

export default function SimulatorView({
  universe,
  usdjpy,
  roundDates,
}: {
  universe: RankingRow[];
  usdjpy: number;
  roundDates: string[];
}) {
  const { user, ready } = useAuth();

  // ── 基本状態 ──────────────────────────────────────────────
  const [account, setAccount] = useState<SimAccount | null>(null);
  const [positions, setPositions] = useState<SimPosition[]>([]);
  const [orders, setOrders] = useState<SimOrder[]>([]);
  const [roundData, setRoundData] = useState<RoundMetric[]>([]);

  const [loading, setLoading] = useState(true);
  const [roundLoading, setRoundLoading] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("play");
  const [filter, setFilter] = useState("");
  const [orderForm, setOrderForm] = useState<OrderForm | null>(null);
  const [orderMsg, setOrderMsg] = useState<string | null>(null);

  // ── ラウンド進行状態 ───────────────────────────────────────
  const [advancing, setAdvancing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [roundResults, setRoundResults] = useState<RoundResult[] | null>(null);
  const [pendingNextDate, setPendingNextDate] = useState<string | null>(null);
  const [nextRoundData, setNextRoundData] = useState<RoundMetric[]>([]);

  // ── ユニバースマップ ─────────────────────────────────────
  const uniMap = useMemo(
    () => new Map(universe.map((r) => [r.domain_id, r])),
    [universe],
  );

  // 円建て現在価格（ラウンドメトリクス or ユニバースから）
  const priceJpy = useCallback(
    (metric: RoundMetric): number | null => {
      if (metric.close_price == null) return null;
      const uni = uniMap.get(metric.domain_id);
      const isJp = uni?.region === "jp";
      return isJp ? metric.close_price : metric.close_price * usdjpy;
    },
    [uniMap, usdjpy],
  );

  // ── ラウンド日付計算 ─────────────────────────────────────
  const currentDate = account?.current_snapshot_date ?? null;
  const roundIndex = currentDate ? roundDates.indexOf(currentDate) : -1;
  const isLastRound = roundIndex >= roundDates.length - 1;
  const nextDate = !isLastRound && roundIndex >= 0 ? roundDates[roundIndex + 1] : null;

  // ── ラウンドデータ付き銘柄一覧（ALL Hooks before early returns）──
  const roundMetricMap = useMemo(
    () => new Map(roundData.map((r) => [r.domain_id, r])),
    [roundData],
  );

  const filteredRoundRows = useMemo(() => {
    const q = filter.toLowerCase();
    return roundData
      .map((r) => ({ ...r, uni: uniMap.get(r.domain_id) }))
      .filter(
        (r) =>
          r.uni &&
          (!q ||
            r.uni.domain_name.toLowerCase().includes(q) ||
            r.uni.ticker.toLowerCase().includes(q)),
      )
      .sort((a, b) => (b.aiba_score ?? 0) - (a.aiba_score ?? 0));
  }, [roundData, uniMap, filter]);

  // ── ポートフォリオ評価額（ラウンド終値ベース）────────────
  const posValue = useMemo(
    () =>
      positions.reduce((sum, pos) => {
        const m = roundMetricMap.get(pos.domain_id);
        const p = m ? priceJpy(m) : null;
        return sum + (p != null ? pos.shares * p : pos.shares * pos.avg_cost);
      }, 0),
    [positions, roundMetricMap, priceJpy],
  );

  // 注文フォームのコスト概算
  const formCostEst = useMemo(() => {
    if (!orderForm) return null;
    const shares = parseInt(orderForm.shares, 10);
    if (!shares || shares < 1) return null;
    const m = roundMetricMap.get(orderForm.domain_id);
    if (!m) return null;
    const p = priceJpy(m);
    return p ? shares * p : null;
  }, [orderForm, roundMetricMap, priceJpy]);

  const totalValue = account ? account.cash + posValue : 0;
  const returnPct = ((totalValue / INITIAL) - 1) * 100;

  // ── データ取得 ────────────────────────────────────────────
  const loadRoundData = useCallback(async (date: string) => {
    setRoundLoading(true);
    const data = await getRoundMetrics(date);
    setRoundData(data);
    setRoundLoading(false);
  }, []);

  const reload = useCallback(async () => {
    const [acc, pos, ord] = await Promise.all([
      getAccount(), getPositions(), getOrders(),
    ]);
    setAccount(acc);
    setPositions(pos);
    setOrders(ord);
    setLoading(false);
    if (acc?.current_snapshot_date) {
      await loadRoundData(acc.current_snapshot_date);
    }
  }, [loadRoundData]);

  useEffect(() => {
    if (ready && user) reload();
    else if (ready) setLoading(false);
  }, [ready, user, reload]);

  // ── アクション ────────────────────────────────────────────
  async function handleCreateAccount() {
    if (!displayName.trim()) return;
    setCreateErr(null);
    const err = await createAccount(displayName);
    if (err) { setCreateErr(err); return; }
    await reload();
  }

  async function handleStartGame() {
    if (!roundDates[0] || !account) return;
    const err = await advanceRound(roundDates[0]);
    if (err) return;
    setAccount({ ...account, current_snapshot_date: roundDates[0] });
    await loadRoundData(roundDates[0]);
  }

  async function handlePlaceOrder() {
    if (!orderForm || !account) return;
    const shares = parseInt(orderForm.shares, 10);
    if (!shares || shares < 1) {
      setOrderMsg("株数は1以上の整数を入力してください");
      return;
    }
    if (!currentDate) {
      setOrderMsg("ゲームを開始してください");
      return;
    }
    const m = roundMetricMap.get(orderForm.domain_id);
    const p = m ? priceJpy(m) : null;
    if (!p) {
      setOrderMsg("このラウンドの価格データがありません");
      return;
    }
    setOrderMsg(null);
    const err = await executeTrade({
      domain_id: orderForm.domain_id,
      side: orderForm.side,
      shares,
      fill_price: p,
      snapshot_date: currentDate,
      aiba_at_order: m?.aiba_score ?? null,
      account,
      positions,
    });
    if (err) { setOrderMsg(err); return; }
    // ローカル状態を楽観更新せず、リロード
    const [acc, pos, ord] = await Promise.all([getAccount(), getPositions(), getOrders()]);
    setAccount(acc);
    setPositions(pos);
    setOrders(ord);
    setOrderForm(null);
  }

  async function handlePrepareAdvance() {
    if (!nextDate || !currentDate) return;
    setAdvancing(true);
    const nextMetrics = await getRoundMetrics(nextDate);
    setNextRoundData(nextMetrics);
    const nextMap = new Map(nextMetrics.map((r) => [r.domain_id, r]));
    const results: RoundResult[] = positions.map((pos) => {
      const curM = roundMetricMap.get(pos.domain_id);
      const nxtM = nextMap.get(pos.domain_id);
      const curPrice = curM ? priceJpy(curM) : null;
      const nextPrice = nxtM ? priceJpy(nxtM) : null;
      const weekReturn =
        curPrice && nextPrice ? ((nextPrice / curPrice) - 1) * 100 : null;
      return { domain_id: pos.domain_id, curPrice, nextPrice, weekReturn, shares: pos.shares, avgCost: pos.avg_cost };
    });
    setRoundResults(results);
    setPendingNextDate(nextDate);
    setAdvancing(false);
  }

  async function handleReset() {
    setResetting(true);
    const err = await resetGame();
    if (err) { setResetting(false); return; }
    const [acc, pos, ord] = await Promise.all([getAccount(), getPositions(), getOrders()]);
    setAccount(acc);
    setPositions(pos);
    setOrders(ord);
    setRoundData([]);
    setRoundResults(null);
    setPendingNextDate(null);
    setConfirmReset(false);
    setResetting(false);
  }

  async function handleConfirmAdvance() {
    if (!pendingNextDate || !account) return;
    const err = await advanceRound(pendingNextDate);
    if (err) return;
    const newAcc = { ...account, current_snapshot_date: pendingNextDate };
    setAccount(newAcc);
    setRoundData(nextRoundData);
    setRoundResults(null);
    setPendingNextDate(null);
    setNextRoundData([]);
    // orders も最新化
    const ord = await getOrders();
    setOrders(ord);
  }

  const domainName = (id: string) => uniMap.get(id)?.domain_name ?? id;
  const domainTicker = (id: string) => uniMap.get(id)?.ticker ?? "";

  // ── 早期リターン（Hooks は全て上で宣言済み）────────────
  if (!ready || (ready && user && loading)) {
    return <div className="notice">読み込み中…</div>;
  }
  if (!user) {
    return (
      <div className="notice">
        シミュレーターをプレイするには{" "}
        <Link href="/login" className="back-link">ログイン</Link> が必要です。
      </div>
    );
  }
  if (!account) {
    return (
      <div style={{ maxWidth: 440 }}>
        <h2 className="layer-title">口座を開設する</h2>
        <p className="layer-subtitle">
          表示名を入力してゲームを開始してください（後から変更不可）。
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            className="login-input"
            type="text"
            placeholder="表示名（例: 投資家太郎）"
            maxLength={20}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateAccount()}
            style={{ flex: 1 }}
          />
          <button className="login-submit" type="button" onClick={handleCreateAccount}>
            開設（¥1,000,000）
          </button>
        </div>
        {createErr && (
          <p style={{ color: "#dc2626", marginTop: 8, fontSize: 13 }}>{createErr}</p>
        )}
      </div>
    );
  }

  // ── ゲーム未開始 ──────────────────────────────────────────
  if (!currentDate) {
    return (
      <div style={{ maxWidth: 480 }}>
        <h2 className="layer-title">ゲームを開始する</h2>
        <p className="layer-subtitle">
          2022年1月のデータからスタートします。全{roundDates.length}ラウンド（1ラウンド≈1週間）。
          AIBAスコアを参考に売買判断を行い、現在（{roundDates[roundDates.length - 1]}）まで進めましょう。
        </p>
        <p className="layer-subtitle" style={{ marginTop: 8 }}>
          初期資金: <strong>{yen(account.cash)}</strong>
        </p>
        <button
          className="login-submit"
          type="button"
          style={{ marginTop: 16 }}
          onClick={handleStartGame}
        >
          第1ラウンドへ（{roundDates[0]}）→
        </button>
      </div>
    );
  }

  // ── メインUI ─────────────────────────────────────────────

  // 結果リビール オーバーレイ
  if (roundResults) {
    const portfolioWeekReturn = (() => {
      const curTotal = positions.reduce((s, pos) => {
        const m = roundMetricMap.get(pos.domain_id);
        return s + (m ? (priceJpy(m) ?? pos.avg_cost) * pos.shares : pos.shares * pos.avg_cost);
      }, account.cash);
      const nextMap = new Map(nextRoundData.map((r) => [r.domain_id, r]));
      const nxtTotal = positions.reduce((s, pos) => {
        const m = nextMap.get(pos.domain_id);
        return s + (m ? (priceJpy(m) ?? pos.avg_cost) * pos.shares : pos.shares * pos.avg_cost);
      }, account.cash);
      return curTotal > 0 ? ((nxtTotal / curTotal) - 1) * 100 : null;
    })();

    return (
      <div>
        <div className="layer" style={{ border: "2px solid #3b82f6", marginBottom: 16 }}>
          <h2 className="layer-title" style={{ color: "#3b82f6" }}>
            今週（{currentDate}）の結果
          </h2>

          {roundResults.length === 0 ? (
            <p className="layer-subtitle">今週は保有銘柄がありませんでした。</p>
          ) : (
            <>
              <p className="layer-subtitle" style={{ marginBottom: 8 }}>
                ポートフォリオ週間リターン:{" "}
                <strong style={{ color: portfolioWeekReturn == null ? undefined : portfolioWeekReturn >= 0 ? "#15a34a" : "#dc2626" }}>
                  {pct(portfolioWeekReturn)}
                </strong>
              </p>
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>銘柄</th>
                      <th className="num">保有株数</th>
                      <th className="num">週初価格</th>
                      <th className="num">週末価格</th>
                      <th className="num">週間リターン</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roundResults.map((r) => (
                      <tr key={r.domain_id}>
                        <td>
                          <span style={{ color: "#fff" }}>
                            {domainName(r.domain_id)}
                            <span className="ticker" style={{ marginLeft: 6 }}>{domainTicker(r.domain_id)}</span>
                          </span>
                        </td>
                        <td className="num">{r.shares.toFixed(0)}</td>
                        <td className="num">{r.curPrice != null ? yen(r.curPrice) : "—"}</td>
                        <td className="num">{r.nextPrice != null ? yen(r.nextPrice) : "—"}</td>
                        <td
                          className="num"
                          style={{
                            fontWeight: 700,
                            color:
                              r.weekReturn == null
                                ? undefined
                                : r.weekReturn >= 0
                                ? "#15a34a"
                                : "#dc2626",
                          }}
                        >
                          {pct(r.weekReturn)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              className="login-submit"
              type="button"
              onClick={handleConfirmAdvance}
            >
              次の週へ進む（{pendingNextDate}）→
            </button>
            <button
              className="kind-btn"
              type="button"
              onClick={() => { setRoundResults(null); setPendingNextDate(null); }}
            >
              閉じる（取引を続ける）
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── ラウンド進行バー ─────────────────────────────────────
  const progressPct = roundDates.length > 0
    ? Math.round(((roundIndex + 1) / roundDates.length) * 100)
    : 0;

  return (
    <div>
      {/* ラウンド進捗 */}
      <div className="layer" style={{ marginBottom: 16, padding: "12px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>
            ラウンド {roundIndex + 1} / {roundDates.length}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{currentDate}</span>
            {!confirmReset ? (
              <button
                type="button"
                className="kind-btn"
                style={{ fontSize: 11, padding: "2px 8px", color: "#dc2626", borderColor: "#dc2626" }}
                onClick={() => setConfirmReset(true)}
              >
                途中終了
              </button>
            ) : (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: "#dc2626" }}>リセットしますか？</span>
                <button
                  type="button"
                  className="kind-btn"
                  style={{ fontSize: 11, padding: "2px 8px", background: "#dc2626", color: "#fff", borderColor: "#dc2626" }}
                  disabled={resetting}
                  onClick={handleReset}
                >
                  {resetting ? "…" : "はい"}
                </button>
                <button
                  type="button"
                  className="kind-btn"
                  style={{ fontSize: 11, padding: "2px 8px" }}
                  onClick={() => setConfirmReset(false)}
                >
                  いいえ
                </button>
              </span>
            )}
          </div>
        </div>
        <div style={{ background: "var(--bg-soft)", borderRadius: 6, height: 8, overflow: "hidden" }}>
          <div
            style={{
              background: isLastRound ? "#f59e0b" : "#3b82f6",
              width: `${progressPct}%`,
              height: "100%",
              transition: "width 0.4s",
            }}
          />
        </div>
        {isLastRound && (
          <p style={{ marginTop: 6, fontSize: 12, color: "#f59e0b", fontWeight: 700 }}>
            🎉 最終ラウンド到達！ゲームクリア
          </p>
        )}
      </div>

      {/* 口座サマリ */}
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat">
          <div className="stat-label">現金残高</div>
          <div className="stat-val">{yen(account.cash)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">ポジション時価</div>
          <div className="stat-val">{yen(posValue)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">総資産</div>
          <div className="stat-val">{yen(totalValue)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">通算リターン</div>
          <div
            className="stat-val"
            style={{ color: returnPct < 0 ? "#dc2626" : returnPct > 0 ? "#15a34a" : undefined, fontWeight: 700 }}
          >
            {pct(returnPct)}
          </div>
        </div>
      </div>

      {/* タブ + 次のラウンドへボタン（同一行） */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 16 }}>
        <div className="kind-toggle" style={{ marginBottom: 0 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`kind-btn${tab === t.key ? " kind-active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {!isLastRound && (
          <button
            className="login-submit"
            type="button"
            disabled={advancing}
            onClick={handlePrepareAdvance}
            style={{ whiteSpace: "nowrap", flexShrink: 0 }}
          >
            {advancing ? "読み込み中…" : `次のラウンドへ（${nextDate}）→`}
          </button>
        )}
      </div>

      {/* ========== 銘柄選択タブ ========== */}
      {tab === "play" && (
        <>
          {/* 注文フォーム */}
          {orderForm && (
            <section
              className="layer"
              style={{
                marginBottom: 16,
                border: `2px solid ${orderForm.side === "buy" ? "#15a34a" : "#dc2626"}`,
              }}
            >
              <h2
                className="layer-title"
                style={{ color: orderForm.side === "buy" ? "#15a34a" : "#dc2626" }}
              >
                {orderForm.side === "buy" ? "買い" : "売り"}注文：{domainName(orderForm.domain_id)}
                <span className="ticker" style={{ marginLeft: 8 }}>{domainTicker(orderForm.domain_id)}</span>
              </h2>
              {(() => {
                const m = roundMetricMap.get(orderForm.domain_id);
                const p = m ? priceJpy(m) : null;
                const pos = positions.find((x) => x.domain_id === orderForm.domain_id);
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8, maxWidth: 400 }}>
                    {p != null && (
                      <p className="layer-subtitle" style={{ margin: 0 }}>
                        このラウンドの終値: {yen(p)} / 残高: {yen(account.cash)}
                      </p>
                    )}
                    {pos && (
                      <p className="layer-subtitle" style={{ margin: 0 }}>
                        保有: {pos.shares.toFixed(0)}株（平均 {yen(pos.avg_cost)}）
                      </p>
                    )}
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        className="login-input"
                        type="number"
                        min={1}
                        step={1}
                        placeholder="株数"
                        value={orderForm.shares}
                        onChange={(e) => setOrderForm({ ...orderForm, shares: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && handlePlaceOrder()}
                        style={{ width: 100 }}
                        autoFocus
                      />
                      <span style={{ fontSize: 13, color: "var(--muted)" }}>
                        {formCostEst != null ? `≈ ${yen(formCostEst)}` : ""}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        className="login-submit"
                        style={{ background: orderForm.side === "buy" ? "#15a34a" : "#dc2626" }}
                        onClick={handlePlaceOrder}
                      >
                        即時約定
                      </button>
                      <button
                        type="button"
                        className="kind-btn"
                        onClick={() => { setOrderForm(null); setOrderMsg(null); }}
                      >
                        キャンセル
                      </button>
                    </div>
                    {orderMsg && (
                      <p style={{ color: "#dc2626", fontSize: 13 }}>{orderMsg}</p>
                    )}
                  </div>
                );
              })()}
            </section>
          )}

          {/* 銘柄一覧（ラウンドのAIBAスコア） */}
          <section className="layer">
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <h2 className="layer-title" style={{ margin: 0 }}>
                {currentDate} の銘柄一覧（{filteredRoundRows.length}）
                {roundLoading && <span style={{ marginLeft: 8, fontSize: 12, color: "var(--muted)" }}>読込中…</span>}
              </h2>
              <input
                className="login-input"
                type="text"
                placeholder="銘柄名・ティッカー検索"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{ flex: 1, maxWidth: 240, padding: "4px 8px" }}
              />
            </div>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>銘柄</th>
                    <th className="num">AIBA</th>
                    <th className="num">終値（円）</th>
                    <th className="num">保有</th>
                    <th className="num">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoundRows.map(({ domain_id, aiba_score, close_price, uni }) => {
                    if (!uni) return null;
                    const m: RoundMetric = { domain_id, aiba_score, close_price, technical_score: null, sentiment_score: null };
                    const p = priceJpy(m);
                    const pos = positions.find((x) => x.domain_id === domain_id);
                    return (
                      <tr key={domain_id}>
                        <td>
                          <Link href={`/domain/${domain_id}`} style={{ color: "#fff" }}>
                            {uni.domain_name}
                            <span className="ticker" style={{ marginLeft: 6 }}>{uni.ticker}</span>
                          </Link>
                        </td>
                        <td className="num">
                          <span style={{ color: scoreColor(aiba_score), fontWeight: 700 }}>
                            {aiba_score?.toFixed(0) ?? "—"}
                            {(aiba_score ?? 0) >= 60 && (
                              <span style={{ marginLeft: 4, fontSize: 10, color: "#15a34a" }}>●</span>
                            )}
                          </span>
                        </td>
                        <td className="num">{p != null ? yen(p) : "—"}</td>
                        <td className="num" style={{ color: "var(--muted)" }}>
                          {pos ? `${pos.shares.toFixed(0)}株` : "—"}
                        </td>
                        <td className="num">
                          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              className="kind-btn"
                              style={{ fontSize: 12, padding: "2px 8px", color: "#15a34a", borderColor: "#15a34a" }}
                              onClick={() => {
                                setOrderForm({ domain_id, side: "buy", shares: "" });
                                setOrderMsg(null);
                              }}
                            >
                              買う
                            </button>
                            {pos && (
                              <button
                                type="button"
                                className="kind-btn"
                                style={{ fontSize: 12, padding: "2px 8px", color: "#dc2626", borderColor: "#dc2626" }}
                                onClick={() => {
                                  setOrderForm({ domain_id, side: "sell", shares: "" });
                                  setOrderMsg(null);
                                }}
                              >
                                売る
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="guide-note" style={{ marginTop: 8 }}>
              ● = AIBAスコアが買いシグナル（is_buy=true）。終値・スコアは {currentDate} 時点の値。
            </p>
          </section>
        </>
      )}

      {/* ========== ポートフォリオタブ ========== */}
      {tab === "portfolio" && (
        <section className="layer">
          <h2 className="layer-title">保有ポジション（{positions.length}件）</h2>
          {positions.length === 0 ? (
            <p className="layer-subtitle">
              保有銘柄はありません。「銘柄選択」タブから購入してください。
            </p>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>銘柄</th>
                    <th className="num">AIBA</th>
                    <th className="num">株数</th>
                    <th className="num">取得単価（円）</th>
                    <th className="num">{currentDate} 値（円）</th>
                    <th className="num">含み損益</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos) => {
                    const m = roundMetricMap.get(pos.domain_id);
                    const curPrice = m ? priceJpy(m) : null;
                    const plPct =
                      curPrice != null ? ((curPrice / pos.avg_cost) - 1) * 100 : null;
                    const aiba = m?.aiba_score ?? null;
                    return (
                      <tr key={pos.domain_id}>
                        <td>
                          <Link href={`/domain/${pos.domain_id}`} style={{ color: "#fff" }}>
                            {domainName(pos.domain_id)}
                            <span className="ticker" style={{ marginLeft: 6 }}>
                              {domainTicker(pos.domain_id)}
                            </span>
                          </Link>
                        </td>
                        <td className="num">
                          <span style={{ color: scoreColor(aiba), fontWeight: 700 }}>
                            {aiba?.toFixed(0) ?? "—"}
                          </span>
                        </td>
                        <td className="num">{pos.shares.toFixed(0)}</td>
                        <td className="num">{yen(pos.avg_cost)}</td>
                        <td className="num">{curPrice != null ? yen(curPrice) : "—"}</td>
                        <td
                          className="num"
                          style={{
                            fontWeight: 700,
                            color:
                              plPct == null
                                ? undefined
                                : plPct >= 0
                                ? "#15a34a"
                                : "#dc2626",
                          }}
                        >
                          {pct(plPct)}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="kind-btn"
                            style={{ fontSize: 12, padding: "2px 8px", color: "#dc2626", borderColor: "#dc2626" }}
                            onClick={() => {
                              setOrderForm({ domain_id: pos.domain_id, side: "sell", shares: "" });
                              setTab("play");
                            }}
                          >
                            売る
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ========== 取引履歴タブ ========== */}
      {tab === "history" && (
        <section className="layer">
          <h2 className="layer-title">取引履歴（{orders.length}件）</h2>
          {orders.length === 0 ? (
            <p className="layer-subtitle">まだ取引がありません。</p>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>約定ラウンド</th>
                    <th>銘柄</th>
                    <th className="num">売/買</th>
                    <th className="num">株数</th>
                    <th className="num">約定価格（円）</th>
                    <th className="num">発注時AIBA</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{o.snapshot_date}</td>
                      <td>
                        <Link href={`/domain/${o.domain_id}`} style={{ color: "#fff" }}>
                          {domainName(o.domain_id)}
                          <span className="ticker" style={{ marginLeft: 6 }}>
                            {domainTicker(o.domain_id)}
                          </span>
                        </Link>
                      </td>
                      <td className="num">
                        <span
                          style={{
                            color: o.side === "buy" ? "#15a34a" : "#dc2626",
                            fontWeight: 700,
                          }}
                        >
                          {o.side === "buy" ? "買" : "売"}
                        </span>
                      </td>
                      <td className="num">{o.shares.toFixed(0)}</td>
                      <td className="num">{yen(o.fill_price)}</td>
                      <td className="num">
                        {o.aiba_at_order != null ? (
                          <span style={{ color: scoreColor(o.aiba_at_order), fontWeight: 700 }}>
                            {o.aiba_at_order.toFixed(0)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

    </div>
  );
}
