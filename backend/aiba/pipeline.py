"""日次パイプライン本体。

各ドメインについて
  1. テクニカル指標を取得 (yfinance)
  2. センチメント指標を取得 (GitHub / arXiv)
  3. AIBAスコアを算出
  4. 日次サマリーを構築
を行い、DB書き込み用レコードのリストを返す。
"""
from __future__ import annotations

import logging
from typing import Any

from .config import Domain, load_domains
from .score import compute_aiba_score
from .sentiment import fetch_sentiment
from .technical import fetch_technical

logger = logging.getLogger("aiba.pipeline")


def process_domain(domain: Domain) -> dict[str, Any] | None:
    """1ドメインを処理し、日次サマリーのレコードを返す。失敗時 None。"""
    logger.info("[%s] テクニカル指標を取得中 (%s)", domain.id, domain.ticker)
    tech = fetch_technical(domain.ticker)
    if tech is None:
        logger.warning("[%s] テクニカル指標の取得に失敗。スキップします。", domain.id)
        return None

    logger.info("[%s] センチメント指標を取得中", domain.id)
    sent = fetch_sentiment(domain.github_keywords, domain.arxiv_keywords)

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


def run_pipeline(domains: list[Domain] | None = None) -> list[dict[str, Any]]:
    """全ドメインを処理してレコードのリストを返す。"""
    if domains is None:
        domains = load_domains()

    records: list[dict[str, Any]] = []
    for domain in domains:
        try:
            record = process_domain(domain)
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
