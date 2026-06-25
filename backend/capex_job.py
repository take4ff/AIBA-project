#!/usr/bin/env python3
"""
ハイパースケーラ四半期CAPEX取得ジョブ。
yfinance の quarterly_cashflow から Capital Expenditure を取得し
hyperscaler_capex テーブルに upsert する。

月次 Actions（monthly.yml）から実行される。
"""

import sys
import warnings

import pandas as pd
import yfinance as yf
from supabase import create_client

from aiba.config import settings

warnings.filterwarnings("ignore")

# 対象ハイパースケーラ（実際にCAPEXを大規模実行している企業）
TICKERS = ["AMZN", "MSFT", "GOOGL", "META"]

# yfinance のキャッシュフロー行名（バージョンにより揺れるため候補を列挙）
CAPEX_KEYS = [
    "Capital Expenditure",
    "Purchase Of Property Plant And Equipment",
    "Capital Expenditures",
    "Purchase of Property, Plant and Equipment",
]


def fetch_capex(ticker: str) -> list[dict]:
    """1銘柄の四半期CAPEXを取得してレコードリストで返す。"""
    t = yf.Ticker(ticker)
    cf = t.quarterly_cashflow
    if cf is None or cf.empty:
        print(f"  {ticker}: cashflow データなし")
        return []

    capex_row = None
    for key in CAPEX_KEYS:
        if key in cf.index:
            capex_row = cf.loc[key]
            print(f"  {ticker}: '{key}' を使用")
            break

    if capex_row is None:
        print(f"  {ticker}: Capital Expenditure 行が見つからない (index={list(cf.index)[:5]})")
        return []

    rows = []
    for quarter_ts, value in capex_row.items():
        if pd.isna(value):
            continue
        rows.append({
            "ticker": ticker,
            "quarter": pd.Timestamp(quarter_ts).strftime("%Y-%m-%d"),
            "capex_usd": int(abs(float(value))),  # yfinanceは流出=負値のため絶対値
        })

    print(f"  {ticker}: {len(rows)}四半期分取得")
    return rows


def main() -> None:
    if not settings.has_supabase:
        print("SUPABASE_URL/KEY が未設定のためスキップ")
        sys.exit(0)

    client = create_client(settings.supabase_url, settings.supabase_key)
    all_rows: list[dict] = []

    for ticker in TICKERS:
        print(f"\n[{ticker}]")
        try:
            rows = fetch_capex(ticker)
            all_rows.extend(rows)
        except Exception as e:
            print(f"  {ticker}: エラー - {e}")
            continue

    if not all_rows:
        print("\n取得できた行がないためスキップ")
        sys.exit(0)

    print(f"\nupsert: {len(all_rows)}行...")
    for i in range(0, len(all_rows), 100):
        client.table("hyperscaler_capex").upsert(
            all_rows[i : i + 100],
            on_conflict="ticker,quarter",
        ).execute()

    print("完了")


if __name__ == "__main__":
    main()
