"""コアロジックの回帰テスト（ネットワーク不要）。"""
from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd

from aiba.score import (rsi_value_score, ma_deviation_score, rsi_penalty,
                        compute_aiba_score)
from aiba.sentiment import _growth_to_score, SentimentSnapshot
from aiba.technical import compute_rsi, compute_ma_deviation, TechnicalSnapshot
from aiba.forecast import build_features, MeanReversion, BUY, HORIZON


# ----------------------------- score -----------------------------
def test_rsi_value_score():
    assert rsi_value_score(30) == 70      # 売られすぎ→割安高得点
    assert rsi_value_score(70) == 30
    assert rsi_value_score(-10) == 100     # クランプ
    assert rsi_value_score(130) == 0


def test_ma_deviation_score():
    assert abs(ma_deviation_score(0) - 50) < 1e-6   # 平均ちょうど→中立
    assert ma_deviation_score(-10) > 50             # 平均より下＝割安
    assert ma_deviation_score(10) < 50              # 平均より上＝割高


def test_rsi_penalty():
    assert rsi_penalty(50) == 0
    assert rsi_penalty(40) == 0
    assert rsi_penalty(70) == 10            # (70-50)*0.5（トレンドなし）


def test_rsi_penalty_dynamic_threshold():
    from aiba.score import rsi_penalty_threshold
    # 横ばい/弱トレンドは基準50のまま
    assert rsi_penalty_threshold(0.0) == 50.0
    assert rsi_penalty_threshold(2.0) == 50.0
    # 強い上昇トレンドは基準が上がり、同じRSIでも減点が小さくなる
    assert rsi_penalty_threshold(10.0) > 50.0
    assert rsi_penalty(70, trend_strength=10.0) < rsi_penalty(70, trend_strength=0.0)
    # 上限70でクランプ（RSI70は無罰）
    assert rsi_penalty_threshold(100.0) == 70.0
    assert rsi_penalty(70, trend_strength=100.0) == 0.0


def test_compute_aiba_score_ordering_and_bounds():
    cheap = TechnicalSnapshot(date(2026, 1, 1), 100.0, 1000, rsi_14=32.0, ma_deviation=-8.0)
    hot = TechnicalSnapshot(date(2026, 1, 1), 100.0, 1000, rsi_14=72.0, ma_deviation=12.0)
    sent_hot = SentimentSnapshot(70, 80, 75)
    sent_cold = SentimentSnapshot(40, 30, 35)

    # 割安×未来×熱量 は 過熱×現在×冷め より高い
    assert compute_aiba_score(3, cheap, sent_hot).aiba_score > compute_aiba_score(1, hot, sent_cold).aiba_score
    # 0-100 にクランプ
    r = compute_aiba_score(1, hot, sent_hot)
    assert 0 <= r.aiba_score <= 100


def test_layer_weighting_sentiment():
    neutral = TechnicalSnapshot(date(2026, 1, 1), 100.0, 1000, rsi_14=50.0, ma_deviation=0.0)
    sent_hot = SentimentSnapshot(75, 75, 75)
    l1 = compute_aiba_score(1, neutral, sent_hot).aiba_score
    l3 = compute_aiba_score(3, neutral, sent_hot).aiba_score
    assert l3 > l1   # 第3層はセンチメント重み0.7で高くなる


# ----------------------------- sentiment -----------------------------
def test_growth_to_score():
    assert _growth_to_score(10, 10) == 50.0           # 横ばい→50
    assert _growth_to_score(20, 10) > 50              # 増加→50超
    assert _growth_to_score(5, 10) < 50               # 減少→50未満
    assert _growth_to_score(30, 10) > _growth_to_score(20, 10)  # 単調


def test_patents_score_without_key():
    # 認証情報未設定なら特許スコアは None（平均から除外され他指標を薄めない）
    from datetime import datetime, timezone
    from types import SimpleNamespace
    from unittest.mock import patch
    from aiba import sentiment
    with patch.object(sentiment, "settings", SimpleNamespace(epo_ops_key=None, epo_ops_secret=None)):
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        assert sentiment.fetch_patents_score(["quantum computing"], as_of=now) is None
        assert sentiment._patent_count("quantum", now, now) is None


# ----------------------------- technical -----------------------------
def test_compute_rsi_all_gains():
    s = pd.Series([float(i) for i in range(1, 40)])   # 単調増加
    assert compute_rsi(s).iloc[-1] == 100.0


def test_compute_ma_deviation_sign():
    below = pd.Series([10.0] * 25 + [9.0])
    above = pd.Series([10.0] * 25 + [11.0])
    assert compute_ma_deviation(below).iloc[-1] < 0
    assert compute_ma_deviation(above).iloc[-1] > 0


# ----------------------------- forecast -----------------------------
def test_mean_reversion_halfway():
    out = MeanReversion(w=0.5).predict(np.array([80.0, 20.0]))
    assert abs(out[0] - 65.0) < 1e-9   # 0.5*80 + 0.5*50
    assert abs(out[1] - 35.0) < 1e-9


def test_build_features_targets():
    n = HORIZON + 5
    df = pd.DataFrame({
        "domain_id": ["semi_us_etf"] * n,
        "trade_date": pd.date_range("2026-01-01", periods=n, freq="D"),
        "aiba_score": [float(i) for i in range(n)],
        "technical_score": [50.0] * n,
        "sentiment_score": [50.0] * n,
        "rsi_14": [50.0] * n,
        "ma_deviation": [0.0] * n,
        "close_price": [100.0 + i for i in range(n)],
        "layer": [1] * n,
    })
    feat = build_features(df).sort_values("trade_date").reset_index(drop=True)
    # 単調増加なので row0 の HORIZON 日後 = HORIZON、今後最大も HORIZON
    assert feat.loc[0, "y_reg"] == float(HORIZON)
    assert feat.loc[0, "fwd_max_aiba"] == float(HORIZON)
    # dist_to_buy = BUY - aiba
    assert feat.loc[0, "dist_to_buy"] == BUY - 0.0
