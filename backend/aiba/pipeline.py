"""日次パイプライン本体。

センチメント（GitHub/arXiv）はテーマ単位で1回だけ取得し、同テーマの
全地域（global/us/jp）で共有する。テクニカルは地域ごとに取得する。
  1. テーマごとにセンチメント指標を取得 (GitHub / arXiv)
  2. 地域ごとにテクニカル指標を取得 (yfinance)
  3. AIBAスコアを算出
  4. 日次サマリーのレコードを構築
"""
from __future__ import annotations

import logging
from dataclasses import replace
from typing import Any

from .config import Domain, group_by_theme, load_domains
from .score import compute_aiba_score
from .sentiment import NEUTRAL, SentimentSnapshot, fetch_sentiment
from .technical import fetch_technical

logger = logging.getLogger("aiba.pipeline")


def process_domain(domain: Domain, sent: SentimentSnapshot) -> dict[str, Any] | None:
    """1ドメイン（テーマ×地域）を処理しレコードを返す。失敗時 None。"""
    logger.info("[%s] テクニカル指標を取得中 (%s)", domain.id, domain.ticker)
    tech = fetch_technical(domain.ticker)
    if tech is None:
        logger.warning("[%s] テクニカル指標の取得に失敗。スキップします。", domain.id)
        return None

    result = compute_aiba_score(domain.layer, tech, sent)
    logger.info(
        "[%s] AIBA=%.2f (tech=%.2f, sent=%.2f, RSI=%.1f)",
        domain.id, result.aiba_score, result.technical_score,
        result.sentiment_score, tech.rsi_14,
    )

    return {
        "domain_id": domain.id,
        "trade_date": tech.trade_date,
        "close_price": tech.close_price,
        "volume": tech.volume,
        "rsi_14": tech.rsi_14,
        "ma_deviation": tech.ma_deviation,
        "github_score": sent.github_score,
        "arxiv_score": sent.arxiv_score,
        "sentiment_score": result.sentiment_score,
        "technical_score": result.technical_score,
        "aiba_score": result.aiba_score,
    }


def run_pipeline(
    domains: list[Domain] | None = None,
    last_sentiment: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    """全ドメインを処理してレコードのリストを返す。

    last_sentiment: テーマ別の直近センチメント（forward-fill用）。当日の有効信号が
    少なすぎて統合値が None になった場合に、この前回値で埋める（無ければ中立50）。
    """
    if domains is None:
        domains = load_domains()
    last_sentiment = last_sentiment or {}

    records: list[dict[str, Any]] = []
    for theme_id, group in group_by_theme(domains).items():
        # センチメントはテーマで1回だけ取得して地域間で共有
        logger.info("[%s] センチメント指標を取得中（地域共通）", theme_id)
        sent = fetch_sentiment(group[0].github_keywords, group[0].arxiv_keywords)
        if sent.sentiment_score is None:  # 有効信号<MIN_SIGNALS → 前回値でフォワードフィル
            ff = last_sentiment.get(theme_id, NEUTRAL)
            logger.warning("[%s] 有効信号が不足。センチメントを前回値 %.2f で補完", theme_id, ff)
            sent = replace(sent, sentiment_score=ff)
        for domain in group:
            try:
                record = process_domain(domain, sent)
            except Exception:  # 1ドメインの失敗で全体を止めない
                logger.exception("[%s] 処理中に予期せぬエラー", domain.id)
                continue
            if record is not None:
                records.append(record)
    return records


def domains_master(domains: list[Domain]) -> list[dict[str, Any]]:
    """domainsマスタ用のレコードを生成する。"""
    return [
        {"id": d.id, "name": d.name, "layer": d.layer, "ticker": d.ticker}
        for d in domains
    ]
