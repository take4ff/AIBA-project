#!/usr/bin/env python3
"""AIBAスコアの先行予測ジョブ。

  python predict.py --backtest   # 時系列分割でnaive比較（精度検証）
  python predict.py              # 全データで学習し最新日を予測→Supabaseへ保存

「Actionsで学習・予測 → Supabaseへ保存 → Vercelは表示のみ」という既存方式に乗る。
"""
from __future__ import annotations

import argparse
import logging
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import mean_absolute_error, roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from aiba.config import settings
from aiba.forecast import (BUY, CLF_FEATURES, HORIZON, MeanReversion,
                           build_features, labeled_mask, latest_rows)

log = logging.getLogger("aiba.predict")
PAGE = 1000


def fetch_all(table: str, columns: str) -> list[dict]:
    from supabase import create_client
    client = create_client(settings.supabase_url, settings.supabase_key)
    rows: list[dict] = []
    start = 0
    while True:
        res = client.table(table).select(columns).range(start, start + PAGE - 1).execute()
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        start += PAGE
    return rows


def load_dataframe() -> pd.DataFrame:
    if not settings.has_supabase:
        raise SystemExit("Supabaseが未設定です。.env を確認してください。")
    metrics = fetch_all(
        "daily_metrics",
        "domain_id,trade_date,aiba_score,technical_score,sentiment_score,rsi_14,ma_deviation,close_price",
    )
    domains = fetch_all("domains", "id,layer")
    layer = {d["id"]: d["layer"] for d in domains}
    df = pd.DataFrame(metrics)
    df["layer"] = df["domain_id"].map(layer)
    for c in ["aiba_score", "technical_score", "sentiment_score", "rsi_14", "ma_deviation", "close_price"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


def train_models(train: pd.DataFrame):
    y_clf = (train["fwd_max_aiba"] >= BUY).astype(int)
    y_reg = train["y_reg"].astype(float)

    # 平均回帰は固定 w=0.5（学習で当てはめるより頑健。バックテストで最良）
    reg = MeanReversion(w=0.5)

    if y_clf.nunique() > 1:
        clf = make_pipeline(
            StandardScaler(),
            LogisticRegression(C=0.5, class_weight="balanced", max_iter=1000),
        )
        clf.fit(train[CLF_FEATURES].astype(float), y_clf)
    else:
        clf = None
    return clf, reg


def backtest(feat: pd.DataFrame) -> None:
    lab = feat[labeled_mask(feat)].copy()
    if lab.empty:
        log.error("学習可能な行がありません。")
        return
    # 時系列分割（purge: テスト開始前 HORIZON 日を学習から除外）
    cutoff = lab["trade_date"].quantile(0.7)
    test = lab[lab["trade_date"] > cutoff]
    train = lab[lab["trade_date"] <= cutoff - pd.Timedelta(days=HORIZON)]
    log.info("backtest: train=%d, test=%d (cutoff=%s)", len(train), len(test), cutoff.date())
    if train.empty or test.empty:
        log.error("分割後に十分なデータがありません。")
        return

    clf, reg = train_models(train)

    # --- 回帰: MAE を naive(据え置き) と 平均回帰(50へ) と比較 ---
    y_true = test["y_reg"].astype(float)
    pred = reg.predict(test["aiba_score"].astype(float).values)
    naive = test["aiba_score"].astype(float)              # 据え置き
    revert = test["aiba_score"].astype(float) * 0.5 + 50.0 * 0.5  # 50へ半分回帰
    log.info("[回帰 MAE] model=%.2f  naive=%.2f  meanrevert=%.2f",
             mean_absolute_error(y_true, pred),
             mean_absolute_error(y_true, naive),
             mean_absolute_error(y_true, revert))

    # --- 分類: AUC を naive(現在のdist_to_buy) と比較 ---
    if clf is not None:
        y_clf = (test["fwd_max_aiba"] >= BUY).astype(int)
        if y_clf.nunique() > 1:
            prob = clf.predict_proba(test[CLF_FEATURES].astype(float))[:, 1]
            naive_score = test["aiba_score"].astype(float)  # 現在スコアが高いほど買い場入りやすい
            log.info("[分類 AUC] model=%.3f  naive(現在スコア)=%.3f  陽性率=%.2f",
                     roc_auc_score(y_clf, prob),
                     roc_auc_score(y_clf, naive_score),
                     y_clf.mean())
        else:
            log.info("[分類] テスト期間のラベルが単一クラスのため評価不可")


def predict_and_store(feat: pd.DataFrame) -> None:
    lab = feat[labeled_mask(feat)].copy()
    if lab.empty:
        raise SystemExit("学習データが不足しています。")
    clf, reg = train_models(lab)

    latest = latest_rows(feat).copy()
    latest["pred_aiba"] = np.clip(reg.predict(latest["aiba_score"].astype(float).values), 0, 100).round(2)
    if clf is not None:
        latest["buyzone_prob"] = clf.predict_proba(latest[CLF_FEATURES].astype(float))[:, 1].round(4)
    else:
        latest["buyzone_prob"] = None

    records = []
    for _, r in latest.iterrows():
        records.append({
            "domain_id": r["domain_id"],
            "as_of_date": pd.to_datetime(r["trade_date"]).date().isoformat(),
            "horizon_days": HORIZON,
            "pred_aiba": float(r["pred_aiba"]),
            "buyzone_prob": None if pd.isna(r["buyzone_prob"]) else float(r["buyzone_prob"]),
            "model_version": "hgb-v1",
        })

    from supabase import create_client
    client = create_client(settings.supabase_url, settings.supabase_key)
    client.table("predictions").upsert(records, on_conflict="domain_id,as_of_date").execute()
    log.info("predictions に %d 件を保存しました。", len(records))
    # サンプル表示
    top = latest.sort_values("buyzone_prob", ascending=False).head(5)
    for _, r in top.iterrows():
        log.info("  %-34s buyzone_prob=%.0f%%  pred_aiba=%.1f (現在%.1f)",
                 r["domain_id"], 100 * (r["buyzone_prob"] or 0), r["pred_aiba"], r["aiba_score"])


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--backtest", action="store_true", help="精度検証のみ（保存しない）")
    args = ap.parse_args()

    df = load_dataframe()
    log.info("読込: %d 行 / %d ドメイン", len(df), df["domain_id"].nunique())
    feat = build_features(df)

    if args.backtest:
        backtest(feat)
    else:
        predict_and_store(feat)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
