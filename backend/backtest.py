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
from datetime import date

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


def xs_ic(df: pd.DataFrame, score: pd.Series) -> tuple[float, float]:
    """クロスセクションIC：各取引日に銘柄横断でスコア×先行リターンのSpearmanを取り、
    期間平均と IR（平均/標準偏差＝安定性）を返す。市場全体の共通変動を除いて先行性を測る。"""
    tmp = pd.DataFrame({
        "d": df["trade_date"].to_numpy(),
        "s": np.asarray(score, dtype=float),
        "r": df["fwd_ret"].to_numpy(dtype=float),
    })
    ics: list[float] = []
    for _, g in tmp.groupby("d"):
        if len(g) < 5 or g["s"].nunique() < 3:
            continue  # 横断に十分な銘柄数がある日のみ
        c = spearmanr(g["s"], g["r"]).correlation
        if c == c:
            ics.append(float(c))
    if len(ics) < 5:
        return float("nan"), float("nan")
    a = np.array(ics)
    sd = a.std()
    return float(a.mean()), (float(a.mean() / sd) if sd > 0 else float("nan"))


def _best_w(df: pd.DataFrame, layer: int):
    d = df[df["layer"] == layer]
    if len(d) < 100:
        return None, None
    ws = np.linspace(0, 1, 11)
    return max(
        ((w, xs_ic(d, w * d["technical_score"] + (1 - w) * d["sentiment_score"])[0]) for w in ws),
        key=lambda x: (x[1] if x[1] == x[1] else -9),
    )


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--horizon", type=int, default=21)
    ap.add_argument("--save", action="store_true", help="結果を backtest_runs に保存")
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

    ic_aiba, ir_aiba = xs_ic(df, df["aiba_score"])
    ic_tech, ir_tech = xs_ic(df, df["technical_score"])
    ic_sent, ir_sent = xs_ic(df, df["sentiment_score"])
    log.info("\n[クロスセクションIC（日付別→平均 / IR）]")
    log.info("  AIBA %+.3f (IR %+.2f) / テクニカル %+.3f (IR %+.2f) / センチメント %+.3f (IR %+.2f)",
             ic_aiba, ir_aiba, ic_tech, ir_tech, ic_sent, ir_sent)

    buy = df[df["aiba_score"] >= BUY]["fwd_ret"]
    buy_avg = 100 * buy.mean() if len(buy) else float("nan")
    overall_avg = 100 * df["fwd_ret"].mean()
    log.info("[AIBA≥%.0f] 対象 %d 件 / 平均先行 %+.2f%%（全体 %+.2f%%）", BUY, len(buy), buy_avg, overall_avg)

    bw = {layer: _best_w(df, layer) for layer in (1, 2, 3)}
    for layer in (1, 2, 3):
        w, wic = bw[layer]
        log.info("  第%d層 最適w(テク)=%s (IC %s)", layer,
                 "—" if w is None else f"{w:.1f}", "—" if wic is None else f"{wic:+.3f}")

    if args.save:
        def num(x):
            return None if x is None or x != x else round(float(x), 4)
        row = {
            "run_date": date.today().isoformat(), "horizon": args.horizon, "n_samples": n,
            "ic_aiba": num(ic_aiba), "ic_technical": num(ic_tech), "ic_sentiment": num(ic_sent),
            "buy_threshold": BUY, "buy_count": int(len(buy)),
            "buy_avg_return": num(buy_avg), "overall_avg_return": num(overall_avg),
            "best_w_l1": num(bw[1][0]), "best_w_l2": num(bw[2][0]), "best_w_l3": num(bw[3][0]),
        }
        client.table("backtest_runs").upsert(row, on_conflict="run_date,horizon").execute()
        log.info("\nbacktest_runs に保存しました（%s, H=%d）。", row["run_date"], args.horizon)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
