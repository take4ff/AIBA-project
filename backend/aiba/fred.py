"""FRED（St. Louis Fed）経済データのフェッチとスコア変換。

FRED API は無料・要APIキー（FRED_API_KEY）。月次シリーズを取得し、
直近3ヶ月平均 vs 前3ヶ月平均の成長率を 0-100 スコアに変換する。
バックフィル時は as_of 以前のデータのみ参照（リリースラグ込みで正しい時点情報）。

主な参照シリーズ:
  IPG3344S — Industrial Production: Semiconductors & Electronic Components (SA, 月次, 2017=100)
"""
from __future__ import annotations

import math
import time
from datetime import datetime, timezone
from functools import lru_cache

import requests

from .config import settings

FRED_API_URL = "https://api.stlouisfed.org/fred/series/observations"
MONTHS_WINDOW = 3   # 直近/前期それぞれ何ヶ月の平均を比べるか
REQUEST_TIMEOUT = 20
FRED_SENSITIVITY = 6.0  # ロジスティック感度。10%成長→64点、20%成長→75点


@lru_cache(maxsize=32)
def _fetch_all_observations(series_id: str, api_key: str) -> list[tuple[str, float]]:
    """FRED シリーズの全観測値を取得してプロセス内キャッシュ。

    同一プロセスのバックフィルで何度も呼ばれるため lru_cache で1回だけ取得する。
    返値は (date_str, value) のタプルリスト（日付昇順）。
    """
    try:
        resp = requests.get(
            FRED_API_URL,
            params={
                "series_id": series_id,
                "api_key": api_key,
                "file_type": "json",
                "sort_order": "asc",
            },
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code != 200:
            return []
        obs = resp.json().get("observations", [])
        out: list[tuple[str, float]] = []
        for o in obs:
            try:
                v = float(o["value"])  # "." (欠損値) は ValueError で除外される
                out.append((o["date"], v))
            except (ValueError, KeyError):
                continue
        return out
    except (requests.RequestException, ValueError):
        return []


def fetch_fred_score(
    series_id: str,
    as_of: datetime | None = None,
    cooldown: float = 0.0,
) -> float | None:
    """FRED 月次シリーズの「直近3ヶ月 vs 前3ヶ月」成長率を 0-100 スコアに変換する。

    - 比 1.0（横ばい）→ 50、増加→ 50超、減少→ 50未満。
    - WEIGHT_SUPP の補助信号として `fetch_sentiment()` から呼び出す。
    - APIキー未設定・データ不足・取得失敗時は None（平均から除外）。

    cooldown: 初回取得後に待機する秒数（連続バックフィルでのAPI負荷軽減用）。
    """
    api_key = settings.fred_api_key
    if not api_key or not series_id:
        return None

    base = as_of if as_of is not None else datetime.now(timezone.utc)
    cutoff = base.strftime("%Y-%m-%d")

    all_obs = _fetch_all_observations(series_id, api_key)
    if cooldown > 0:
        time.sleep(cooldown)

    obs = [(d, v) for d, v in all_obs if d <= cutoff]
    if len(obs) < MONTHS_WINDOW * 2:
        return None

    recent_vals = [v for _, v in obs[-MONTHS_WINDOW:]]
    prior_vals = [v for _, v in obs[-(MONTHS_WINDOW * 2):-MONTHS_WINDOW]]

    prior_avg = sum(prior_vals) / MONTHS_WINDOW
    if prior_avg <= 0:
        return None

    recent_avg = sum(recent_vals) / MONTHS_WINDOW
    ratio = recent_avg / prior_avg
    x = math.log(ratio)
    score = 100.0 / (1.0 + math.exp(-FRED_SENSITIVITY * x))
    return round(score, 2)
