"""センチメント指標の取得・算出（先行データ）。

「水面下の研究開発の熱量」を、ある基準日(as_of)を終点とする直近30日と
その前30日の活動量の比（増加率）で捉える。
  - GitHub: キーワードに合致する新規リポジトリ数の増加率
  - arXiv : キーワードに合致する新規論文数の増加率（submittedDate範囲）

as_of を指定すれば過去日付のセンチメントも再構築できる（バックフィル用）。
外部API障害やトークン未設定時は中立値(50)へフォールバックする。
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from xml.etree import ElementTree as ET

import requests

from .config import settings

WINDOW_DAYS = 30
GITHUB_SEARCH_URL = "https://api.github.com/search/repositories"
ARXIV_API_URL = "http://export.arxiv.org/api/query"
HN_SEARCH_URL = "https://hn.algolia.com/api/v1/search"
REQUEST_TIMEOUT = 20
NEUTRAL = 50.0
_OS_NS = "{http://a9.com/-/spec/opensearch/1.1/}"


@dataclass
class SentimentSnapshot:
    github_score: float   # 0-100（増加率ベース）
    arxiv_score: float    # 0-100（増加率ベース）
    sentiment_score: float  # 統合 0-100
    hackernews_score: float = NEUTRAL  # 0-100（HNストーリー増加率）


def _growth_to_score(recent: int, prior: int) -> float:
    """直近件数 / 前期件数 の比を 0-100 のスコアへ写像する。

    比 1.0（横ばい）→ 50、増加で 50超、減少で 50未満。
    log比をロジスティック関数に通して滑らかに正規化する。
    """
    ratio = (recent + 1) / (prior + 1)  # ラプラススムージングでゼロ割回避
    x = math.log(ratio)
    score = 100.0 / (1.0 + math.exp(-1.5 * x))  # 比≈2倍で約75点
    return round(score, 4)


def _windows(as_of: datetime | None) -> tuple[datetime, datetime, datetime]:
    """(2期前の開始, 期の境界, 基準日) を返す。"""
    base = as_of or datetime.now(timezone.utc)
    if base.tzinfo is None:
        base = base.replace(tzinfo=timezone.utc)
    mid = base - timedelta(days=WINDOW_DAYS)
    start = base - timedelta(days=WINDOW_DAYS * 2)
    return start, mid, base


# ----------------------------- GitHub -----------------------------
def _github_count(keyword: str, since: datetime, until: datetime) -> int | None:
    headers = {"Accept": "application/vnd.github+json"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"

    query = f'{keyword} created:{since:%Y-%m-%d}..{until:%Y-%m-%d}'
    try:
        resp = requests.get(
            GITHUB_SEARCH_URL,
            headers=headers,
            params={"q": query, "per_page": 1},
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            return None
        return int(resp.json().get("total_count", 0))
    except (requests.RequestException, ValueError):
        return None


def fetch_github_score(keywords: list[str], as_of: datetime | None = None) -> float:
    if not keywords:
        return NEUTRAL
    start, mid, base = _windows(as_of)

    recent_total = prior_total = 0
    ok = False
    for kw in keywords:
        recent = _github_count(kw, mid, base)
        prior = _github_count(kw, start, mid)
        time.sleep(0.5 if settings.github_token else 2)
        if recent is None or prior is None:
            continue
        recent_total += recent
        prior_total += prior
        ok = True

    return _growth_to_score(recent_total, prior_total) if ok else NEUTRAL


# ----------------------------- arXiv -----------------------------
def _arxiv_total(keyword: str, since: datetime, until: datetime) -> int | None:
    """submittedDate範囲に合致する論文総数を totalResults から取得する。"""
    query = (
        f'all:"{keyword}" AND '
        f'submittedDate:[{since:%Y%m%d%H%M} TO {until:%Y%m%d%H%M}]'
    )
    try:
        resp = requests.get(
            ARXIV_API_URL,
            params={"search_query": query, "start": 0, "max_results": 1},
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            return None
        root = ET.fromstring(resp.text)
    except (requests.RequestException, ET.ParseError):
        return None

    node = root.find(f"{_OS_NS}totalResults")
    if node is None or not node.text:
        return None
    try:
        return int(node.text)
    except ValueError:
        return None


def fetch_arxiv_score(keywords: list[str], as_of: datetime | None = None) -> float:
    if not keywords:
        return NEUTRAL
    start, mid, base = _windows(as_of)

    recent_total = prior_total = 0
    ok = False
    for kw in keywords:
        recent = _arxiv_total(kw, mid, base)
        time.sleep(3)  # arXiv API は3秒間隔のアクセスを推奨
        prior = _arxiv_total(kw, start, mid)
        time.sleep(3)
        if recent is None or prior is None:
            continue
        recent_total += recent
        prior_total += prior
        ok = True

    return _growth_to_score(recent_total, prior_total) if ok else NEUTRAL


# ----------------------------- Hacker News -----------------------------
def _hn_count(keyword: str, since: datetime, until: datetime) -> int | None:
    """期間内に投稿されたHNストーリー数を nbHits から取得する。"""
    params = {
        "query": keyword,
        "tags": "story",
        "numericFilters": f"created_at_i>{int(since.timestamp())},created_at_i<{int(until.timestamp())}",
        "hitsPerPage": 0,
    }
    try:
        resp = requests.get(HN_SEARCH_URL, params=params, timeout=REQUEST_TIMEOUT)
        if resp.status_code != 200:
            return None
        return int(resp.json().get("nbHits", 0))
    except (requests.RequestException, ValueError):
        return None


def fetch_hackernews_score(keywords: list[str], as_of: datetime | None = None) -> float:
    """キーワード群のHacker News熱量（新規ストーリー増加率）を算出する。"""
    if not keywords:
        return NEUTRAL
    start, mid, base = _windows(as_of)

    recent_total = prior_total = 0
    ok = False
    for kw in keywords:
        recent = _hn_count(kw, mid, base)
        prior = _hn_count(kw, start, mid)
        time.sleep(0.3)  # Algoliaは寛容だが礼儀として軽く待つ
        if recent is None or prior is None:
            continue
        recent_total += recent
        prior_total += prior
        ok = True

    return _growth_to_score(recent_total, prior_total) if ok else NEUTRAL


def fetch_sentiment(
    github_keywords: list[str],
    arxiv_keywords: list[str],
    as_of: datetime | None = None,
) -> SentimentSnapshot:
    """GitHub・arXiv・Hacker News の熱量を統合したスナップショットを返す。

    HN はタイトルが自然文のため arxiv_keywords（自然言語）を流用する。
    """
    gh = fetch_github_score(github_keywords, as_of)
    ax = fetch_arxiv_score(arxiv_keywords, as_of)
    hn = fetch_hackernews_score(arxiv_keywords, as_of)
    combined = round((gh + ax + hn) / 3.0, 2)
    return SentimentSnapshot(
        github_score=gh, arxiv_score=ax, sentiment_score=combined, hackernews_score=hn,
    )
