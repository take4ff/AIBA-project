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


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    log = logging.getLogger("aiba.run")

    domains = load_domains()
    log.info("監視ドメイン数: %d / Supabase=%s", len(domains), settings.has_supabase)

    upsert_domains(domains_master(domains))

    records = run_pipeline(domains)
    if not records:
        log.error("有効なレコードが0件でした。書き込みを中止します。")
        return 1

    message = write_metrics(records)
    log.info(message)
    log.info("完了: %d件のAIBAスコアを記録しました。", len(records))
    return 0


if __name__ == "__main__":
    sys.exit(main())
