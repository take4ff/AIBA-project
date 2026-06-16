#!/usr/bin/env python3
"""月次クロスセクションIC を算出して ic_monthly に保存するジョブ。

各月について、日付別の銘柄横断Spearman（スコア×21営業日先リターン）の月内平均を
AIBA / テクニカル / センチメント それぞれで計算し upsert する。過去に遡って記録でき、
/verify のIC推移グラフで先行性の経時変化を評価する。
"""
from __future__ import annotations

import logging

from aiba.config import settings
from backtest import load, add_forward_return, xs_ic

log = logging.getLogger("aiba.ic_monthly")
HORIZON = 21


def _num(x):
    return None if x is None or x != x else round(float(x), 3)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not settings.has_supabase:
        raise SystemExit("Supabase 未設定。")
    from supabase import create_client
    client = create_client(settings.supabase_url, settings.supabase_key)

    df = add_forward_return(load(client), HORIZON)
    df = df.copy()
    df["trade_date"] = df["trade_date"].astype(str).str.slice(0, 10)  # datetime/str 両対応で正規化
    df["ym"] = df["trade_date"].str[:7]

    rows = []
    for ym, g in df.groupby("ym"):
        if g["trade_date"].nunique() < 5:
            continue  # 月内の取引日が少なすぎる（直近の未評価月など）はスキップ
        ia, _ = xs_ic(g, g["aiba_score"])
        it, _ = xs_ic(g, g["technical_score"])
        isn, _ = xs_ic(g, g["sentiment_score"])
        rows.append({
            "month": g["trade_date"].max(), "ic_aiba": _num(ia),
            "ic_technical": _num(it), "ic_sentiment": _num(isn), "n": int(len(g)),
        })

    if rows:
        client.table("ic_monthly").upsert(rows, on_conflict="month").execute()
    log.info("完了: %d ヶ月分のICを保存しました。", len(rows))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
