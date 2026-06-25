#!/usr/bin/env python3
"""
ma200_deviation を daily_metrics の既存 close_price から一括算出・更新。
ドメインごとに close_price を全件取得して 200日MA乖離率を計算する。

使い方:
  cd backend && source .venv/bin/activate
  python patch_ma200.py
"""
from __future__ import annotations

import sys

import pandas as pd
from supabase import create_client

from aiba.config import settings

PAGE = 1000   # Supabase の上限
BATCH = 200   # upsert バッチサイズ
MA200 = 200


def fetch_domain_closes(client, domain_id: str) -> list[tuple[str, float]]:
    """1ドメインの全 (trade_date, close_price) を取得（ページング対応）。"""
    rows: list[tuple[str, float]] = []
    offset = 0
    while True:
        data = (
            client.table("daily_metrics")
            .select("trade_date,close_price")
            .eq("domain_id", domain_id)
            .not_.is_("close_price", "null")
            .order("trade_date", desc=False)
            .range(offset, offset + PAGE - 1)
            .execute()
            .data
        )
        if not data:
            break
        rows.extend((r["trade_date"], float(r["close_price"])) for r in data)
        if len(data) < PAGE:
            break
        offset += PAGE
    return rows


def compute_ma200_deviation(entries: list[tuple[str, float]]) -> list[tuple[str, float]]:
    """200日MA乖離率を算出。データ不足の行は除外して返す。"""
    if len(entries) < MA200:
        return []
    dates = [e[0] for e in entries]
    closes = [e[1] for e in entries]
    s = pd.Series(closes, index=pd.to_datetime(dates))
    ma = s.rolling(window=MA200, min_periods=MA200).mean()
    dev = (s - ma) / ma * 100.0
    return [
        (d.strftime("%Y-%m-%d"), round(float(v), 4))
        for d, v in zip(dev.index, dev.values)
        if not pd.isna(v)
    ]


def upsert_batch(client, records: list[dict]) -> None:
    for i in range(0, len(records), BATCH):
        client.table("daily_metrics").upsert(
            records[i : i + BATCH], on_conflict="domain_id,trade_date"
        ).execute()


def main() -> None:
    if not settings.has_supabase:
        print("SUPABASE_URL/KEY が未設定")
        sys.exit(1)

    client = create_client(settings.supabase_url, settings.supabase_key)

    # 全ドメイン ID 取得
    domains = client.table("domains").select("id").execute().data
    domain_ids = [d["id"] for d in domains]
    print(f"ドメイン数: {len(domain_ids)}")

    all_records: list[dict] = []
    for i, domain_id in enumerate(domain_ids, 1):
        entries = fetch_domain_closes(client, domain_id)
        devs = compute_ma200_deviation(entries)
        for trade_date, dev in devs:
            all_records.append({
                "domain_id": domain_id,
                "trade_date": trade_date,
                "ma200_deviation": dev,
            })
        if i % 20 == 0 or i == len(domain_ids):
            print(f"  計算済み: {i}/{len(domain_ids)} ({len(all_records)}行蓄積)")

    print(f"\nupsert 対象: {len(all_records)}行")
    upsert_batch(client, all_records)
    print(f"完了: {len(all_records)}行を更新しました。")


if __name__ == "__main__":
    main()
