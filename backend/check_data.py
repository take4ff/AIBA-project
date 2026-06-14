#!/usr/bin/env python3
"""日次バッチ後のデータ品質チェック。

異常を検知したら非ゼロ終了し、GitHub Actions を失敗させる
（→ 標準の失敗通知メール／任意のSlack通知で気づける）。

検査:
  1. 鮮度      : daily_metrics の最新取引日が古すぎないか
  2. カバレッジ : 直近データのあるドメイン数が十分か
  3. センチメント: 全ドメインが中立(50)一律＝API一括失敗していないか（警告）
  4. 予測      : 直近の predictions が存在するか
  5. ポートフォリオ: 直近の portfolio_metrics が存在するか
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

from aiba.config import load_domains, settings

log = logging.getLogger("aiba.check")

MAX_STALE_DAYS = 5        # 最新取引日がこれより古いと異常（休場考慮）
RECENT_WINDOW_DAYS = 7    # 「直近」とみなす日数
MIN_MISSING_ALLOWED = 3   # 直近データ欠落を許容するドメイン数


def _recent_iso(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not settings.has_supabase:
        log.error("Supabase 未設定。チェックを実行できません。")
        return 1
    from supabase import create_client
    c = create_client(settings.supabase_url, settings.supabase_key)

    errors: list[str] = []
    warnings: list[str] = []

    domains = load_domains()
    expected = len(domains)

    # 1. 鮮度: 最新取引日
    latest = c.table("daily_metrics").select("trade_date").order(
        "trade_date", desc=True).limit(1).execute().data
    if not latest:
        errors.append("daily_metrics が空です。")
    else:
        latest_date = date.fromisoformat(latest[0]["trade_date"])
        stale = (date.today() - latest_date).days
        log.info("最新取引日: %s（%d日前）", latest_date, stale)
        if stale > MAX_STALE_DAYS:
            errors.append(f"データが古い: 最新 {latest_date}（{stale}日前 > {MAX_STALE_DAYS}）")

    # 2. カバレッジ＆3. センチメント: 直近データ
    recent = c.table("daily_metrics").select(
        "domain_id,trade_date,sentiment_score").gte(
        "trade_date", _recent_iso(RECENT_WINDOW_DAYS)).execute().data
    seen = {r["domain_id"] for r in recent}
    missing = expected - len(seen)
    log.info("直近%d日でデータのあるドメイン: %d/%d", RECENT_WINDOW_DAYS, len(seen), expected)
    if missing > MIN_MISSING_ALLOWED:
        errors.append(f"直近データ欠落が多い: {missing}ドメイン（許容 {MIN_MISSING_ALLOWED}）")

    sents = {float(r["sentiment_score"]) for r in recent if r.get("sentiment_score") is not None}
    if recent and sents and sents == {50.0}:
        warnings.append("センチメントが全て50（一括フォールバック＝API失敗の可能性）。")

    # 4. 予測
    preds = c.table("predictions").select("id").gte(
        "as_of_date", _recent_iso(RECENT_WINDOW_DAYS)).limit(1).execute().data
    if not preds:
        errors.append("直近の predictions がありません。")

    # 5. ポートフォリオ（ユーザー保有がある場合のみ）
    holdings = c.table("user_holdings").select("ticker").limit(1).execute().data
    if holdings:
        tm = c.table("ticker_metrics").select("ticker").gte(
            "trade_date", _recent_iso(RECENT_WINDOW_DAYS)).limit(1).execute().data
        if not tm:
            warnings.append("保有銘柄があるのに直近の ticker_metrics がありません。")

    for w in warnings:
        log.warning("⚠️ %s", w)
    if errors:
        for e in errors:
            log.error("❌ %s", e)
        log.error("データ品質チェック: %d件の異常", len(errors))
        return 1
    log.info("✅ データ品質チェック: 異常なし（警告 %d件）", len(warnings))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
