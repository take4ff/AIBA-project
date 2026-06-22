"use client";

import { supabaseBrowser } from "@/lib/supabase-browser";

// ============================================================
// 型定義
// ============================================================

export interface SimAccount {
  user_id: string;
  display_name: string;
  cash: number;
  current_snapshot_date: string | null; // 現在のゲームラウンド（NULL=未開始）
  created_at: string;
}

export interface SimPosition {
  user_id: string;
  domain_id: string;
  shares: number;
  avg_cost: number;     // 平均取得単価（円換算）
  updated_at: string;
}

export interface SimOrder {
  id: number;
  user_id: string;
  domain_id: string;
  side: "buy" | "sell";
  shares: number;
  fill_price: number;   // 約定単価（円換算）
  snapshot_date: string;
  aiba_at_order: number | null;
  placed_at: string;
}

/** daily_metrics から取得する1ラウンド分の銘柄データ */
export interface RoundMetric {
  domain_id: string;
  aiba_score: number | null;
  close_price: number | null;
  technical_score: number | null;
  sentiment_score: number | null;
}

// ============================================================
// 口座
// ============================================================

export async function getAccount(): Promise<SimAccount | null> {
  const { data } = await supabaseBrowser
    .from("sim_accounts")
    .select("user_id,display_name,cash,current_snapshot_date,created_at")
    .maybeSingle();
  return data as SimAccount | null;
}

export async function createAccount(displayName: string): Promise<string | null> {
  const { data: u } = await supabaseBrowser.auth.getUser();
  if (!u.user) return "ログインが必要です";
  const { error } = await supabaseBrowser.from("sim_accounts").upsert(
    { user_id: u.user.id, display_name: displayName.trim(), cash: 1000000 },
    { onConflict: "user_id", ignoreDuplicates: true },
  );
  return error?.message ?? null;
}

// ============================================================
// ポジション
// ============================================================

export async function getPositions(): Promise<SimPosition[]> {
  const { data } = await supabaseBrowser
    .from("sim_positions")
    .select("user_id,domain_id,shares,avg_cost,updated_at");
  return (data ?? []) as SimPosition[];
}

// ============================================================
// 取引履歴
// ============================================================

export async function getOrders(): Promise<SimOrder[]> {
  const { data } = await supabaseBrowser
    .from("sim_orders")
    .select("id,user_id,domain_id,side,shares,fill_price,snapshot_date,aiba_at_order,placed_at")
    .order("placed_at", { ascending: false })
    .limit(500);
  return (data ?? []) as SimOrder[];
}

// ============================================================
// 歴史リプレイ用ゲーム関数
// ============================================================

/** 指定日の全銘柄データを daily_metrics から取得（現在のゲームラウンド表示用）。 */
export async function getRoundMetrics(date: string): Promise<RoundMetric[]> {
  const { data } = await supabaseBrowser
    .from("daily_metrics")
    .select("domain_id,aiba_score,close_price,technical_score,sentiment_score")
    .eq("trade_date", date);
  return (data ?? []) as RoundMetric[];
}

/**
 * 即時約定：当ラウンドの終値で買い/売りを実行し、sim_positions・sim_accounts.cash・sim_orders を更新する。
 * 失敗時はエラーメッセージ文字列を返す。成功時は null。
 */
export async function executeTrade(params: {
  domain_id: string;
  side: "buy" | "sell";
  shares: number;
  fill_price: number;    // 円換算済み終値
  snapshot_date: string;
  aiba_at_order: number | null;
  account: SimAccount;
  positions: SimPosition[];
}): Promise<string | null> {
  const { data: u } = await supabaseBrowser.auth.getUser();
  if (!u.user) return "ログインが必要です";
  const uid = u.user.id;
  const { domain_id, side, shares, fill_price, snapshot_date, aiba_at_order, account, positions } = params;

  if (side === "buy") {
    const cost = shares * fill_price;
    if (account.cash < cost) {
      return `資金不足（必要: ¥${Math.round(cost).toLocaleString()} / 残高: ¥${Math.round(account.cash).toLocaleString()}）`;
    }

    const pos = positions.find((p) => p.domain_id === domain_id);
    const newShares = (pos?.shares ?? 0) + shares;
    const newAvgCost = pos
      ? (pos.shares * pos.avg_cost + shares * fill_price) / newShares
      : fill_price;

    const { error: posErr } = await supabaseBrowser.from("sim_positions").upsert(
      { user_id: uid, domain_id, shares: newShares, avg_cost: newAvgCost, updated_at: new Date().toISOString() },
      { onConflict: "user_id,domain_id" },
    );
    if (posErr) return posErr.message;

    const { error: cashErr } = await supabaseBrowser
      .from("sim_accounts")
      .update({ cash: account.cash - cost })
      .eq("user_id", uid);
    if (cashErr) return cashErr.message;

  } else {
    const pos = positions.find((p) => p.domain_id === domain_id);
    if (!pos || pos.shares < shares - 0.0001) {
      return `保有数不足（保有: ${pos?.shares?.toFixed(0) ?? 0}株 / 売却希望: ${shares}株）`;
    }
    const proceeds = shares * fill_price;
    const newShares = pos.shares - shares;

    if (newShares < 0.0001) {
      const { error } = await supabaseBrowser
        .from("sim_positions")
        .delete()
        .eq("user_id", uid)
        .eq("domain_id", domain_id);
      if (error) return error.message;
    } else {
      const { error } = await supabaseBrowser
        .from("sim_positions")
        .update({ shares: newShares, updated_at: new Date().toISOString() })
        .eq("user_id", uid)
        .eq("domain_id", domain_id);
      if (error) return error.message;
    }

    const { error: cashErr } = await supabaseBrowser
      .from("sim_accounts")
      .update({ cash: account.cash + proceeds })
      .eq("user_id", uid);
    if (cashErr) return cashErr.message;
  }

  // 取引履歴を記録
  const { error: ordErr } = await supabaseBrowser.from("sim_orders").insert({
    user_id: uid,
    domain_id,
    side,
    shares,
    fill_price,
    snapshot_date,
    aiba_at_order,
  });
  if (ordErr) return ordErr.message;

  return null;
}

/**
 * ゲームをリセット：ポジション全削除・現金を100万円に戻す・ラウンドを未開始に戻す。
 * 取引履歴（sim_orders）は学習記録として残す。
 */
export async function resetGame(): Promise<string | null> {
  const { data: u } = await supabaseBrowser.auth.getUser();
  if (!u.user) return "ログインが必要です";
  const uid = u.user.id;

  const { error: posErr } = await supabaseBrowser
    .from("sim_positions")
    .delete()
    .eq("user_id", uid);
  if (posErr) return posErr.message;

  const { error: accErr } = await supabaseBrowser
    .from("sim_accounts")
    .update({ cash: 1000000, current_snapshot_date: null })
    .eq("user_id", uid);
  return accErr?.message ?? null;
}

/** 次のラウンドへ進む：current_snapshot_date を更新する。 */
export async function advanceRound(nextDate: string): Promise<string | null> {
  const { data: u } = await supabaseBrowser.auth.getUser();
  if (!u.user) return "ログインが必要です";
  const { error } = await supabaseBrowser
    .from("sim_accounts")
    .update({ current_snapshot_date: nextDate })
    .eq("user_id", u.user.id);
  return error?.message ?? null;
}
