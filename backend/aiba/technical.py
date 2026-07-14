"""テクニカル指標の取得・算出（事実データ）。

yfinance から株価・出来高を取得し、RSI(14) と移動平均(25日)乖離率を算出する。
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

import pandas as pd
import yfinance as yf

RSI_PERIOD = 14
MA_PERIOD = 25
MA75_PERIOD = 75
MA200_PERIOD = 200
MA_SLOPE_LOOKBACK = 20  # MAの傾きを測る営業日窓（トレンド判定用）
# 200日MA算出に必要な期間＋ウォームアップ。
# 200営業日 ≈ 290暦日のため 280日では常に不足し、ma200 が NaN(→0.0) になっていた。
# 祝日・休場ぶんの余裕を持たせて340日とする。
LOOKBACK_DAYS = 340


@dataclass
class TechnicalSnapshot:
    """ある取引日のテクニカル指標スナップショット。"""

    trade_date: date
    close_price: float
    volume: int
    rsi_14: float
    ma_deviation: float         # 25日MA乖離率 [%]（正=平均より上、負=平均より下）
    ma75_deviation: float = 0.0  # 75日MA乖離率 [%]（ゴールデンクロス判定: 25日線 vs 75日線）
    ma200_deviation: float = 0.0 # 200日MA乖離率 [%]（正=200日線の上、負=下）
    trend_strength: float = 0.0   # MA(25)の傾き [%]（正=上昇トレンド。動的RSI閾値に使用）


def compute_rsi(close: pd.Series, period: int = RSI_PERIOD) -> pd.Series:
    """Wilder方式に近いRSIを算出する。"""
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)

    # 指数移動平均(EWM)で平滑化（Wilderの平滑に相当）
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()

    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    # avg_loss=0（連続上昇）のケースはRSI=100に補正
    rsi = rsi.where(avg_loss != 0, 100.0)
    return rsi


def compute_ma_deviation(close: pd.Series, period: int = MA_PERIOD) -> pd.Series:
    """移動平均乖離率 [%] = (終値 - MA) / MA * 100。"""
    ma = close.rolling(window=period, min_periods=period).mean()
    return (close - ma) / ma * 100.0


def compute_ma75_deviation(close: pd.Series) -> pd.Series:
    """75日移動平均乖離率 [%]。データ不足の行は NaN。"""
    return compute_ma_deviation(close, period=MA75_PERIOD)


def compute_ma200_deviation(close: pd.Series) -> pd.Series:
    """200日移動平均乖離率 [%]。データ不足の行は NaN。"""
    return compute_ma_deviation(close, period=MA200_PERIOD)


def compute_ma_slope(close: pd.Series, period: int = MA_PERIOD,
                     lookback: int = MA_SLOPE_LOOKBACK) -> pd.Series:
    """MA(period) の lookback営業日での変化率 [%]（トレンドの強さ・向き）。"""
    ma = close.rolling(window=period, min_periods=period).mean()
    prev = ma.shift(lookback)
    return (ma - prev) / prev * 100.0


def _snapshots_from_df(df: pd.DataFrame) -> list[TechnicalSnapshot]:
    """価格DataFrameから日次のテクニカルスナップショット列を生成する。"""
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    close = df["Close"].dropna()
    if len(close) < max(RSI_PERIOD, MA_PERIOD) + 1:
        return []

    rsi = compute_rsi(close)
    dev = compute_ma_deviation(close)
    dev75 = compute_ma75_deviation(close)
    dev200 = compute_ma200_deviation(close)
    slope = compute_ma_slope(close)

    snaps: list[TechnicalSnapshot] = []
    for idx in close.index:
        r, d = rsi.loc[idx], dev.loc[idx]
        if pd.isna(r) or pd.isna(d):
            continue  # 指標算出に必要な履歴が足りない序盤はスキップ
        s = slope.loc[idx]
        d75 = dev75.loc[idx]
        d200 = dev200.loc[idx]
        snaps.append(
            TechnicalSnapshot(
                trade_date=idx.date(),
                close_price=float(close.loc[idx]),
                volume=int(df["Volume"].loc[idx]),
                rsi_14=round(float(r), 2),
                ma_deviation=round(float(d), 4),
                ma75_deviation=0.0 if pd.isna(d75) else round(float(d75), 4),
                ma200_deviation=0.0 if pd.isna(d200) else round(float(d200), 4),
                trend_strength=0.0 if pd.isna(s) else round(float(s), 4),
            )
        )
    return snaps


def fetch_technical_history(ticker: str, months: int) -> list[TechnicalSnapshot]:
    """過去 months ヶ月分の日次テクニカルスナップショットを返す。

    RSI/移動平均の算出に必要なウォームアップ期間を上乗せして取得し、
    指標が確定した日のみを返す。
    """
    # 指標のウォームアップ(約2ヶ月)を上乗せ
    period_days = months * 31 + 70
    today = date.today()
    start = today - timedelta(days=period_days)
    end = today + timedelta(days=1)  # 当日終値を確実に含める
    df = yf.download(
        ticker, start=str(start), end=str(end), interval="1d",
        auto_adjust=True, progress=False,
    )
    if df is None or df.empty:
        return []
    return _snapshots_from_df(df)


def fetch_technical(ticker: str) -> TechnicalSnapshot | None:
    """ティッカーの最新テクニカルスナップショットを取得する。

    データ取得に失敗、または指標算出に十分な履歴が無い場合は None。
    end を明日に設定して yfinance が当日データを確実に含むようにする。
    """
    today = date.today()
    start = today - timedelta(days=LOOKBACK_DAYS)
    end = today + timedelta(days=1)  # 当日終値を確実に含める
    df = yf.download(
        ticker,
        start=str(start),
        end=str(end),
        interval="1d",
        auto_adjust=True,
        progress=False,
    )
    if df is None or df.empty:
        return None

    # yfinance はカラムが MultiIndex になる場合があるため平坦化
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    close = df["Close"].dropna()
    if len(close) < max(RSI_PERIOD, MA_PERIOD) + 1:
        return None

    rsi = compute_rsi(close)
    dev = compute_ma_deviation(close)
    dev75 = compute_ma75_deviation(close)
    dev200 = compute_ma200_deviation(close)
    slope = compute_ma_slope(close)

    last_idx = close.index[-1]
    rsi_val = rsi.loc[last_idx]
    dev_val = dev.loc[last_idx]
    if pd.isna(rsi_val) or pd.isna(dev_val):
        return None
    slope_val = slope.loc[last_idx]
    dev75_val = dev75.loc[last_idx]
    dev200_val = dev200.loc[last_idx]

    return TechnicalSnapshot(
        trade_date=last_idx.date(),
        close_price=float(close.loc[last_idx]),
        volume=int(df["Volume"].loc[last_idx]),
        rsi_14=round(float(rsi_val), 2),
        ma_deviation=round(float(dev_val), 4),
        ma75_deviation=0.0 if pd.isna(dev75_val) else round(float(dev75_val), 4),
        ma200_deviation=0.0 if pd.isna(dev200_val) else round(float(dev200_val), 4),
        trend_strength=0.0 if pd.isna(slope_val) else round(float(slope_val), 4),
    )
