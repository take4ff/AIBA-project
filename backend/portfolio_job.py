#!/usr/bin/env python3
"""ポートフォリオの「売り時（過熱度）」を集計して Supabase へ保存する。

各保有銘柄について:
  - 直近6ヶ月の日次テクニカル（RSI・移動平均乖離）を再構築
  - 過熱度 overheat = 100 - テクニカル割安スコア（高いほど割高・売り時）
を算出し portfolio_metrics に保存。マスタは portfolio_holdings に同期。

新規上場で履歴が足りない銘柄は、指標なしでも最新終値だけは保存する。
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import yaml
import yfinance as yf

from aiba.config import ROOT_DIR, settings
from aiba.db import _serialize
from aiba.score import technical_score
from aiba.technical import LOOKBACK_DAYS, _snapshots_from_df

log = logging.getLogger("aiba.portfolio")
PORTFOLIO_PATH = ROOT_DIR / "config" / "portfolio.yaml"
MONTHS = 6


def load_holdings() -> list[dict[str, Any]]:
    with open(PORTFOLIO_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f).get("holdings", [])


def _num(v: Any) -> float | None:
    """NaN/None/極端値を安全に float|None へ。"""
    try:
        if v is None:
            return None
        f = float(v)
        return None if (f != f or abs(f) > 1e6) else round(f, 4)
    except (TypeError, ValueError):
        return None


def fetch_fundamentals(ticker: str) -> dict[str, Any]:
    """決算日・サプライズ・PER・成長率を取得。ETF等で無い項目は None。"""
    out: dict[str, Any] = {
        "quote_type": None, "next_earnings_date": None, "last_surprise_pct": None,
        "trailing_pe": None, "forward_pe": None, "eps_growth": None, "revenue_growth": None,
        "fundamentals_updated_at": datetime.now(timezone.utc).isoformat(),
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

    # 決算日・サプライズは個別株(EQUITY)のみ
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


def metrics_for(ticker: str) -> list[dict[str, Any]]:
    """1ティッカーの日次（close, rsi, ma_deviation, overheat）を返す。"""
    period_days = MONTHS * 31 + 70
    df = yf.download(ticker, period=f"{period_days}d", interval="1d",
                     auto_adjust=True, progress=False)
    if df is None or df.empty:
        return []
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    cutoff = pd.Timestamp.today().normalize() - pd.Timedelta(days=MONTHS * 31)
    snaps = _snapshots_from_df(df)
    rows: list[dict[str, Any]] = []
    for s in snaps:
        if pd.Timestamp(s.trade_date) < cutoff:
            continue
        overheat = round(100 - technical_score(s), 2)  # 割安の逆＝過熱度
        rows.append({
            "trade_date": s.trade_date, "close_price": s.close_price,
            "rsi_14": s.rsi_14, "ma_deviation": s.ma_deviation, "overheat": overheat,
        })

    # 指標を出せる履歴が無い（新規上場等）場合も、最新終値だけは残す
    if not rows:
        close = df["Close"].dropna()
        if not close.empty:
            rows.append({
                "trade_date": close.index[-1].date(),
                "close_price": float(close.iloc[-1]),
                "rsi_14": None, "ma_deviation": None, "overheat": None,
            })
    return rows


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not settings.has_supabase:
        raise SystemExit("Supabaseが未設定です。.env を確認してください。")
    from supabase import create_client
    client = create_client(settings.supabase_url, settings.supabase_key)

    holdings = load_holdings()
    master = []
    for h in holdings:
        row = {
            "id": h["id"], "name": h["name"], "ticker": h["ticker"],
            "currency": h["currency"], "kind": h["kind"],
            "avg_cost": h.get("avg_cost"), "note": h.get("note"),
        }
        row.update(fetch_fundamentals(h["ticker"]))  # 決算・ファンダ
        master.append(row)
    client.table("portfolio_holdings").upsert(master, on_conflict="id").execute()

    total = 0
    for h in holdings:
        rows = metrics_for(h["ticker"])
        if not rows:
            log.warning("[%s] 価格取得不可。スキップ。", h["id"])
            continue
        payload = [_serialize({"holding_id": h["id"], **r}) for r in rows]
        client.table("portfolio_metrics").upsert(
            payload, on_conflict="holding_id,trade_date").execute()
        latest = rows[-1]
        oh = latest["overheat"]
        log.info("[%s] %d日分 / 最新 close=%.2f overheat=%s",
                 h["id"], len(rows), latest["close_price"],
                 f"{oh:.0f}" if oh is not None else "—(履歴不足)")
        total += len(payload)
    log.info("完了: %d 件の portfolio_metrics を保存しました。", total)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
