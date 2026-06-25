#!/usr/bin/env python3
"""過去データのバックフィル。

テクニカル指標は yfinance の履歴から日次で完全に再構築する。
センチメントはテーマ単位で一定間隔(既定30日)の各時点(as_of)を算出し、
同テーマの全地域(global/us/jp)で共有しつつ、間の日付には前方補完する。

使い方:
    python backfill.py --months 6                 # 全ドメイン・過去6ヶ月
    python backfill.py --since 2025-01-01          # 暦の期間を明示（2025年〜今日）
    python backfill.py --since 2025-01-01 --until 2025-12-31  # 2025年だけ
    python backfill.py --months 3 --only quantum_computing   # テーマ指定
    python backfill.py --since 2025-01-01 --sentiment-every-days 14
    python backfill.py --since 2025-01-01 --no-sentiment  # テクニカルのみ高速
"""
from __future__ import annotations

import argparse
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from aiba.config import Domain, group_by_theme, load_domains, settings
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
    theme_id: str, gh_kw: list[str], ax_kw: list[str],
    start: date, end: date, cadence_days: int, enabled: bool,
) -> list[tuple[date, SentimentSnapshot]]:
    """テーマのセンチメント・アンカー時系列を作る（各アンカーで as_of 算出）。"""
    if not enabled:
        return [(start, NEUTRAL_SENT)]

    anchors: list[date] = []
    cur = start
    while cur <= end:
        anchors.append(cur)
        cur += timedelta(days=cadence_days)
    if anchors[-1] != end:
        anchors.append(end)

    from dataclasses import replace

    timeline: list[tuple[date, SentimentSnapshot]] = []
    prev = NEUTRAL_SENT.sentiment_score  # 直前アンカーの統合値（forward-fill用）
    for i, a in enumerate(anchors, 1):
        log.info("  [%s] センチメント %d/%d (as_of=%s)", theme_id, i, len(anchors), a)
        snap = fetch_sentiment(gh_kw, ax_kw, as_of=_to_utc(a))
        if snap.sentiment_score is None:  # 有効信号不足 → 直前アンカー値で補完
            snap = replace(snap, sentiment_score=prev)
        prev = snap.sentiment_score
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


def backfill_region(
    domain: Domain, fetch_months: int, window: tuple[date, date],
    timeline: list[tuple[date, SentimentSnapshot]],
) -> list[dict[str, Any]]:
    snaps: list[TechnicalSnapshot] = fetch_technical_history(domain.ticker, fetch_months)
    if not snaps:
        log.warning("[%s] 価格履歴が取得できませんでした。スキップ。", domain.id)
        return []

    since, until = window
    snaps = [s for s in snaps if since <= s.trade_date <= until]
    if not snaps:
        return []

    log.info("[%s] %d日分を再構築（%s〜%s）",
             domain.id, len(snaps), snaps[0].trade_date, snaps[-1].trade_date)

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
            "ma200_deviation": s.ma200_deviation,
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
    ap.add_argument("--months", type=int, default=6,
                    help="今日から遡る月数（--since 指定時は無視）")
    ap.add_argument("--since", type=str, default=None,
                    help="開始日 YYYY-MM-DD（例: 2025-01-01。暦の期間を明示指定）")
    ap.add_argument("--until", type=str, default=None,
                    help="終了日 YYYY-MM-DD（既定: 今日）")
    ap.add_argument("--sentiment-every-days", type=int, default=30)
    ap.add_argument("--no-sentiment", action="store_true",
                    help="センチメントを取得せず中立(50)で埋める（高速）")
    ap.add_argument("--only", type=str, default=None, help="特定テーマIDのみ")
    args = ap.parse_args()

    domains = load_domains()
    if args.only:
        domains = [d for d in domains if d.theme_id == args.only]
        if not domains:
            raise SystemExit(f"テーマが見つかりません: {args.only}")

    upsert_domains(domains_master(domains))

    # 対象期間の決定：--since 指定なら暦の明示範囲、なければ今日から --months ヶ月
    today = date.today()
    until = date.fromisoformat(args.until) if args.until else today
    if args.since:
        since = date.fromisoformat(args.since)
    else:
        since = today - timedelta(days=args.months * 31)
    if since > until:
        raise SystemExit(f"--since ({since}) が --until ({until}) より後です。")

    # yfinance は今日を終点に遡るため、since に届くだけの月数を確保して取得後に窓で絞る
    fetch_months = max(args.months, (today - since).days // 31 + 2)
    window = (since, until)
    log.info("対象期間: %s 〜 %s（取得 %dヶ月分から抽出）", since, until, fetch_months)

    total = 0
    for theme_id, group in group_by_theme(domains).items():
        # センチメントはテーマで1回だけ算出し、全地域で共有
        timeline = build_sentiment_timeline(
            theme_id, group[0].github_keywords, group[0].arxiv_keywords,
            since, until, args.sentiment_every_days, not args.no_sentiment,
        )
        for domain in group:
            records = backfill_region(domain, fetch_months, window, timeline)
            if records:
                write_batched(records)
                total += len(records)
    log.info("完了: 合計 %d 件をバックフィルしました。", total)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
