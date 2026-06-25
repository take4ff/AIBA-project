#!/usr/bin/env python3
"""
月次マーケットサマリージョブ。
S&P500（Wikipedia + yfinance）と日本（TOPIX-17 セクターETF）の
月次セクター騰落率を算出して market_monthly テーブルに upsert する。
"""

import io
import ssl
import sys
import urllib.request
import warnings
from datetime import date

import pandas as pd
import yfinance as yf
from dateutil.relativedelta import relativedelta
from supabase import create_client

from aiba.config import settings

warnings.filterwarnings("ignore")

# TOPIX-17 セクターETF（日本）
TOPIX_SECTORS: dict[str, str] = {
    "食品": "1617.T",
    "エネルギー資源": "1618.T",
    "建設・資材": "1619.T",
    "素材・化学": "1620.T",
    "医薬品": "1621.T",
    "自動車・輸送機": "1622.T",
    "鉄鋼・非鉄": "1623.T",
    "機械": "1624.T",
    "電機・精密": "1625.T",
    "情報通信・サービス": "1626.T",
    "電力・ガス": "1627.T",
    "運輸・物流": "1628.T",
    "商社・卸売": "1629.T",
    "小売": "1630.T",
    "銀行": "1631.T",
    "金融（除く銀行）": "1632.T",
    "不動産": "1633.T",
}


def _ssl_ctx() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def fetch_sp500_sectors() -> pd.DataFrame:
    """WikipediaからS&P500構成銘柄とGICSセクターを取得。"""
    req = urllib.request.Request(
        "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
        headers={"User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(req, context=_ssl_ctx()) as r:
        html = r.read()
    tables = pd.read_html(io.BytesIO(html))
    df = tables[0][["Symbol", "GICS Sector"]].copy()
    df.columns = ["ticker", "sector"]
    df["ticker"] = df["ticker"].str.replace(".", "-", regex=False)
    return df


def calc_monthly_returns(tickers: list[str], start: str, end: str) -> pd.DataFrame:
    """yfinanceで月次リターン（%）を計算。columns=ticker, index=月初日。"""
    raw = yf.download(tickers, start=start, end=end, progress=False, auto_adjust=True)["Close"]
    if isinstance(raw, pd.Series):
        raw = raw.to_frame(name=tickers[0])
    monthly = raw.resample("MS").first()
    return (monthly.pct_change() * 100).iloc[1:]  # 最初の月はNaNなので除く


def build_sp500_rows(start: str, end: str) -> list[dict]:
    print("  S&P500 構成銘柄取得中...")
    sp500 = fetch_sp500_sectors()
    tickers = sp500["ticker"].tolist()

    print(f"  S&P500 価格ダウンロード中（{len(tickers)}銘柄）...")
    returns = calc_monthly_returns(tickers, start, end)

    rows = []
    for month_ts in returns.index:
        month_str = month_ts.strftime("%Y-%m-%d")
        month_ret = returns.loc[month_ts].dropna()

        for sector in sp500["sector"].unique():
            sect_tickers = sp500.loc[sp500["sector"] == sector, "ticker"].tolist()
            vals = month_ret[[t for t in sect_tickers if t in month_ret.index]].dropna()
            if vals.empty:
                continue
            best = str(vals.idxmax())
            worst = str(vals.idxmin())
            rows.append({
                "index_name": "sp500",
                "sector": sector,
                "month": month_str,
                "avg_return": round(float(vals.mean()), 4),
                "median_return": round(float(vals.median()), 4),
                "best_ticker": best,
                "best_return": round(float(vals[best]), 4),
                "worst_ticker": worst,
                "worst_return": round(float(vals[worst]), 4),
                "ticker_count": len(vals),
            })
    print(f"  S&P500: {len(rows)}行生成")
    return rows


def build_topix_rows(start: str, end: str) -> list[dict]:
    print("  TOPIX-17 ETF 価格ダウンロード中...")
    tickers = list(TOPIX_SECTORS.values())
    returns = calc_monthly_returns(tickers, start, end)
    ticker_to_sector = {v: k for k, v in TOPIX_SECTORS.items()}

    rows = []
    for month_ts in returns.index:
        month_str = month_ts.strftime("%Y-%m-%d")
        for ticker, sector in ticker_to_sector.items():
            if ticker not in returns.columns:
                continue
            val = returns.loc[month_ts, ticker]
            if pd.isna(val):
                continue
            rows.append({
                "index_name": "topix",
                "sector": sector,
                "month": month_str,
                "avg_return": round(float(val), 4),
                "median_return": round(float(val), 4),
                "best_ticker": ticker,
                "best_return": round(float(val), 4),
                "worst_ticker": ticker,
                "worst_return": round(float(val), 4),
                "ticker_count": 1,
            })
    print(f"  TOPIX: {len(rows)}行生成")
    return rows


def main() -> None:
    if not settings.has_supabase:
        print("SUPABASE_URL/KEY が未設定のためスキップ")
        sys.exit(0)

    client = create_client(settings.supabase_url, settings.supabase_key)
    today = date.today()
    # 過去13ヶ月（前月まで確定 + 当月途中）
    start = (today - relativedelta(months=13)).replace(day=1).isoformat()
    end = today.isoformat()
    print(f"対象期間: {start} 〜 {end}")

    rows = build_sp500_rows(start, end) + build_topix_rows(start, end)

    print(f"upsert: {len(rows)}行...")
    for i in range(0, len(rows), 200):
        client.table("market_monthly").upsert(rows[i : i + 200]).execute()

    print("完了")


if __name__ == "__main__":
    main()
