#!/usr/bin/env python3
"""過去データのバックフィル。

テクニカル指標は yfinance の履歴から日次で完全に再構築する。
センチメントは負荷を抑えるため一定間隔(既定30日)で各時点(as_of)を算出し、
その間の日付には直近の値を前方補完する。

使い方:
    python backfill.py --months 6                 # 全ドメイン・過去6ヶ月
    python backfill.py --months 3 --only quantum_computing
    python backfill.py --months 6 --sentiment-every-days 14   # 隔週でセンチメント取得
    python backfill.py --months 6 --no-sentiment  # テクニカルのみ高速バックフィル
"""
from __future__ import annotations

import argparse
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from aiba.config import Domain, load_domains, settings
from aiba.db import _serialize, upsert_domains
from aiba.pipeline import domains_master
from aiba.score import compute_aiba_score
from aiba.sentiment import SentimentSnapshot, fetch_sentiment
from aiba.technical import TechnicalSnapshot, fetch_technical_history

log = logging.getLogger("aiba.backfill")
NEUTRAL_SENT = SentimentSnapshot(50.0, 50.0, 50.0)
BATCH = 200


def _to_utc(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, 23, 59, tzinfo=timezone.utc)


def build_sentiment_timeline(
    domain: Domain, dates: list[date], cadence_days: int, enabled: bool
) -> list[tuple[date, SentimentSnapshot]]:
    """センチメントのアンカー時系列を作る（各アンカーで as_of 算出）。"""
    if not enabled or not dates:
        return [(dates[0], NEUTRAL_SENT)] if dates else []

    anchors: list[date] = []
    cur = dates[0]
    while cur <= dates[-1]:
        anchors.append(cur)
        cur += timedelta(days=cadence_days)
    if anchors[-1] != dates[-1]:
        anchors.append(dates[-1])

    timeline: list[tuple[date, SentimentSnapshot]] = []
    for i, a in enumerate(anchors, 1):
        log.info("  [%s] センチメント %d/%d (as_of=%s)", domain.id, i, len(anchors), a)
        snap = fetch_sentiment(domain.github_keywords, domain.arxiv_keywords, as_of=_to_utc(a))
        timeline.append((a, snap))
    return timeline


def sentiment_for(d: date, timeline: list[tuple[date, SentimentSnapshot]]) -> SentimentSnapshot:
    """日付 d に対し、d以前で最も新しいアンカーのセンチメントを返す（前方補完）。"""
    chosen = timeline[0][1]
    for a, snap in timeline:
        if a <= d:
            chosen = snap
        else:
            break
    return chosen


def backfill_domain(
    domain: Domain, months: int, cadence_days: int, sentiment_enabled: bool
) -> list[dict[str, Any]]:
    snaps: list[TechnicalSnapshot] = fetch_technical_history(domain.ticker, months)
    if not snaps:
        log.warning("[%s] 価格履歴が取得できませんでした。スキップ。", domain.id)
        return []

    # 直近 months ヶ月に絞る（ウォームアップ分を除外）
    cutoff = date.today() - timedelta(days=months * 31)
    snaps = [s for s in snaps if s.trade_date >= cutoff]
    if not snaps:
        return []

    dates = [s.trade_date for s in snaps]
    log.info("[%s] %d日分を再構築（%s〜%s）", domain.id, len(snaps), dates[0], dates[-1])

    timeline = build_sentiment_timeline(domain, dates, cadence_days, sentiment_enabled)

    records: list[dict[str, Any]] = []
    for s in snaps:
        sent = sentiment_for(s.trade_date, timeline)
        result = compute_aiba_score(domain.layer, s, sent)
        records.append({
            "domain_id": domain.id,
            "trade_date": s.trade_date,
            "close_price": s.close_price,
            "volume": s.volume,
            "rsi_14": s.rsi_14,
            "ma_deviation": s.ma_deviation,
            "github_score": sent.github_score,
            "arxiv_score": sent.arxiv_score,
            "sentiment_score": result.sentiment_score,
            "technical_score": result.technical_score,
            "aiba_score": result.aiba_score,
        })
    return records


def write_batched(records: list[dict[str, Any]]) -> None:
    if not settings.has_supabase:
        raise SystemExit("Supabaseが未設定です。バックフィルには .env の設定が必要です。")
    from supabase import create_client

    client = create_client(settings.supabase_url, settings.supabase_key)
    payload = [_serialize(r) for r in records]
    for i in range(0, len(payload), BATCH):
        chunk = payload[i:i + BATCH]
        client.table("daily_metrics").upsert(chunk, on_conflict="domain_id,trade_date").execute()
        log.info("  upsert %d〜%d / %d 件", i + 1, i + len(chunk), len(payload))


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--months", type=int, default=6)
    ap.add_argument("--sentiment-every-days", type=int, default=30)
    ap.add_argument("--no-sentiment", action="store_true",
                    help="センチメントを取得せず中立(50)で埋める（高速）")
    ap.add_argument("--only", type=str, default=None, help="特定ドメインIDのみ")
    args = ap.parse_args()

    domains = load_domains()
    if args.only:
        domains = [d for d in domains if d.id == args.only]
        if not domains:
            raise SystemExit(f"ドメインが見つかりません: {args.only}")

    upsert_domains(domains_master(domains))

    total = 0
    for domain in domains:
        records = backfill_domain(
            domain, args.months, args.sentiment_every_days, not args.no_sentiment
        )
        if records:
            write_batched(records)
            total += len(records)
    log.info("完了: 合計 %d 件をバックフィルしました。", total)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
