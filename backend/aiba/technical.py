"""テクニカル指標の取得・算出（事実データ）。

yfinance から株価・出来高を取得し、RSI(14) と移動平均(25日)乖離率を算出する。
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import pandas as pd
import yfinance as yf

RSI_PERIOD = 14
MA_PERIOD = 25
# 指標算出に十分な期間を確保（休場日を見込んで多めに取得）
LOOKBACK_DAYS = 120


@dataclass
class TechnicalSnapshot:
    """ある取引日のテクニカル指標スナップショット。"""

    trade_date: date
    close_price: float
    volume: int
    rsi_14: float
    ma_deviation: float  # 移動平均乖離率 [%]（正=平均より上、負=平均より下）


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


def fetch_technical(ticker: str) -> TechnicalSnapshot | None:
    """ティッカーの最新テクニカルスナップショットを取得する。

    データ取得に失敗、または指標算出に十分な履歴が無い場合は None。
    """
    df = yf.download(
        ticker,
        period=f"{LOOKBACK_DAYS}d",
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

    last_idx = close.index[-1]
    rsi_val = rsi.loc[last_idx]
    dev_val = dev.loc[last_idx]
    if pd.isna(rsi_val) or pd.isna(dev_val):
        return None

    return TechnicalSnapshot(
        trade_date=last_idx.date(),
        close_price=float(close.loc[last_idx]),
        volume=int(df["Volume"].loc[last_idx]),
        rsi_14=round(float(rsi_val), 2),
        ma_deviation=round(float(dev_val), 4),
    )
