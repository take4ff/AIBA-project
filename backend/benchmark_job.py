#!/usr/bin/env python3
"""ベンチマーク指数の日次終値を保存するジョブ。

エクイティカーブの「インデックス放置」比較用に、指数の終値を取得して
benchmark_prices に upsert する。既定は ACWI（全世界株＝コア放置の代理）。
"""
from __future__ import annotations

import logging

import pandas as pd
import yfinance as yf

from aiba.config import settings

log = logging.getLogger("aiba.benchmark")

# ticker: 表示名（必要なら QQQ / ^GSPC 等を追加可能）
INDICES = {"ACWI": "全世界株(ACWI)"}
PERIOD_DAYS = 1825  # 約5年（定点記録の2022年初〜をカバー）


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not settings.has_supabase:
        raise SystemExit("Supabaseが未設定です。")
    from supabase import create_client
    client = create_client(settings.supabase_url, settings.supabase_key)

    rows: list[dict] = []
    for tk in INDICES:
        df = yf.download(tk, period=f"{PERIOD_DAYS}d", interval="1d", auto_adjust=True, progress=False)
        if df is None or df.empty:
            log.warning("[%s] 取得失敗。スキップ。", tk)
            continue
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        close = df["Close"].dropna()
        for idx, v in close.items():
            rows.append({"trade_date": idx.date().isoformat(), "ticker": tk, "close": round(float(v), 4)})
        log.info("[%s] %d 日分", tk, len(close))

    if rows:
        for i in range(0, len(rows), 500):
            client.table("benchmark_prices").upsert(rows[i:i + 500], on_conflict="trade_date,ticker").execute()
    log.info("完了: %d 行を保存しました。", len(rows))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
