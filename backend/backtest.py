#!/usr/bin/env python3
"""バックテスト：スコアの先行性検証と層別重みの定量最適化。

daily_metrics の履歴から、各銘柄の H営業日先リターンを算出し、
  - 各スコア（AIBA / テクニカル / センチメント）の IC（順位相関）
  - 「AIBA≥閾値で買う」戦略の平均先行リターン vs 全体平均
  - 層別の最適重み w（score = w*テクニカル + (1-w)*センチメント）を IC 最大化で探索
を表示する。重みの変更は手動（score.py の LAYER_WEIGHTS）で行う想定。

  python backtest.py            # H=21（約1ヶ月）
  python backtest.py --horizon 63
"""
from __future__ import annotations

import argparse
import logging

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from aiba.config import settings

log = logging.getLogger("aiba.backtest")
BUY = 60.0
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


def load(client) -> pd.DataFrame:
    m = pd.DataFrame(_fetch_all(
        client, "daily_metrics",
        "domain_id,trade_date,aiba_score,technical_score,sentiment_score,close_price"))
    layer = {d["id"]: d["layer"] for d in _fetch_all(client, "domains", "id,layer")}
    m["layer"] = m["domain_id"].map(layer)
    for c in ["aiba_score", "technical_score", "sentiment_score", "close_price"]:
        m[c] = pd.to_numeric(m[c], errors="coerce")
    m["trade_date"] = pd.to_datetime(m["trade_date"])
    return m.sort_values(["domain_id", "trade_date"])


def add_forward_return(df: pd.DataFrame, h: int) -> pd.DataFrame:
    df = df.copy()
    df["fwd_ret"] = df.groupby("domain_id")["close_price"].transform(
        lambda s: s.shift(-h) / s - 1.0)
    return df.dropna(subset=["fwd_ret", "aiba_score", "technical_score", "sentiment_score"])


def ic(score: pd.Series, ret: pd.Series) -> float:
    if len(score) < 30 or score.nunique() < 3:
        return float("nan")
    return float(spearmanr(score, ret).correlation)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--horizon", type=int, default=21)
    args = ap.parse_args()
    if not settings.has_supabase:
        raise SystemExit("Supabase 未設定。")
    from supabase import create_client
    client = create_client(settings.supabase_url, settings.supabase_key)

    raw = load(client)
    df = add_forward_return(raw, args.horizon)
    n = len(df)
    log.info("=== バックテスト（H=%d営業日先リターン, サンプル=%d）===", args.horizon, n)
    if n < 100:
        log.warning("サンプルが少なく結果は参考程度です。")

    # 1. 各スコアの IC（高いほど先行性あり）
    log.info("\n[IC（順位相関 / 先行リターンとの相関）]")
    for name, col in [("AIBA", "aiba_score"), ("テクニカル", "technical_score"), ("センチメント", "sentiment_score")]:
        log.info("  %-8s IC = %+.3f", name, ic(df[col], df["fwd_ret"]))

    # 2. 買いシグナルの有効性
    buy = df[df["aiba_score"] >= BUY]["fwd_ret"]
    log.info("\n[AIBA≥%.0f で買う戦略]", BUY)
    log.info("  対象 %d 件 / 平均先行リターン = %+.2f%%（全体平均 %+.2f%%）",
             len(buy), 100 * buy.mean() if len(buy) else float("nan"), 100 * df["fwd_ret"].mean())

    # 3. 層別の最適重み（score = w*テクニカル + (1-w)*センチメント）
    log.info("\n[層別 最適重み探索（IC最大化）] 現行: L1=0.7 / L2=0.5 / L3=0.3")
    ws = np.linspace(0, 1, 11)
    for layer in (1, 2, 3):
        d = df[df["layer"] == layer]
        if len(d) < 30:
            log.info("  第%d層: サンプル不足", layer)
            continue
        best_w, best_ic = max(
            ((w, ic(w * d["technical_score"] + (1 - w) * d["sentiment_score"], d["fwd_ret"])) for w in ws),
            key=lambda x: (x[1] if x[1] == x[1] else -9),
        )
        log.info("  第%d層: 最適 w(テクニカル)=%.1f (IC %+.3f) / サンプル %d", layer, best_w, best_ic, len(d))

    log.info("\n※ w はテクニカルの重み。IC>0 で先行性あり。重みは score.py の LAYER_WEIGHTS を手動調整。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
