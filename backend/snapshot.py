#!/usr/bin/env python3
"""スコアの定点記録＆評価（out-of-sample 検証）。

  記録: 当月にスナップショットが無ければ、最新取引日の各ドメインの
        AIBAスコア・買い判定・終値を score_snapshots に保存（月1回）。
  評価: 既存スナップショットのうち十分経過したものに、1/3/6ヶ月後の
        実リターン ret_* を埋める（先読みなし）。

日次ジョブから実行（記録は月1回・評価は毎回）。
"""
from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from aiba.config import settings

log = logging.getLogger("aiba.snapshot")
BUY = 60.0
HORIZONS = {"ret_1m": 21, "ret_3m": 63, "ret_6m": 126, "ret_12m": 252}  # 営業日
PAGE = 1000


def _fetch_all(client, table, cols):
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

    metrics = pd.DataFrame(_fetch_all(client, "daily_metrics",
                                      "domain_id,trade_date,aiba_score,close_price"))
    if metrics.empty:
        log.info("daily_metrics が空。処理なし。")
        return 0
    metrics["aiba_score"] = pd.to_numeric(metrics["aiba_score"], errors="coerce")
    metrics["close_price"] = pd.to_numeric(metrics["close_price"], errors="coerce")
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", action="store_true", help="過去の月次アンカーもまとめて記録")
    args = ap.parse_args()

    metrics = metrics.sort_values("trade_date")
    latest_date = metrics["trade_date"].max()

    def record(dates: list[str]):
        rec = []
        for d in dates:
            for r in metrics[metrics["trade_date"] == d].itertuples():
                rec.append({
                    "snapshot_date": d, "domain_id": r.domain_id,
                    "aiba_score": None if pd.isna(r.aiba_score) else round(float(r.aiba_score), 2),
                    "is_buy": bool(r.aiba_score >= BUY) if not pd.isna(r.aiba_score) else None,
                    "close_price": None if pd.isna(r.close_price) else float(r.close_price),
                })
        if rec:
            client.table("score_snapshots").upsert(rec, on_conflict="snapshot_date,domain_id").execute()
        log.info("スナップショット記録: %d日分 / %d 行", len(dates), len(rec))

    snaps = pd.DataFrame(_fetch_all(client, "score_snapshots",
                                    "snapshot_date,domain_id,close_price,ret_1m,ret_3m,ret_6m,ret_12m"))
    existing_months = set(snaps["snapshot_date"].str[:7]) if not snaps.empty else set()

    def _best_anchor(grp: pd.DataFrame) -> str:
        """月内で全ドメインの85%以上が存在する最新取引日を返す（祝日スキップ）。"""
        counts = grp.groupby("trade_date")["domain_id"].nunique()
        threshold = counts.max() * 0.85
        qualified = counts[counts >= threshold]
        return qualified.index.max()

    if args.backfill:
        # 各月の最終取引日をアンカーに、未記録の月だけ記録
        metrics_m = metrics.assign(month=metrics["trade_date"].str[:7])
        anchors = metrics_m.groupby("month").apply(_best_anchor)
        dates = [d for m, d in anchors.items() if m not in existing_months]
        record(dates)
    else:
        month = latest_date[:7]
        if month in existing_months:
            log.info("当月(%s)は記録済み。記録はスキップ。", month)
        else:
            # 当月のアンカー日も85%カバー基準で選定
            month_metrics = metrics[metrics["trade_date"].str[:7] == month]
            anchor = _best_anchor(month_metrics)
            record([anchor])

    snaps = pd.DataFrame(_fetch_all(client, "score_snapshots",
                                    "snapshot_date,domain_id,close_price,ret_1m,ret_3m,ret_6m,ret_12m"))

    # --- 評価（経過した未評価のリターンを埋める）---
    by_dom: dict[str, pd.DataFrame] = {
        d: g.reset_index(drop=True) for d, g in metrics.groupby("domain_id")
    }
    updates: list[dict[str, Any]] = []
    for s in snaps.itertuples():
        g = by_dom.get(s.domain_id)
        if g is None or s.close_price in (None, 0) or pd.isna(s.close_price):
            continue
        idx = g.index[g["trade_date"] == s.snapshot_date]
        if len(idx) == 0:
            continue
        i0 = int(idx[0])
        patch: dict[str, Any] = {}
        for col, h in HORIZONS.items():
            if pd.notna(getattr(s, col)):
                continue  # 既に評価済み（NaN/None はどちらも未評価扱い）
            j = i0 + h
            if j < len(g):
                fc = g.loc[j, "close_price"]
                if pd.notna(fc) and s.close_price:
                    patch[col] = round((float(fc) / float(s.close_price) - 1.0) * 100, 4)
        if patch:
            updates.append({"snapshot_date": s.snapshot_date, "domain_id": s.domain_id, **patch})

    if updates:
        client.table("score_snapshots").upsert(updates, on_conflict="snapshot_date,domain_id").execute()
    log.info("評価更新: %d 行", len(updates))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
