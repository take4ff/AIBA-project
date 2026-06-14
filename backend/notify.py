#!/usr/bin/env python3
"""日次の注目シグナルを Slack に通知する（任意）。

通知内容:
  🟢 買い場候補     : AIBA >= BUY_LEVEL の領域（乖離フラグ付き）
  🔀 乖離           : センチメント上昇 × 株価出遅れ（仕込み好機）
  🔴 売り検討       : ポートフォリオで過熱度 >= SELL_LEVEL

SLACK_WEBHOOK_URL（環境変数）が未設定なら標準出力に出すだけで終了。
GitHub Actions の日次ジョブ末尾で実行する想定。
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone

import pandas as pd
import requests

from aiba.config import settings

log = logging.getLogger("aiba.notify")

BUY_LEVEL = 60
SELL_LEVEL = 70
WINDOW_DAYS = 45
TOP_N = 8

REGION_JA = {"global": "Global", "us": "米国", "jp": "日本"}


def _parse(domain_id: str):
    parts = domain_id.split("_")
    last = parts.pop()
    region = parts.pop()
    kind = "etf" if last == "etf" else "stock"
    return "_".join(parts), region, kind


def _fetch_all(client, table, cols):
    out, s = [], 0
    while True:
        b = client.table(table).select(cols).range(s, s + 999).execute().data
        out += b
        if len(b) < 1000:
            break
        s += 1000
    return out


def build_message(client) -> str | None:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)).date().isoformat()
    doms = {d["id"]: d for d in _fetch_all(client, "domains", "id,name,layer")}
    m = pd.DataFrame(_fetch_all(
        client, "daily_metrics",
        "domain_id,trade_date,aiba_score,sentiment_score,close_price"))
    if m.empty:
        return None
    for c in ["aiba_score", "sentiment_score", "close_price"]:
        m[c] = pd.to_numeric(m[c], errors="coerce")
    m = m[m["trade_date"] >= cutoff]

    latest = m.sort_values("trade_date").groupby("domain_id").tail(1).set_index("domain_id")
    first = m.sort_values("trade_date").groupby("domain_id").head(1).set_index("domain_id")

    lines: list[str] = []

    # 買い場候補（AIBA>=BUY_LEVEL）
    buys = latest[latest["aiba_score"] >= BUY_LEVEL].sort_values("aiba_score", ascending=False)
    if not buys.empty:
        lines.append(f"*🟢 買い場候補 (AIBA≥{BUY_LEVEL})*")
        for did, r in buys.head(TOP_N).iterrows():
            d = doms.get(did, {})
            _, region, _ = _parse(did)
            lines.append(f"• {d.get('name','?')}（{REGION_JA.get(region,region)}）AIBA {r['aiba_score']:.0f}")

    # 乖離（センチメント上昇 × 株価出遅れ）
    div = []
    for did, r in latest.iterrows():
        if did not in first.index:
            continue
        st = r["sentiment_score"] - first.loc[did, "sentiment_score"]
        cp0 = first.loc[did, "close_price"]
        pt = (r["close_price"] - cp0) / cp0 * 100 if cp0 else 0
        if st > 1 and pt < 2:
            div.append((did, r["aiba_score"]))
    if div:
        lines.append(f"\n*🔀 乖離（仕込み好機）*")
        for did, _ in sorted(div, key=lambda x: -(x[1] or 0))[:TOP_N]:
            d = doms.get(did, {})
            _, region, _ = _parse(did)
            lines.append(f"• {d.get('name','?')}（{REGION_JA.get(region,region)}）")

    # ポートフォリオ売り検討
    try:
        pm = pd.DataFrame(_fetch_all(client, "portfolio_metrics", "holding_id,trade_date,overheat"))
        ph = {h["id"]: h for h in _fetch_all(client, "portfolio_holdings", "id,name")}
        if not pm.empty:
            pm["overheat"] = pd.to_numeric(pm["overheat"], errors="coerce")
            pl = pm.sort_values("trade_date").groupby("holding_id").tail(1)
            sells = pl[pl["overheat"] >= SELL_LEVEL].sort_values("overheat", ascending=False)
            if not sells.empty:
                lines.append(f"\n*🔴 ポートフォリオ売り検討 (過熱度≥{SELL_LEVEL})*")
                for _, r in sells.iterrows():
                    nm = ph.get(r["holding_id"], {}).get("name", r["holding_id"])
                    lines.append(f"• {nm} 過熱度 {r['overheat']:.0f}")
    except Exception:
        pass

    if not lines:
        return None
    today = datetime.now(timezone.utc).date().isoformat()
    return f"📊 *AIBA 日次アラート* ({today})\n" + "\n".join(lines)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not settings.has_supabase:
        log.error("Supabase 未設定。")
        return 0
    from supabase import create_client
    client = create_client(settings.supabase_url, settings.supabase_key)

    msg = build_message(client)
    if not msg:
        log.info("通知すべき注目シグナルはありませんでした。")
        return 0

    webhook = os.getenv("SLACK_WEBHOOK_URL")
    if not webhook:
        log.info("SLACK_WEBHOOK_URL 未設定。通知内容（プレビュー）:\n%s", msg)
        return 0
    try:
        requests.post(webhook, json={"text": msg}, timeout=15)
        log.info("Slackへ通知しました。")
    except requests.RequestException as e:
        log.warning("Slack通知に失敗: %s", e)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
