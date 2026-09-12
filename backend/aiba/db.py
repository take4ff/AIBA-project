"""Supabaseへの書き込み。

日次サマリーを冪等にUpsertする（domain_id × trade_date が一意）。
Supabase未設定時はローカル JSON (backend/output/) へ書き出し、
ローカル開発・CI乾走でも動作確認できるようにする。
"""
from __future__ import annotations

import json
import logging
import time
from datetime import date
from pathlib import Path
from typing import Any

from .config import ROOT_DIR, settings

log = logging.getLogger("aiba.db")
LOCAL_OUTPUT_DIR = ROOT_DIR / "backend" / "output"


def upsert_with_retry(
    client, table: str, rows: list[dict[str, Any]],
    on_conflict: str | None = None, attempts: int = 3,
) -> None:
    """Supabase upsertを実行する。504等の一時的なエラーは指数バックオフでリトライする。"""
    from postgrest.exceptions import APIError

    delay = 3
    for i in range(1, attempts + 1):
        try:
            q = client.table(table)
            q = q.upsert(rows, on_conflict=on_conflict) if on_conflict else q.upsert(rows)
            q.execute()
            return
        except APIError:
            if i == attempts:
                raise
            log.warning("upsert失敗（%s, %d/%d回目）。%d秒後にリトライ", table, i, attempts, delay)
            time.sleep(delay)
            delay *= 2


def _serialize(record: dict[str, Any]) -> dict[str, Any]:
    """date等をJSON/Supabaseが扱える型へ変換する。"""
    out: dict[str, Any] = {}
    for k, v in record.items():
        out[k] = v.isoformat() if isinstance(v, date) else v
    return out


def upsert_domains(domains: list[dict[str, Any]]) -> None:
    """domainsマスタを同期する（targets.yaml→DB）。"""
    if not settings.has_supabase:
        return
    from supabase import create_client

    client = create_client(settings.supabase_url, settings.supabase_key)
    try:
        upsert_with_retry(client, "domains", domains, on_conflict="id")
    except Exception as e:  # noqa: BLE001
        if "tags" in str(e):  # tags 列が未マイグレーションなら除外して再試行
            stripped = [{k: v for k, v in d.items() if k != "tags"} for d in domains]
            upsert_with_retry(client, "domains", stripped, on_conflict="id")
        else:
            raise


def write_metrics(records: list[dict[str, Any]]) -> str:
    """日次サマリーを書き込み、書き込み先の説明を返す。"""
    payload = [_serialize(r) for r in records]

    if settings.has_supabase:
        from supabase import create_client

        client = create_client(settings.supabase_url, settings.supabase_key)
        upsert_with_retry(client, "daily_metrics", payload, on_conflict="domain_id,trade_date")
        return f"Supabase: {len(payload)}件をupsertしました"

    # フォールバック: ローカルJSON
    LOCAL_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = payload[0]["trade_date"] if payload else date.today().isoformat()
    out_path = LOCAL_OUTPUT_DIR / f"daily_metrics_{stamp}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return f"ローカル出力(Supabase未設定): {out_path}"
