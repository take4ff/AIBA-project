#!/usr/bin/env python3
"""ユーザー別ポートフォリオ用の指標バッチ。

全ユーザーの user_holdings から保有ティッカーを集約し、ティッカー単位で
  - ticker_metrics      : 日次テクニカル＋過熱度(=100-割安スコア)
  - ticker_fundamentals : 決算日・サプライズ・PER・成長率
を計算して保存する（共有テーブル・公開読み取り）。

ユーザーの保有が無ければ何もしない。
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import yfinance as yf

from aiba.config import settings
from aiba.db import _serialize
from aiba.score import technical_score
from aiba.technical import _snapshots_from_df

log = logging.getLogger("aiba.portfolio")
MONTHS = 48  # 保有銘柄のチャート用に約4年分の履歴を保持


def _num(v: Any) -> float | None:
    try:
        if v is None:
            return None
        f = float(v)
        return None if (f != f or abs(f) > 1e6) else round(f, 4)
    except (TypeError, ValueError):
        return None


def metrics_for(ticker: str) -> list[dict[str, Any]]:
    period_days = MONTHS * 31 + 70
    df = yf.download(ticker, period=f"{period_days}d", interval="1d",
                     auto_adjust=True, progress=False)
    if df is None or df.empty:
        return []
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    cutoff = pd.Timestamp.today().normalize() - pd.Timedelta(days=MONTHS * 31)
    rows: list[dict[str, Any]] = []
    for s in _snapshots_from_df(df):
        if pd.Timestamp(s.trade_date) < cutoff:
            continue
        rows.append({
            "ticker": ticker, "trade_date": s.trade_date, "close_price": s.close_price,
            "rsi_14": s.rsi_14, "ma_deviation": s.ma_deviation,
            "overheat": round(100 - technical_score(s), 2),
        })
    if not rows:  # 新規上場等で履歴不足：指標は出せないが終値は取得できた全期間ぶん残す
        for idx, v in df["Close"].dropna().items():
            if pd.Timestamp(idx) < cutoff:
                continue
            rows.append({"ticker": ticker, "trade_date": idx.date(),
                         "close_price": float(v),
                         "rsi_14": None, "ma_deviation": None, "overheat": None})
    return rows


def fetch_fundamentals(ticker: str) -> dict[str, Any]:
    out: dict[str, Any] = {
        "ticker": ticker, "quote_type": None, "next_earnings_date": None,
        "last_surprise_pct": None, "trailing_pe": None, "forward_pe": None,
        "eps_growth": None, "revenue_growth": None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        tk = yf.Ticker(ticker)
        info = tk.info or {}
    except Exception:
        return out
    out["quote_type"] = info.get("quoteType")
    out["trailing_pe"] = _num(info.get("trailingPE"))
    out["forward_pe"] = _num(info.get("forwardPE"))
    out["eps_growth"] = _num(info.get("earningsQuarterlyGrowth"))
    out["revenue_growth"] = _num(info.get("revenueGrowth"))
    if info.get("quoteType") == "EQUITY":
        try:
            ed = tk.get_earnings_dates(limit=12)
            if ed is not None and not ed.empty:
                now = pd.Timestamp.now(tz=ed.index.tz)
                future = ed[ed.index > now]
                if not future.empty:
                    out["next_earnings_date"] = future.index.min().date().isoformat()
                past = ed[ed.index <= now]
                if not past.empty and "Surprise(%)" in ed.columns:
                    out["last_surprise_pct"] = _num(past.iloc[0]["Surprise(%)"])
        except Exception:
            pass
    return out


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not settings.has_supabase:
        raise SystemExit("Supabaseが未設定です。.env を確認してください。")
    from supabase import create_client
    client = create_client(settings.supabase_url, settings.supabase_key)

    # 全ユーザーの保有ティッカー（service_role は RLS をバイパス）
    holdings = client.table("user_holdings").select("ticker").execute().data or []
    tickers = sorted({h["ticker"] for h in holdings})
    if not tickers:
        log.info("保有銘柄が登録されていません。処理なし。")
        return 0
    log.info("対象ティッカー: %d 件", len(tickers))

    total = 0
    funds: list[dict[str, Any]] = []
    for t in tickers:
        rows = metrics_for(t)
        if rows:
            client.table("ticker_metrics").upsert(
                [_serialize(r) for r in rows], on_conflict="ticker,trade_date").execute()
            total += len(rows)
            oh = rows[-1]["overheat"]
            log.info("[%s] %d日分 / overheat=%s", t, len(rows),
                     f"{oh:.0f}" if oh is not None else "—")
        funds.append(_serialize(fetch_fundamentals(t)))

    if funds:
        client.table("ticker_fundamentals").upsert(funds, on_conflict="ticker").execute()
    log.info("完了: ticker_metrics %d 件 / fundamentals %d 件", total, len(funds))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
