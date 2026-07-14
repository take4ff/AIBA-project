#!/usr/bin/env python3
"""テーマ別の大衆注目度（Wikipedia 日次閲覧数）を theme_attention に保存する日次ジョブ。

Wikimedia Pageviews API（無料・キー不要・要User-Agent）から targets.yaml の
wikipedia_articles の日次閲覧数を取得し、テーマ合計の「90日中央値に対する
直近7日平均の相対水準」を attention_score (0-100, 50=平常) として保存する。

センチメント（GitHub/arXiv等＝研究者・開発者の熱）と対になる「一般大衆の関心」。
水準指標のため AIBA スコアには混ぜず、表示専用（news_tone と同じ扱い）。
毎回約240日分を取得して期間内の全日を再計算・Upsertするため、初回実行で
約5ヶ月分の履歴が入り、以降は日次で末尾が伸びていく（冪等）。
"""
from __future__ import annotations

import logging
import time
from datetime import date, timedelta
from math import log2
from statistics import median
from urllib.parse import quote

import requests

from aiba.config import load_domains, settings

log = logging.getLogger("aiba.attention")

API = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/{article}/daily/{start}/{end}"
# Wikimedia のポリシーで連絡先入りUAが必須（無いと403になり得る）
HEADERS = {"User-Agent": "AIBA-dashboard/1.0 (https://github.com/take4ff/AIBA-project)"}

FETCH_DAYS = 240      # 取得期間（基準線90日＋履歴150日分）
BASELINE_DAYS = 90    # 平常水準とみなす中央値の窓
RECENT_DAYS = 7       # 直近平均の窓（曜日効果を均す）


def fetch_article_views(article: str, start: date, end: date) -> dict[str, int]:
    """記事1本の日次閲覧数を {YYYY-MM-DD: views} で返す。

    Pageviews API は404レスポンスをURI単位でエッジキャッシュするため、正しい記事名でも
    一時的な404が同一URLで返り続けることがある。開始日を1日ずつずらして（=別URI）
    最大3回リトライし、それでも404なら記事名誤りとみなして空を返す。
    """
    last_err: str | None = None
    for shift in range(4):
        url = API.format(
            article=quote(article.replace(" ", "_"), safe=""),
            start=(start + timedelta(days=shift)).strftime("%Y%m%d00"),
            end=end.strftime("%Y%m%d00"),
        )
        try:
            r = requests.get(url, headers=HEADERS, timeout=30)
            if r.status_code == 404:
                last_err = "404"
                continue
            r.raise_for_status()
            out: dict[str, int] = {}
            for item in r.json().get("items", []):
                ts = item["timestamp"]  # YYYYMMDD00
                out[f"{ts[0:4]}-{ts[4:6]}-{ts[6:8]}"] = int(item.get("views") or 0)
            return out
        except requests.RequestException as e:
            last_err = str(e)
    log.warning("取得失敗（記事名誤りの可能性）: %s (%s)", article, last_err)
    return {}


def theme_daily_views(articles: list[str], start: date, end: date) -> dict[str, int]:
    """テーマ内全記事の日次合計。記事間で日付が欠ける場合は取得できた分だけ合算。"""
    total: dict[str, int] = {}
    for a in articles:
        for d, v in fetch_article_views(a, start, end).items():
            total[d] = total.get(d, 0) + v
        time.sleep(0.2)  # 儀礼的スロットル（公式上限 100 req/s より十分下）
    return total


def score_series(daily: dict[str, int]) -> list[tuple[str, int, float]]:
    """(date, pageviews, attention_score) のリスト。

    score = clamp(0, 100, 50 + 25 * log2(直近7日平均 / 過去90日中央値))
    → 平常=50、2倍=75、4倍=100、半減=25。log で重い裾を圧縮する。
    """
    dates = sorted(daily)
    out: list[tuple[str, int, float]] = []
    for i, d in enumerate(dates):
        if i + 1 < BASELINE_DAYS:  # 基準線が組めるまでスキップ
            continue
        base_win = [daily[x] for x in dates[i + 1 - BASELINE_DAYS: i + 1]]
        recent_win = [daily[x] for x in dates[max(0, i + 1 - RECENT_DAYS): i + 1]]
        base = median(base_win)
        recent = sum(recent_win) / len(recent_win)
        if base <= 0:
            continue
        score = max(0.0, min(100.0, 50.0 + 25.0 * log2(max(recent, 1.0) / base)))
        out.append((d, daily[d], round(score, 2)))
    return out


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not settings.has_supabase:
        raise SystemExit("Supabase 未設定。")
    from supabase import create_client
    client = create_client(settings.supabase_url, settings.supabase_key)

    # テーマごとの記事リスト（テーマ共通なので初出ドメインの値を使う）
    articles_by_theme: dict[str, list[str]] = {}
    for d in load_domains():
        if d.wikipedia_articles:
            articles_by_theme.setdefault(d.theme_id, d.wikipedia_articles)

    end = date.today() - timedelta(days=1)  # Pageviews は1日程度遅延するため前日まで
    start = end - timedelta(days=FETCH_DAYS)

    total_rows = 0
    for tid, articles in articles_by_theme.items():
        daily = theme_daily_views(articles, start, end)
        rows = [
            {"theme_id": tid, "obs_date": d, "pageviews": pv, "attention_score": sc}
            for d, pv, sc in score_series(daily)
        ]
        if rows:
            client.table("theme_attention").upsert(rows, on_conflict="theme_id,obs_date").execute()
            log.info("[%s] %d日分を保存（最新 %s = %.1f）", tid, len(rows), rows[-1]["obs_date"], rows[-1]["attention_score"])
            total_rows += len(rows)
        else:
            log.warning("[%s] データなし（記事名 %s を確認）", tid, articles)

    log.info("完了: %d テーマ / %d 行を保存しました。", len(articles_by_theme), total_rows)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
