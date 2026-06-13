"""AIBAスコア v1.1 の算出ロジック。

領域の階層（フェーズ）に応じて、テクニカル指標とセンチメント指標の
重み付けを動的に変化させるスコアリングモデル。

基本方針（README §3）:
  - RSIが50以上の過熱状態はスコアにペナルティを課す。
  - 第1層（現在）はテクニカル指標の「割安感」への配点を高くする。
  - 第3層（未来）はセンチメント指標の「熱量の増加率」への配点を高くする。
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from .sentiment import SentimentSnapshot
from .technical import TechnicalSnapshot

# 層別の重み (technical, sentiment) — 合計1.0
LAYER_WEIGHTS: dict[int, tuple[float, float]] = {
    1: (0.70, 0.30),  # 現在のブーム: テクニカルの割安感を重視
    2: (0.50, 0.50),  # 次なる波: バランス
    3: (0.30, 0.70),  # 未来の開拓地: センチメントの熱量を重視
}

# RSI過熱ペナルティ係数（RSIが50を1超えるごとに減点する点数）
RSI_PENALTY_COEFF = 0.5
# 移動平均乖離率→割安スコア変換の感度（乖離±10%で約73/27点）
MA_DEV_SENSITIVITY = 0.1


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


def rsi_value_score(rsi: float) -> float:
    """RSIを「割安感スコア」へ変換する（低RSI=売られすぎ=高得点）。"""
    return _clamp(100.0 - rsi)


def ma_deviation_score(ma_deviation: float) -> float:
    """移動平均乖離率を割安スコアへ変換する（平均より下=高得点）。"""
    return _clamp(100.0 / (1.0 + math.exp(MA_DEV_SENSITIVITY * ma_deviation)))


def technical_score(tech: TechnicalSnapshot) -> float:
    """テクニカルの統合「割安感」スコア(0-100)。"""
    score = (rsi_value_score(tech.rsi_14) + ma_deviation_score(tech.ma_deviation)) / 2.0
    return round(_clamp(score), 2)


def rsi_penalty(rsi: float) -> float:
    """RSI50超の過熱に対する減点。"""
    if rsi <= 50.0:
        return 0.0
    return (rsi - 50.0) * RSI_PENALTY_COEFF


@dataclass
class ScoreResult:
    technical_score: float
    sentiment_score: float
    aiba_score: float


def compute_aiba_score(
    layer: int,
    tech: TechnicalSnapshot,
    sent: SentimentSnapshot,
) -> ScoreResult:
    """層・テクニカル・センチメントから最終AIBAスコアを算出する。"""
    w_tech, w_sent = LAYER_WEIGHTS.get(layer, (0.5, 0.5))

    t_score = technical_score(tech)
    s_score = sent.sentiment_score

    base = w_tech * t_score + w_sent * s_score
    final = _clamp(base - rsi_penalty(tech.rsi_14))

    return ScoreResult(
        technical_score=t_score,
        sentiment_score=round(s_score, 2),
        aiba_score=round(final, 2),
    )
