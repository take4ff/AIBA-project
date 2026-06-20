#!/usr/bin/env python3
"""テーマ別ニュース論調（GDELT 平均トーン）を theme_news_tone に保存する週次ジョブ。

トーンは「水準」（増加率でない）ため AIBAスコアには混ぜず、表示専用の独立指標。
日々大きく変わらないため週1回（candidates_job と同じ週次）で更新する。
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from aiba.config import load_domains, settings
from aiba.sentiment import fetch_news_tone

log = logging.getLogger("aiba.news_tone")


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not settings.has_supabase:
        raise SystemExit("Supabase 未設定。")
    from supabase import create_client
    client = create_client(settings.supabase_url, settings.supabase_key)

    # テーマごとのニュース用キーワード（gdelt_keywords 優先、なければ arxiv_keywords）
    kw_by_theme: dict[str, list[str]] = {}
    for d in load_domains():
        kw_by_theme.setdefault(d.theme_id, d.gdelt_keywords or d.arxiv_keywords)

    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for tid, kw in kw_by_theme.items():
        tone = fetch_news_tone(kw)  # 取得不可は None
        log.info("[%s] tone=%s", tid, tone)
        rows.append({"theme_id": tid, "tone": tone, "updated_at": now})

    if rows:
        client.table("theme_news_tone").upsert(rows, on_conflict="theme_id").execute()
    log.info("完了: %d テーマのトーンを保存しました。", len(rows))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
