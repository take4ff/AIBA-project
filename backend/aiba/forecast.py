"""AIBAスコアの先行予測（1ヶ月先）。

2種類の出力を1つの特徴量から作る:
  - buyzone_prob : 今後 HORIZON 営業日以内に買い場(AIBA>=BUY)へ入る確率（分類）
  - pred_aiba    : HORIZON 営業日後のAIBAスコア点予測（回帰）

モデルは scikit-learn の HistGradientBoosting（libomp等のシステム依存が無く、
GitHub Actions / ローカルの双方で安定動作する）。全ドメインを縦に積んだ
パネル学習で、小さなデータでも頑健に学習する。
"""
from __future__ import annotations

import numpy as np
import pandas as pd

HORIZON = 21          # 予測ホライズン（営業日 ≒ 1ヶ月）
BUY = 60.0            # 買い場の閾値（AIBA>=BUY）
MIN_HISTORY = 30      # 特徴量算出に必要な最小履歴

REGION_CODE = {"global": 0, "us": 1, "jp": 2}
KIND_CODE = {"etf": 0, "stock": 1}

# NaNチェック用の特徴量（学習・予測に必要な列が揃っているか）
FEATURES = [
    "aiba_score", "technical_score", "sentiment_score", "rsi_14", "ma_deviation",
    "aiba_mom10", "aiba_rollmean21", "aiba_rollstd21", "dist_to_buy",
]

# バックテストの結論: 1ヶ月先・小データでは「現在のAIBAスコア」単独が最強。
# 特徴量を足すほどノイズで悪化するため、現在スコア中心の最小構成に絞る。
# 分類: 現在スコアを校正済み確率へ写すだけ（rank性能=現在スコア, AUC≈0.74）
CLF_FEATURES = ["aiba_score"]
# 回帰: 平均回帰（現在値→neutral=50 へ部分的に戻す）。学習した線形より頑健。
NEUTRAL = 50.0


class MeanReversion:
    """pred = w*current + (1-w)*NEUTRAL。w は学習データから最小二乗で推定（範囲制限）。"""

    def __init__(self, w: float = 0.5, mu: float = NEUTRAL,
                 w_bounds: tuple[float, float] = (0.2, 0.8)):
        self.mu = mu
        self.w_bounds = w_bounds
        self.w = w

    def fit(self, current: np.ndarray, target: np.ndarray) -> "MeanReversion":
        d = np.asarray(current, float) - self.mu
        e = np.asarray(target, float) - self.mu
        denom = float((d * d).sum())
        w = float((d * e).sum() / denom) if denom > 0 else 0.5
        self.w = min(max(w, self.w_bounds[0]), self.w_bounds[1])
        return self

    def predict(self, current: np.ndarray) -> np.ndarray:
        return self.w * np.asarray(current, float) + (1 - self.w) * self.mu


def _parse(domain_id: str) -> tuple[str, str]:
    parts = domain_id.split("_")
    return parts[-2], parts[-1]  # region, kind


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """ドメイン横断のロング形式データから特徴量＋ターゲットを生成する。

    入力 df 必須列: domain_id, trade_date, aiba_score, technical_score,
                    sentiment_score, rsi_14, ma_deviation, close_price, layer
    """
    df = df.copy()
    df["trade_date"] = pd.to_datetime(df["trade_date"])
    df = df.sort_values(["domain_id", "trade_date"]).reset_index(drop=True)

    reg, kind = zip(*df["domain_id"].map(_parse))
    df["region_code"] = pd.Series(reg, index=df.index).map(REGION_CODE)
    df["kind_code"] = pd.Series(kind, index=df.index).map(KIND_CODE)

    g = df.groupby("domain_id", group_keys=False)

    def per_domain(d: pd.DataFrame) -> pd.DataFrame:
        a = d["aiba_score"].astype(float)
        r = d["rsi_14"].astype(float)
        c = d["close_price"].astype(float)
        d["aiba_lag1"] = a.shift(1)
        d["aiba_lag5"] = a.shift(5)
        d["aiba_lag10"] = a.shift(10)
        d["aiba_lag21"] = a.shift(21)
        d["aiba_mom10"] = a - a.shift(10)
        d["aiba_rollmean21"] = a.rolling(21, min_periods=5).mean()
        d["aiba_rollstd21"] = a.rolling(21, min_periods=5).std()
        d["rsi_lag5"] = r.shift(5)
        d["rsi_mom5"] = r - r.shift(5)
        d["dist_to_buy"] = BUY - a
        d["ret5"] = c / c.shift(5) - 1.0
        d["vol21"] = c.pct_change().rolling(21, min_periods=5).std()

        # ターゲット: 今後HORIZON日の最大AIBAと、HORIZON日後のAIBA
        future = pd.concat([a.shift(-k) for k in range(1, HORIZON + 1)], axis=1)
        d["fwd_max_aiba"] = future.max(axis=1)
        d["fwd_count"] = future.notna().sum(axis=1)
        d["y_reg"] = a.shift(-HORIZON)
        return d

    return g.apply(per_domain).reset_index(drop=True)


def labeled_mask(feat: pd.DataFrame) -> pd.Series:
    """学習に使える（特徴量・ターゲットが揃った）行のマスク。"""
    has_feats = feat[FEATURES].notna().all(axis=1)
    has_target = (feat["fwd_count"] >= HORIZON) & feat["y_reg"].notna()
    return has_feats & has_target


def latest_rows(feat: pd.DataFrame) -> pd.DataFrame:
    """各ドメインの最新日（予測対象）で、特徴量が揃った行を返す。"""
    has_feats = feat[FEATURES].notna().all(axis=1)
    cand = feat[has_feats]
    return cand.sort_values("trade_date").groupby("domain_id").tail(1)
