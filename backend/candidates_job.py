#!/usr/bin/env python3
"""新興テーマ候補の研究熱量を実測して保存するジョブ。

config/targets.yaml の candidates: 各件について、キーワードのセンチメント熱量
（GitHub/arXiv/Hacker News/Google Trends の増加率の平均）を算出し、
candidate_themes テーブルへ upsert する。フロント /themes が熱量順に表示。

熱量 50=横ばい / 50超=研究活動が加速（＝これから伸びてきそう）。
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from aiba.config import load_candidates, settings
from aiba.sentiment import fetch_sentiment

log = logging.getLogger("aiba.candidates")


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not settings.has_supabase:
        raise SystemExit("Supabaseが未設定です。.env を確認してください。")

    candidates = load_candidates()
    if not candidates:
        log.info("候補がありません。")
        return 0

    from supabase import create_client
    client = create_client(settings.supabase_url, settings.supabase_key)
    now = datetime.now(timezone.utc).isoformat()

    rows = []
    for c in candidates:
        # キーワードは自然言語。GitHub/arXiv 双方の検索に流用する。
        snap = fetch_sentiment(c.keywords, c.keywords)
        heat = 50.0 if snap.sentiment_score is None else snap.sentiment_score  # 信号不足は中立
        log.info("[%s] 熱量=%.2f", c.id, heat)
        rows.append({
            "candidate_id": c.id, "name": c.name, "keywords": c.keywords,
            "heat_score": round(heat, 2), "updated_at": now,
        })

    client.table("candidate_themes").upsert(rows, on_conflict="candidate_id").execute()
    log.info("完了: %d 件の候補熱量を保存しました。", len(rows))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
