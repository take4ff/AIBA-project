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
# EPO Open Patent Services（OAuth2）。トークン取得 → 公開特許の検索（CQL）。
OPS_AUTH_URL = "https://ops.epo.org/3.2/auth/accesstoken"
OPS_SEARCH_URL = "https://ops.epo.org/3.2/rest-services/published-data/search"
_OPS_DATA_NS = "{http://ops.epo.org}"
REQUEST_TIMEOUT = 20
NEUTRAL = 50.0
_OS_NS = "{http://a9.com/-/spec/opensearch/1.1/}"


# 統合時の重み。GitHub/arXiv は「研究熱量の本体」として高く、HN/Trends/特許/ニュースは
# ノイズが大きく単独支配しやすいため補助として低く扱う（単一ソース過大評価の抑制）。
WEIGHT_CORE = 1.0   # github / arxiv
WEIGHT_SUPP = 0.4   # hackernews / trends / patents / news
# 有効信号がこの数未満の日は統合値を出さず None（呼び出し側でフォワードフィル）。
MIN_SIGNALS = 2


@dataclass
class SentimentSnapshot:
    github_score: float | None   # 0-100（増加率ベース。取得不可は None）
    arxiv_score: float | None    # 0-100
    sentiment_score: float | None  # 統合 0-100（加重平均。有効信号<MIN_SIGNALS は None）
    hackernews_score: float | None = None  # 0-100（HN注目ストーリー増加率）
    trends_score: float | None = None      # 0-100（Google Trends 検索関心の増加率）
    patents_score: float | None = None     # 0-100（特許公開件数の増加率・EPO OPS）
    news_score: float | None = None        # 0-100（ニュース報道量の増加率・GDELT）


def _growth_to_score(recent: int, prior: int) -> float:
    """直近件数 / 前期件数 の比を 0-100 のスコアへ写像する。

    比 1.0（横ばい）→ 50、増加で 50超、減少で 50未満。
    log比をロジスティック関数に通して滑らかに正規化する。
    """
    ratio = (recent + 1) / (prior + 1)  # ラプラススムージングでゼロ割回避
    x = math.log(ratio)
    score = 100.0 / (1.0 + math.exp(-1.5 * x))  # 比≈2倍で約75点
    return round(score, 4)


# 増加率は母数が小さいと1〜2件の差で乱高下する（例: 直近2件 vs 前期0件→比3→84点）。
# 十分な活動量がある時のみ採用し、足りなければ None（＝信頼できない信号として除外）。
MIN_GROWTH_EVENTS = 10  # 直近+前期の合計がこれ未満なら除外
MIN_GROWTH_PRIOR = 2    # 前期がこれ未満（特に0件）だと比が爆発するため除外


def _growth_score_guarded(recent_total: int, prior_total: int, ok: bool) -> float | None:
    """十分なボリュームがある時だけ増加率スコアを返す。低ボリュームは None。"""
    if not ok:
        return None
    if recent_total + prior_total < MIN_GROWTH_EVENTS or prior_total < MIN_GROWTH_PRIOR:
        return None
    return _growth_to_score(recent_total, prior_total)


def _windows(as_of: datetime | None) -> tuple[datetime, datetime, datetime]:
    """(2期前の開始, 期の境界, 基準日) を返す。"""
    base = as_of or datetime.now(timezone.utc)
    if base.tzinfo is None:
        base = base.replace(tzinfo=timezone.utc)
    mid = base - timedelta(days=WINDOW_DAYS)
    start = base - timedelta(days=WINDOW_DAYS * 2)
    return start, mid, base


# ----------------------------- GitHub -----------------------------
GITHUB_COMMIT_URL = "https://api.github.com/search/commits"


def _gh_headers(commit: bool = False) -> dict[str, str]:
    accept = "application/vnd.github.cloak-preview+json" if commit else "application/vnd.github+json"
    headers = {"Accept": accept}
    if settings.github_token:
        headers["Authorization"] = f"Bearer {settings.github_token}"
    return headers


def _github_count(keyword: str, since: datetime, until: datetime) -> int | None:
    """期間内に作成された新規リポジトリ数。"""
    query = f'{keyword} created:{since:%Y-%m-%d}..{until:%Y-%m-%d}'
    try:
        resp = requests.get(GITHUB_SEARCH_URL, headers=_gh_headers(),
                            params={"q": query, "per_page": 1}, timeout=REQUEST_TIMEOUT)
        if resp.status_code != 200:
            return None
        return int(resp.json().get("total_count", 0))
    except (requests.RequestException, ValueError):
        return None


def _github_commit_count(keyword: str, since: datetime, until: datetime) -> int | None:
    """期間内のコミット数（開発活動量＝熱量の質の指標）。"""
    query = f'{keyword} committer-date:{since:%Y-%m-%d}..{until:%Y-%m-%d}'
    try:
        resp = requests.get(GITHUB_COMMIT_URL, headers=_gh_headers(commit=True),
                            params={"q": query, "per_page": 1}, timeout=REQUEST_TIMEOUT)
        if resp.status_code != 200:
            return None
        return int(resp.json().get("total_count", 0))
    except (requests.RequestException, ValueError):
        return None


def fetch_github_score(keywords: list[str], as_of: datetime | None = None) -> float | None:
    """GitHub熱量＝新規リポジトリ増加率 と コミット活動増加率 の平均。

    リポジトリ数だけでなくコミット頻度も見ることで「熱量の質」を反映する。
    取得できなければ None（平均から除外される）。
    """
    if not keywords:
        return None
    start, mid, base = _windows(as_of)
    delay = 0.4 if settings.github_token else 2

    repo_recent = repo_prior = 0
    com_recent = com_prior = 0
    repo_ok = com_ok = False
    for kw in keywords:
        rr, rp = _github_count(kw, mid, base), _github_count(kw, start, mid)
        time.sleep(delay)
        cr, cp = _github_commit_count(kw, mid, base), _github_commit_count(kw, start, mid)
        time.sleep(delay)
        if rr is not None and rp is not None:
            repo_recent += rr; repo_prior += rp; repo_ok = True
        if cr is not None and cp is not None:
            com_recent += cr; com_prior += cp; com_ok = True

    scores: list[float] = []
    if repo_ok:
        scores.append(_growth_to_score(repo_recent, repo_prior))
    if com_ok:
        scores.append(_growth_to_score(com_recent, com_prior))
    return round(sum(scores) / len(scores), 4) if scores else None


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


def fetch_arxiv_score(keywords: list[str], as_of: datetime | None = None) -> float | None:
    if not keywords:
        return None
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

    return _growth_score_guarded(recent_total, prior_total, ok)


# ----------------------------- Hacker News -----------------------------
HN_MIN_POINTS = 10  # 注目を集めた話題に限定（ノイズ除去＝熱量の質）


def _hn_count(keyword: str, since: datetime, until: datetime) -> int | None:
    """期間内に投稿された「注目された」HNストーリー数（points≥閾値）。"""
    params = {
        "query": keyword,
        "tags": "story",
        "numericFilters": (
            f"created_at_i>{int(since.timestamp())},"
            f"created_at_i<{int(until.timestamp())},"
            f"points>={HN_MIN_POINTS}"
        ),
        "hitsPerPage": 0,
    }
    try:
        resp = requests.get(HN_SEARCH_URL, params=params, timeout=REQUEST_TIMEOUT)
        if resp.status_code != 200:
            return None
        return int(resp.json().get("nbHits", 0))
    except (requests.RequestException, ValueError):
        return None


def fetch_hackernews_score(keywords: list[str], as_of: datetime | None = None) -> float | None:
    """キーワード群のHacker News熱量（注目ストーリー増加率）。取得不可は None。"""
    if not keywords:
        return None
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

    return _growth_score_guarded(recent_total, prior_total, ok)


# ----------------------------- Google Trends -----------------------------
def fetch_google_trends_score(keywords: list[str], as_of: datetime | None = None) -> float | None:
    """検索関心（Google Trends）の直近30日 vs 前30日の増加率。取得不可は None。

    pytrends は datacenter IP で 429 になりやすいため、失敗時は None を返して
    平均から除外する（日次の実行で取得できた時に寄与する）。
    """
    if not keywords:
        return None
    _, _, base = _windows(as_of)
    start = base - timedelta(days=WINDOW_DAYS * 2)
    timeframe = f"{start:%Y-%m-%d} {base:%Y-%m-%d}"
    try:
        from pytrends.request import TrendReq
        pt = TrendReq(hl="en-US", tz=0)
        pt.build_payload(keywords[:5], timeframe=timeframe)  # 最大5キーワード
        df = pt.interest_over_time()
        if df is None or df.empty:
            return None
        cols = [c for c in df.columns if c != "isPartial"]
        series = df[cols].sum(axis=1)
        n = len(series)
        if n < 4:
            return None
        mid = n // 2
        prior = float(series.iloc[:mid].mean())
        recent = float(series.iloc[mid:].mean())
        return _growth_to_score(recent, prior)
    except Exception:
        return None


# ----------------------------- 特許（EPO Open Patent Services） -----------------------------
_ops_token_cache: dict[str, object] = {"token": None, "exp": 0.0}


def _ops_token() -> str | None:
    """OPS の OAuth2 アクセストークン（client_credentials）。失効まで再利用する。"""
    if not (settings.epo_ops_key and settings.epo_ops_secret):
        return None
    now = time.time()
    if _ops_token_cache["token"] and now < float(_ops_token_cache["exp"]):
        return str(_ops_token_cache["token"])
    try:
        resp = requests.post(
            OPS_AUTH_URL,
            auth=(settings.epo_ops_key, settings.epo_ops_secret),
            data={"grant_type": "client_credentials"},
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            return None
        j = resp.json()
        tok = j.get("access_token")
        if not tok:
            return None
        _ops_token_cache["token"] = tok
        _ops_token_cache["exp"] = now + float(j.get("expires_in", 1200)) - 60
        return tok
    except (requests.RequestException, ValueError):
        return None


def _patent_count(keyword: str, since: datetime, until: datetime, token: str | None = None) -> int | None:
    """公開日(pd)が期間内かつタイトルに語句を含む公開特許の総件数。

    EPO Open Patent Services の検索（CQL）を使い、応答XMLの total-result-count を読む。
    認証情報未設定や障害・想定外レスポンスのときは None（平均から除外）。
    """
    tok = token or _ops_token()
    if not tok:
        return None
    cql = f'ti="{keyword}" and pd within "{since:%Y%m%d} {until:%Y%m%d}"'
    try:
        resp = requests.get(
            OPS_SEARCH_URL,
            params={"q": cql},
            headers={
                "Authorization": f"Bearer {tok}",
                "Accept": "application/xml",
                "X-OPS-Range": "1-1",  # 件数だけ欲しいので最小範囲
            },
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            return None
        root = ET.fromstring(resp.text)
        node = root.find(f".//{_OPS_DATA_NS}biblio-search")
        if node is None:
            return None
        total = node.get("total-result-count")
        return int(total) if total is not None else None
    except (requests.RequestException, ET.ParseError, ValueError):
        return None


def fetch_patents_score(keywords: list[str], as_of: datetime | None = None) -> float | None:
    """特許公開の熱量（直近30日 vs 前30日の公開件数増加率）。取得不可は None。

    公開日(pd)ベース。公開は研究開発の成果が形になる先行～同時指標。
    自然言語の語句をタイトル検索に使うため arxiv_keywords を流用する。
    """
    if not keywords:
        return None
    tok = _ops_token()
    if not tok:
        return None
    start, mid, base = _windows(as_of)

    recent_total = prior_total = 0
    ok = False
    for kw in keywords:
        recent = _patent_count(kw, mid, base, tok)
        time.sleep(1.0)  # OPS のスロットリングに配慮して間隔を空ける
        prior = _patent_count(kw, start, mid, tok)
        time.sleep(1.0)
        if recent is None or prior is None:
            continue
        recent_total += recent
        prior_total += prior
        ok = True

    return _growth_score_guarded(recent_total, prior_total, ok)


# ----------------------------- ニュース報道量（GDELT） -----------------------------
GDELT_DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc"


def _gdelt_timeline(query: str, since: datetime, until: datetime, mode: str) -> list[dict] | None:
    """GDELT DOC 2.0 の日次時系列（timeline*）。timeline[0].data の [{date,value},...]。取得不可は None。"""
    params = {
        "query": query, "mode": mode, "format": "json",
        "startdatetime": since.strftime("%Y%m%d%H%M%S"),
        "enddatetime": until.strftime("%Y%m%d%H%M%S"),
    }
    try:
        resp = requests.get(GDELT_DOC_URL, params=params, timeout=REQUEST_TIMEOUT,
                            headers={"User-Agent": "aiba/1.0"})
        if resp.status_code != 200 or not resp.text.lstrip().startswith("{"):
            return None
        tl = resp.json().get("timeline", [])
        return tl[0].get("data", []) if tl else None
    except (requests.RequestException, ValueError):
        return None


def _gdelt_daily(query: str, since: datetime, until: datetime) -> list[dict] | None:
    """GDELT DOC 2.0 の日次記事量（timelinevolraw）。取得不可は None。"""
    return _gdelt_timeline(query, since, until, "timelinevolraw")


def fetch_news_tone(keywords: list[str], as_of: datetime | None = None) -> float | None:
    """キーワードのニュース論調（GDELT平均トーン）。直近30日の平均（おおむね -10〜+10、0=中立）。

    増加率ではなく「水準」のため統合スコアには混ぜず、表示用の独立指標として扱う。取得不可は None。
    """
    if not keywords:
        return None
    start, mid, base = _windows(as_of)
    query = f'"{keywords[0]}"'
    data = _gdelt_timeline(query, start, base, "timelinetone")
    time.sleep(5)  # GDELT レート制限（1req/5s）
    if not data:
        return None
    mid_day = mid.strftime("%Y%m%d")
    vals = [p["value"] for p in data
            if p.get("value") is not None and str(p.get("date", ""))[:8] >= mid_day]
    if not vals:  # 直近窓が空なら全期間の平均
        vals = [p["value"] for p in data if p.get("value") is not None]
    return round(sum(vals) / len(vals), 2) if vals else None


def fetch_news_score(keywords: list[str], as_of: datetime | None = None) -> float | None:
    """キーワードのニュース報道量（増加率）。直近30日 vs 前30日の記事数比。取得不可は None。

    GDELT は無料・キー不要だが「5秒に1回」のレート制限があるため待機を入れる。
    """
    if not keywords:
        return None
    start, mid, base = _windows(as_of)
    # GDELT は OR 複合クエリを "larger query" として強く制限(429)するため、
    # テーマを代表する主要キーワード1語（フレーズ）で問い合わせる。
    query = f'"{keywords[0]}"'
    data = _gdelt_daily(query, start, base)
    time.sleep(5)  # GDELT のレート制限（1req/5s）に配慮
    if not data:
        return None
    mid_day = mid.strftime("%Y%m%d")
    recent = prior = 0
    ok = False
    for pt in data:
        v = pt.get("value")
        day = str(pt.get("date", ""))[:8]  # 'YYYYMMDDThhmmssZ' → 'YYYYMMDD'
        if v is None or len(day) < 8:
            continue
        if day >= mid_day:
            recent += v
        else:
            prior += v
        ok = True
    return _growth_score_guarded(recent, prior, ok)


def fetch_sentiment(
    github_keywords: list[str],
    arxiv_keywords: list[str],
    gdelt_keywords: list[str] | None = None,
    as_of: datetime | None = None,
) -> SentimentSnapshot:
    """GitHub・arXiv・Hacker News・Google Trends・特許・ニュース の熱量を統合する。

    HN/Trends/特許 はタイトル・検索語が自然文のため arxiv_keywords（自然言語）を流用。
    ニュース（GDELT）は gdelt_keywords が指定されていればそちらを使う。
    gdelt_keywords が空/None の場合は arxiv_keywords にフォールバック。
    取得できた指標のみの平均をとる（失敗した指標は中立で薄めず除外）。
    """
    news_kw = gdelt_keywords if gdelt_keywords else arxiv_keywords
    gh = fetch_github_score(github_keywords, as_of)
    ax = fetch_arxiv_score(arxiv_keywords, as_of)
    hn = fetch_hackernews_score(arxiv_keywords, as_of)
    gt = fetch_google_trends_score(arxiv_keywords, as_of)
    pt = fetch_patents_score(arxiv_keywords, as_of)
    nw = fetch_news_score(news_kw, as_of)

    # 本体(GitHub/arXiv)と補助(HN/Trends/特許/ニュース)を重み付けし、取得できた指標のみで加重平均。
    weighted = [(s, w) for s, w in (
        (gh, WEIGHT_CORE), (ax, WEIGHT_CORE),
        (hn, WEIGHT_SUPP), (gt, WEIGHT_SUPP), (pt, WEIGHT_SUPP), (nw, WEIGHT_SUPP),
    ) if s is not None]
    # 有効信号が少なすぎる日は単一ソースの極値を刻まないよう None（後段でフォワードフィル）。
    if len(weighted) < MIN_SIGNALS:
        combined = None
    else:
        combined = round(sum(s * w for s, w in weighted) / sum(w for _, w in weighted), 2)
    return SentimentSnapshot(
        github_score=gh, arxiv_score=ax, sentiment_score=combined,
        hackernews_score=hn, trends_score=gt, patents_score=pt, news_score=nw,
    )
