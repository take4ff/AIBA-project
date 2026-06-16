#!/usr/bin/env python3
"""日次バッチのエントリポイント。

GitHub Actions の cron から呼び出される。
  1. targets.yaml を読み込み
  2. domainsマスタを同期
  3. 全ドメインのAIBAスコアを算出
  4. daily_metrics へ書き込み（Supabase or ローカルJSON）
"""
from __future__ import annotations

import logging
import sys

from aiba.config import load_domains, settings
from aiba.db import upsert_domains, write_metrics
from aiba.pipeline import domains_master, run_pipeline


def _last_sentiment_by_theme(domains) -> dict[str, float]:
    """テーマ別の直近センチメント（非null）を取得する（forward-fill用）。"""
    if not settings.has_supabase:
        return {}
    from supabase import create_client

    client = create_client(settings.supabase_url, settings.supabase_key)
    dom2theme = {d.id: d.theme_id for d in domains}
    rows = (
        client.table("daily_metrics")
        .select("domain_id,trade_date,sentiment_score")
        .not_.is_("sentiment_score", "null")
        .order("trade_date", desc=True)
        .limit(2000)
        .execute()
        .data
        or []
    )
    out: dict[str, float] = {}
    for r in rows:  # trade_date 降順なのでテーマ初出が最新
        theme = dom2theme.get(r["domain_id"])
        if theme and theme not in out and r["sentiment_score"] is not None:
            out[theme] = float(r["sentiment_score"])
    return out


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    log = logging.getLogger("aiba.run")

    domains = load_domains()
    log.info("監視ドメイン数: %d / Supabase=%s", len(domains), settings.has_supabase)

    upsert_domains(domains_master(domains))

    last_sent = _last_sentiment_by_theme(domains)
    records = run_pipeline(domains, last_sentiment=last_sent)
    if not records:
        log.error("有効なレコードが0件でした。書き込みを中止します。")
        return 1

    message = write_metrics(records)
    log.info(message)
    log.info("完了: %d件のAIBAスコアを記録しました。", len(records))
    return 0


if __name__ == "__main__":
    sys.exit(main())
