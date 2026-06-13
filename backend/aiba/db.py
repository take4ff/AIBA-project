"""Supabaseへの書き込み。

日次サマリーを冪等にUpsertする（domain_id × trade_date が一意）。
Supabase未設定時はローカル JSON (backend/output/) へ書き出し、
ローカル開発・CI乾走でも動作確認できるようにする。
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

from .config import ROOT_DIR, settings

LOCAL_OUTPUT_DIR = ROOT_DIR / "backend" / "output"


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
    client.table("domains").upsert(domains, on_conflict="id").execute()


def write_metrics(records: list[dict[str, Any]]) -> str:
    """日次サマリーを書き込み、書き込み先の説明を返す。"""
    payload = [_serialize(r) for r in records]

    if settings.has_supabase:
        from supabase import create_client

        client = create_client(settings.supabase_url, settings.supabase_key)
        client.table("daily_metrics").upsert(
            payload, on_conflict="domain_id,trade_date"
        ).execute()
        return f"Supabase: {len(payload)}件をupsertしました"

    # フォールバック: ローカルJSON
    LOCAL_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = payload[0]["trade_date"] if payload else date.today().isoformat()
    out_path = LOCAL_OUTPUT_DIR / f"daily_metrics_{stamp}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return f"ローカル出力(Supabase未設定): {out_path}"
