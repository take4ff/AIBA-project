#!/usr/bin/env python3
"""米国銘柄のインサイダー売買（SEC EDGAR Form 4）を insider_trades に保存する日次ジョブ。

SEC の公式API（無料・キー不要・要User-Agent・10req/s上限）を使う。
  1. company_tickers.json で ticker → CIK を解決
  2. submissions API で直近の Form 4 提出一覧を取得
  3. 未取り込みの報告書XMLだけを取得・解析
公開市場での買い(P)・売り(S)のみ保存する（A=付与, M=行使, G=贈与, F=納税 等は除外）。
役員の「買い」は数少ない先行性のあるシグナルで、売り側判定の補助材料として表示する。
"""
from __future__ import annotations

import logging
import time
from datetime import date, timedelta

import requests
from lxml import etree

from aiba.config import load_domains, settings

log = logging.getLogger("aiba.insider")

# SEC はUAに連絡先（アプリ名 + メール）を要求する。無いと403。
HEADERS = {"User-Agent": "AIBA-dashboard/1.0 (takeaiba1929@gmail.com)"}
LOOKBACK_DAYS = 90
SLEEP = 0.15  # 10 req/s 上限に対する儀礼的スロットル


def _get(url: str) -> requests.Response:
    time.sleep(SLEEP)
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r


def cik_map() -> dict[str, int]:
    """ticker → CIK の対応表（SEC公式・1リクエスト）。"""
    data = _get("https://www.sec.gov/files/company_tickers.json").json()
    return {v["ticker"].upper(): int(v["cik_str"]) for v in data.values()}


def recent_form4(cik: int, since: date) -> list[dict]:
    """直近の Form 4 提出一覧 [{accession, filed, doc}]。"""
    data = _get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json").json()
    recent = data.get("filings", {}).get("recent", {})
    out = []
    for form, acc, filed, doc in zip(
        recent.get("form", []), recent.get("accessionNumber", []),
        recent.get("filingDate", []), recent.get("primaryDocument", []),
    ):
        if form == "4" and filed >= since.isoformat():
            out.append({"accession": acc, "filed": filed, "doc": doc})
    return out


def _text(node, path: str) -> str | None:
    el = node.find(path)
    return el.text.strip() if el is not None and el.text else None


def parse_form4(cik: int, accession: str, doc: str) -> list[dict]:
    """Form 4 XML を解析し、公開市場の買い(P)/売り(S)取引を返す。"""
    acc_nodash = accession.replace("-", "")
    # primaryDocument はスタイル付きパス（xslF345X05/xxx.xml）のことがある → 生XMLに剥がす
    fname = doc.split("/")[-1]
    url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc_nodash}/{fname}"
    try:
        root = etree.fromstring(_get(url).content)
    except (requests.RequestException, etree.XMLSyntaxError) as e:
        log.warning("Form4 取得/解析失敗: %s (%s)", url, e)
        return []

    owner = root.find(".//reportingOwner")
    name = _text(owner, ".//rptOwnerName") if owner is not None else None
    role = None
    if owner is not None:
        role = _text(owner, ".//officerTitle")
        if not role and _text(owner, ".//isDirector") in ("1", "true"):
            role = "Director"
        if not role and _text(owner, ".//isTenPercentOwner") in ("1", "true"):
            role = "10% Owner"

    trades = []
    for tx in root.findall(".//nonDerivativeTransaction"):
        code = _text(tx, ".//transactionCoding/transactionCode")
        if code not in ("P", "S"):
            continue
        shares = _text(tx, ".//transactionAmounts/transactionShares/value")
        price = _text(tx, ".//transactionAmounts/transactionPricePerShare/value")
        tx_date = _text(tx, ".//transactionDate/value")
        s = float(shares) if shares else None
        p = float(price) if price else None
        trades.append({
            "tx_date": tx_date, "tx_code": code,
            "insider_name": name, "insider_role": role,
            "shares": s, "price": p,
            "value_usd": round(s * p, 2) if s is not None and p is not None else None,
        })
    return trades


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not settings.has_supabase:
        raise SystemExit("Supabase 未設定。")
    from supabase import create_client
    client = create_client(settings.supabase_url, settings.supabase_key)

    # 対象＝米国の個別株（Form 4 は米国上場企業のみ。ADR・ETFは対象外）
    tickers = sorted({d.ticker for d in load_domains() if d.region == "us" and d.kind == "stock"})
    ciks = cik_map()
    since = date.today() - timedelta(days=LOOKBACK_DAYS)

    # 取り込み済みの報告書はスキップ（アクセッション番号で冪等化）
    existing = {
        r["accession_no"]
        for r in (client.table("insider_trades").select("accession_no")
                  .gte("filed_at", since.isoformat()).execute().data or [])
    }

    total = 0
    for t in tickers:
        cik = ciks.get(t.upper())
        if not cik:
            log.info("[%s] CIK が見つかりません（スキップ）", t)
            continue
        try:
            filings = recent_form4(cik, since)
        except requests.RequestException as e:
            log.warning("[%s] submissions 取得失敗: %s", t, e)
            continue
        rows = []
        for f in filings:
            if f["accession"] in existing:
                continue
            for seq, tr in enumerate(parse_form4(cik, f["accession"], f["doc"])):
                rows.append({
                    "ticker": t, "accession_no": f["accession"], "tx_seq": seq,
                    "filed_at": f["filed"], **tr,
                })
        if rows:
            client.table("insider_trades").upsert(rows, on_conflict="accession_no,tx_seq").execute()
            log.info("[%s] %d 件の売買を保存（報告書 %d 本）", t, len(rows), len(filings))
            total += len(rows)

    log.info("完了: %d 銘柄を確認し %d 件を保存しました。", len(tickers), total)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
