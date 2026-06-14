#!/usr/bin/env python3
"""ユニバースの個別株（＋保有銘柄）の決算・ファンダを取得して
ticker_fundamentals に保存する。銘柄詳細ページの「決算情報」表示用。

ETF はスキップ（決算なし）。日次ジョブから実行。
"""
from __future__ import annotations

import logging

from aiba.config import load_domains, settings
from aiba.db import _serialize
from portfolio_job import fetch_fundamentals

log = logging.getLogger("aiba.fundamentals")


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not settings.has_supabase:
        raise SystemExit("Supabase 未設定。")
    from supabase import create_client
    client = create_client(settings.supabase_url, settings.supabase_key)

    # ユニバースの個別株ティッカー＋保有ティッカー
    tickers = {d.ticker for d in load_domains() if d.kind == "stock"}
    held = client.table("user_holdings").select("ticker").execute().data or []
    tickers |= {h["ticker"] for h in held}
    tickers = sorted(tickers)
    log.info("対象ティッカー: %d 件", len(tickers))

    funds = [_serialize(fetch_fundamentals(t)) for t in tickers]
    if funds:
        client.table("ticker_fundamentals").upsert(funds, on_conflict="ticker").execute()
    log.info("完了: ticker_fundamentals %d 件", len(funds))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
