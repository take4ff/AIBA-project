#!/usr/bin/env python3
"""週次シミュレータ約定・評価ジョブ。

weekly.yml（月曜 JST 早朝）から呼び出される。
pending な sim_orders を当日の最新終値（円換算）で約定させ、
sim_accounts.cash / sim_positions / sim_valuations / sim_leaderboard を更新する。

冪等性: status='pending' のみ処理。sim_valuations / sim_leaderboard は upsert。
"""
from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal
from typing import Any

import requests

from aiba.config import settings

log = logging.getLogger("aiba.settlement")
INITIAL_CASH = Decimal("1000000")
REGIONS = {"global", "us", "jp", "row"}
FX_FALLBACK = Decimal("157")
PAGE = 1000


def _get_usdjpy() -> Decimal:
    try:
        r = requests.get("https://open.er-api.com/v6/latest/USD", timeout=10)
        v = r.json().get("rates", {}).get("JPY")
        if isinstance(v, (int, float)) and v > 50:
            return Decimal(str(round(v, 2)))
    except Exception:
        pass
    log.warning("USD/JPY 取得失敗。フォールバック %s を使用。", FX_FALLBACK)
    return FX_FALLBACK


def _region_of(domain_id: str) -> str:
    """domain_id から region (global/us/jp/row) を返す。"""
    for part in domain_id.split("_"):
        if part in REGIONS:
            return part
    return "us"


def _to_jpy(price: Decimal, region: str, usdjpy: Decimal) -> Decimal:
    """native price → 円換算（jp は無変換、それ以外は USD×usdjpy）。"""
    return price if region == "jp" else price * usdjpy


def _fetch_all(client, table: str, cols: str) -> list[dict]:
    out, s = [], 0
    while True:
        b = client.table(table).select(cols).range(s, s + PAGE - 1).execute().data
        out += b
        if len(b) < PAGE:
            break
        s += PAGE
    return out


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not settings.has_supabase:
        raise SystemExit("Supabase 未設定。")
    from supabase import create_client
    client = create_client(settings.supabase_url, settings.supabase_key)

    today = date.today().isoformat()
    usdjpy = _get_usdjpy()
    log.info("約定日: %s  USD/JPY: %s", today, usdjpy)

    # --- 最新終値（domain_id ごとに最大 trade_date の行を採用）---
    raw_metrics = _fetch_all(client, "daily_metrics", "domain_id,trade_date,close_price")
    latest: dict[str, tuple[str, Decimal]] = {}  # domain_id → (trade_date, price_jpy)
    for r in raw_metrics:
        did = r["domain_id"]
        if not r.get("close_price"):
            continue
        td = r["trade_date"]
        p = _to_jpy(Decimal(str(r["close_price"])), _region_of(did), usdjpy)
        if did not in latest or td > latest[did][0]:
            latest[did] = (td, p)
    prices: dict[str, Decimal] = {did: v[1] for did, v in latest.items()}
    log.info("価格取得: %d ドメイン", len(prices))

    # --- pending 注文取得（FIFO: placed_at 昇順）---
    orders_raw = (
        client.table("sim_orders")
        .select("id,user_id,domain_id,side,shares")
        .eq("status", "pending")
        .order("placed_at", desc=False)
        .execute().data
    )
    log.info("pending 注文: %d 件", len(orders_raw))

    # --- 口座・ポジションをメモリに読み込む ---
    accounts_raw = _fetch_all(client, "sim_accounts", "user_id,display_name,cash")
    cash: dict[str, Decimal] = {r["user_id"]: Decimal(str(r["cash"])) for r in accounts_raw}
    display_names: dict[str, str] = {r["user_id"]: r["display_name"] for r in accounts_raw}

    positions_raw = _fetch_all(client, "sim_positions", "user_id,domain_id,shares,avg_cost")
    positions: dict[str, dict[str, dict]] = {}
    for r in positions_raw:
        positions.setdefault(r["user_id"], {})[r["domain_id"]] = {
            "shares": Decimal(str(r["shares"])),
            "avg_cost": Decimal(str(r["avg_cost"])),
        }

    # --- 約定処理 ---
    filled_updates: list[dict[str, Any]] = []
    rejected_updates: list[dict[str, Any]] = []
    position_patches: dict[str, dict[str, dict | None]] = {}  # uid→did→patch or None(削除)
    cash_working: dict[str, Decimal] = dict(cash)

    for o in orders_raw:
        uid, did = o["user_id"], o["domain_id"]
        shares = Decimal(str(o["shares"]))
        side = o["side"]
        oid = o["id"]

        fill_price = prices.get(did)
        if fill_price is None:
            rejected_updates.append({"id": oid, "note": "価格データなし（銘柄が daily_metrics に見つかりません）"})
            continue
        if uid not in cash_working:
            rejected_updates.append({"id": oid, "note": "口座が見つかりません"})
            continue

        if side == "buy":
            cost = shares * fill_price
            if cash_working[uid] < cost:
                rejected_updates.append({
                    "id": oid,
                    "note": f"資金不足（必要: {cost:.0f}円 / 残高: {cash_working[uid]:.0f}円）",
                })
                continue
            cash_working[uid] -= cost
            pos = positions.get(uid, {}).get(did)
            if pos:
                old_s, old_c = pos["shares"], pos["avg_cost"]
                new_s = old_s + shares
                new_avg = (old_s * old_c + shares * fill_price) / new_s
            else:
                new_s, new_avg = shares, fill_price
            positions.setdefault(uid, {})[did] = {"shares": new_s, "avg_cost": new_avg}
            position_patches.setdefault(uid, {})[did] = {"shares": float(new_s), "avg_cost": float(new_avg)}
            filled_updates.append({"id": oid, "fill_price": float(fill_price)})

        elif side == "sell":
            pos = positions.get(uid, {}).get(did)
            held = pos["shares"] if pos else Decimal("0")
            if held < shares:
                rejected_updates.append({
                    "id": oid,
                    "note": f"保有数不足（保有: {float(held):.0f}株 / 売却: {float(shares):.0f}株）",
                })
                continue
            cash_working[uid] += shares * fill_price
            new_s = held - shares
            if new_s > 0:
                positions.setdefault(uid, {})[did] = {"shares": new_s, "avg_cost": pos["avg_cost"]}
                position_patches.setdefault(uid, {})[did] = {"shares": float(new_s), "avg_cost": float(pos["avg_cost"])}
            else:
                positions.setdefault(uid, {}).pop(did, None)
                position_patches.setdefault(uid, {})[did] = None  # 削除マーク
            filled_updates.append({"id": oid, "fill_price": float(fill_price)})

    log.info("約定: %d件 / 拒否: %d件", len(filled_updates), len(rejected_updates))

    # --- DB 書き込み ---
    for rec in filled_updates:
        client.table("sim_orders").update({
            "status": "filled", "fill_date": today, "fill_price": rec["fill_price"],
        }).eq("id", rec["id"]).execute()

    for rec in rejected_updates:
        client.table("sim_orders").update({
            "status": "rejected", "fill_date": today, "note": rec["note"],
        }).eq("id", rec["id"]).execute()

    for uid, dom_map in position_patches.items():
        for did, patch in dom_map.items():
            if patch is None:
                client.table("sim_positions").delete().eq("user_id", uid).eq("domain_id", did).execute()
            else:
                client.table("sim_positions").upsert(
                    {"user_id": uid, "domain_id": did, **patch},
                    on_conflict="user_id,domain_id",
                ).execute()

    for uid, new_cash in cash_working.items():
        if new_cash != cash.get(uid):
            client.table("sim_accounts").update({"cash": float(new_cash)}).eq("user_id", uid).execute()

    # --- 全口座を再評価 ---
    positions_final = _fetch_all(client, "sim_positions", "user_id,domain_id,shares")
    pos_by_user: dict[str, dict[str, Decimal]] = {}
    for r in positions_final:
        pos_by_user.setdefault(r["user_id"], {})[r["domain_id"]] = Decimal(str(r["shares"]))

    valuations, leaderboard = [], []
    for uid, nc in cash_working.items():
        pos_val = sum(
            s * prices.get(did, Decimal("0"))
            for did, s in pos_by_user.get(uid, {}).items()
        )
        total = nc + pos_val
        ret_pct = float((total / INITIAL_CASH - 1) * 100)
        valuations.append({"user_id": uid, "valued_on": today, "total_value": float(total), "return_pct": ret_pct})
        leaderboard.append({"user_id": uid, "total_value": float(total), "return_pct": ret_pct})

    if valuations:
        client.table("sim_valuations").upsert(valuations, on_conflict="user_id,valued_on").execute()

    leaderboard.sort(key=lambda x: x["total_value"], reverse=True)
    lb_rows = [
        {
            "user_id": lb["user_id"],
            "display_name": display_names.get(lb["user_id"], "?"),
            "total_value": lb["total_value"],
            "return_pct": lb["return_pct"],
            "rank": i,
            "updated_at": f"{today}T00:00:00+00:00",
        }
        for i, lb in enumerate(leaderboard, 1)
    ]
    if lb_rows:
        client.table("sim_leaderboard").upsert(lb_rows, on_conflict="user_id").execute()

    log.info("評価完了: %d口座 / リーダーボード: %d件", len(valuations), len(lb_rows))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
