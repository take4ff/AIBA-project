"""センチメント指標の取得・算出（先行データ）。

「水面下の研究開発の熱量」を、直近30日と前30日の活動量の比（増加率）で捉える。
  - GitHub: キーワードに合致する新規リポジトリ数の増加率
  - arXiv : キーワードに合致する新規論文数の増加率

外部API障害やトークン未設定時は中立値(50)へフォールバックし、
パイプライン全体が落ちないようにする。
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
REQUEST_TIMEOUT = 20
NEUTRAL = 50.0


@dataclass
class SentimentSnapshot:
    github_score: float   # 0-100（増加率ベース）
    arxiv_score: float    # 0-100（増加率ベース）
    sentiment_score: float  # 統合 0-100


def _growth_to_score(recent: int, prior: int) -> float:
    """直近件数 / 前期件数 の比を 0-100 のスコアへ写像する。

    比 1.0（横ばい）→ 50、増加で 50超、減少で 50未満。
    log比をロジスティック関数に通して滑らかに正規化する。
    """
    # ゼロ割回避のため両者に1を加える（ラプラススムージング）
    ratio = (recent + 1) / (prior + 1)
    x = math.log(ratio)
    # 係数1.5: 比が約e^(0.7)≈2倍で約75点になる感度
    score = 100.0 / (1.0 + math.exp(-1.5 * x))
    return round(score, 4)


def _date_str(days_ago: int) -> str:
    d = datetime.now(timezone.utc) - timedelta(days=days_ago)
    return d.strftime("%Y-%m-%d")


def _github_count(keyword: str, since: str, until: str) -> int | None:
    """指定期間に作成されたリポジトリ件数を返す。失敗時 None。"""
    headers = {"Accept": "application/vnd.github+json"}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"

    query = f'{keyword} created:{since}..{until}'
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


def fetch_github_score(keywords: list[str]) -> float:
    """キーワード群のGitHub熱量（新規リポジトリ増加率）を算出する。"""
    if not keywords:
        return NEUTRAL

    now = _date_str(0)
    mid = _date_str(WINDOW_DAYS)
    start = _date_str(WINDOW_DAYS * 2)

    recent_total = 0
    prior_total = 0
    ok = False
    for kw in keywords:
        recent = _github_count(kw, mid, now)
        prior = _github_count(kw, start, mid)
        # GitHub Search APIのレート制限(未認証10req/min)に配慮
        time.sleep(2 if not settings.github_token else 0.5)
        if recent is None or prior is None:
            continue
        recent_total += recent
        prior_total += prior
        ok = True

    if not ok:
        return NEUTRAL
    return _growth_to_score(recent_total, prior_total)


def _arxiv_recent_dates(keyword: str, max_results: int = 100) -> list[datetime]:
    """キーワードに合致する最新論文の投稿日リストを返す。失敗時 空リスト。"""
    query = f'all:"{keyword}"'
    params = {
        "search_query": query,
        "sortBy": "submittedDate",
        "sortOrder": "descending",
        "start": 0,
        "max_results": max_results,
    }
    try:
        resp = requests.get(ARXIV_API_URL, params=params, timeout=REQUEST_TIMEOUT)
        if resp.status_code != 200:
            return []
        root = ET.fromstring(resp.text)
    except (requests.RequestException, ET.ParseError):
        return []

    ns = {"atom": "http://www.w3.org/2005/Atom"}
    dates: list[datetime] = []
    for entry in root.findall("atom:entry", ns):
        pub = entry.find("atom:published", ns)
        if pub is None or not pub.text:
            continue
        try:
            dates.append(datetime.fromisoformat(pub.text.replace("Z", "+00:00")))
        except ValueError:
            continue
    return dates


def fetch_arxiv_score(keywords: list[str]) -> float:
    """キーワード群のarXiv熱量（新規論文増加率）を算出する。"""
    if not keywords:
        return NEUTRAL

    now = datetime.now(timezone.utc)
    mid = now - timedelta(days=WINDOW_DAYS)
    start = now - timedelta(days=WINDOW_DAYS * 2)

    recent_total = 0
    prior_total = 0
    ok = False
    for kw in keywords:
        dates = _arxiv_recent_dates(kw)
        time.sleep(3)  # arXiv API は3秒間隔のアクセスを推奨
        if not dates:
            continue
        recent_total += sum(1 for d in dates if d >= mid)
        prior_total += sum(1 for d in dates if start <= d < mid)
        ok = True

    if not ok:
        return NEUTRAL
    return _growth_to_score(recent_total, prior_total)


def fetch_sentiment(github_keywords: list[str], arxiv_keywords: list[str]) -> SentimentSnapshot:
    """GitHub・arXivの熱量を統合したセンチメントスナップショットを返す。"""
    gh = fetch_github_score(github_keywords)
    ax = fetch_arxiv_score(arxiv_keywords)
    # 統合は単純平均（重み付けは score.py の層別ロジックで吸収）
    combined = round((gh + ax) / 2.0, 2)
    return SentimentSnapshot(github_score=gh, arxiv_score=ax, sentiment_score=combined)
