#!/usr/bin/env python3
"""新規追加銘柄の履歴の隙間を埋める一回限りスクリプト（非破壊）。

各ドメインについて「同テーマの既存データがある取引日」のうち自分に欠けている日だけを、
テクニカルを取得して埋める。センチメントは同テーマの既存値を流用（無ければ直近値を前方補完）。
センチメントAPIは叩かない＝高速・既存行は上書きしない。
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date

from aiba.config import load_domains, settings
from aiba.db import _serialize
from aiba.score import compute_aiba_score
from aiba.sentiment import SentimentSnapshot
from aiba.technical import fetch_technical_history

log = logging.getLogger("aiba.fillgap")
WINDOW_START = "2025-12-01"
PAGE = 1000


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not settings.has_supabase:
        raise SystemExit("Supabase 未設定。")
    from supabase import create_client
    client = create_client(settings.supabase_url, settings.supabase_key)

    domains = load_domains()
    by_id = {d.id: d for d in domains}

    # 窓内の既存 daily_metrics（テーマ別センチメント＋ドメイン別の保有日）をページング取得
    rows: list[dict] = []
    off = 0
    while True:
        b = (client.table("daily_metrics")
             .select("domain_id,trade_date,sentiment_score,github_score,arxiv_score")
             .gte("trade_date", WINDOW_START).range(off, off + PAGE - 1).execute().data)
        rows += b
        if len(b) < PAGE:
            break
        off += PAGE

    theme_sent: dict[str, dict[str, tuple]] = defaultdict(dict)
    dom_dates: dict[str, set] = defaultdict(set)
    for r in rows:
        d = by_id.get(r["domain_id"])
        if not d:
            continue
        dom_dates[r["domain_id"]].add(r["trade_date"])
        theme_sent[d.theme_id].setdefault(
            r["trade_date"], (r["sentiment_score"], r["github_score"], r["arxiv_score"]))
    theme_dates = {t: sorted(m) for t, m in theme_sent.items()}

    def sent_for(theme: str, dd: str):
        m = theme_sent.get(theme, {})
        if dd in m:
            return m[dd]
        prev = None
        for x in theme_dates.get(theme, []):
            if x <= dd:
                prev = x
            else:
                break
        return m.get(prev) if prev else None

    out: list[dict] = []
    filled_domains = 0
    for d in domains:
        tdates = theme_dates.get(d.theme_id, [])
        if not tdates:
            continue
        missing = [dd for dd in tdates if dd not in dom_dates.get(d.id, set())]
        if not missing:
            continue
        snaps = fetch_technical_history(d.ticker, 8)
        snap_by_date = {s.trade_date.isoformat(): s for s in snaps}
        n0 = len(out)
        for dd in missing:
            s = snap_by_date.get(dd)
            if s is None:
                continue
            sv = sent_for(d.theme_id, dd)
            if sv is None:
                continue
            sent, gh, ax = sv
            snap_sent = SentimentSnapshot(
                github_score=None if gh is None else float(gh),
                arxiv_score=None if ax is None else float(ax),
                sentiment_score=50.0 if sent is None else float(sent))
            res = compute_aiba_score(d.layer, s, snap_sent)
            out.append({
                "domain_id": d.id, "trade_date": s.trade_date, "close_price": s.close_price,
                "volume": s.volume, "rsi_14": s.rsi_14, "ma_deviation": s.ma_deviation,
                "github_score": snap_sent.github_score, "arxiv_score": snap_sent.arxiv_score,
                "sentiment_score": res.sentiment_score, "technical_score": res.technical_score,
                "aiba_score": res.aiba_score,
            })
        if len(out) > n0:
            filled_domains += 1
            log.info("[%s] %d日分を補完", d.id, len(out) - n0)

    if out:
        payload = [_serialize(r) for r in out]
        for i in range(0, len(payload), 200):
            client.table("daily_metrics").upsert(
                payload[i:i + 200], on_conflict="domain_id,trade_date").execute()
    log.info("完了: %d ドメイン / %d 行を補完しました。", filled_domains, len(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
