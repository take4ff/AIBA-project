"""設定・監視ターゲットの読み込み。

config/targets.yaml と環境変数（Supabase接続情報・GitHubトークン等）を
一元的に扱う。
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml
from dotenv import load_dotenv

# リポジトリルート（backend/aiba/config.py から2階層上）
ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_TARGETS_PATH = ROOT_DIR / "config" / "targets.yaml"

load_dotenv(ROOT_DIR / ".env")


# 対応地域・種別（表示順）
REGIONS = ["global", "us", "jp"]
REGION_NAMES = {"global": "Global", "us": "米国", "jp": "日本"}
KINDS = ["etf", "stock"]  # etf=業界, stock=個別株


@dataclass(frozen=True)
class Domain:
    """監視対象ドメイン1件（テーマ×地域×種別）。"""

    id: str            # 例: advanced_semiconductor_jp_stock
    theme_id: str      # 例: advanced_semiconductor
    theme_name: str    # 例: 先端半導体（GPU）
    name: str          # 表示名（ETF=テーマ/業種名, stock=社名）
    region: str        # global | us | jp
    kind: str          # etf | stock
    layer: int
    ticker: str
    github_keywords: list[str] = field(default_factory=list)
    arxiv_keywords: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class Settings:
    """環境変数ベースの実行時設定。"""

    supabase_url: str | None = os.getenv("SUPABASE_URL")
    supabase_key: str | None = os.getenv("SUPABASE_KEY")
    github_token: str | None = os.getenv("GITHUB_TOKEN")

    @property
    def has_supabase(self) -> bool:
        return bool(self.supabase_url and self.supabase_key)


def load_domains(path: Path | str = DEFAULT_TARGETS_PATH) -> list[Domain]:
    """targets.yaml を読み込み、テーマ×地域に展開した Domain のリストを返す。"""
    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    import re

    def slug(ticker: str) -> str:
        return re.sub(r"[^a-z0-9]", "", ticker.lower())

    domains: list[Domain] = []
    for d in raw.get("domains", []):
        gh = list(d.get("github_keywords", []))
        ax = list(d.get("arxiv_keywords", []))
        theme_name = d["name"]
        layer = int(d["layer"])
        instruments: dict = d.get("instruments", {})
        for region in REGIONS:
            reg = instruments.get(region, {})

            etf = reg.get("etf")
            if etf:
                domains.append(Domain(
                    id=f"{d['id']}_{region}_etf",
                    theme_id=d["id"], theme_name=theme_name,
                    name=etf.get("name") or theme_name,
                    region=region, kind="etf", layer=layer,
                    ticker=str(etf["ticker"]),
                    github_keywords=gh, arxiv_keywords=ax,
                ))

            for stock in reg.get("stocks", []):
                domains.append(Domain(
                    id=f"{d['id']}_{region}_{slug(str(stock['ticker']))}",
                    theme_id=d["id"], theme_name=theme_name,
                    name=stock.get("name") or stock["ticker"],
                    region=region, kind="stock", layer=layer,
                    ticker=str(stock["ticker"]),
                    github_keywords=gh, arxiv_keywords=ax,
                ))
    return domains


def group_by_theme(domains: list[Domain]) -> dict[str, list[Domain]]:
    """テーマIDごとに Domain をまとめる（センチメント共有のため）。"""
    groups: dict[str, list[Domain]] = {}
    for d in domains:
        groups.setdefault(d.theme_id, []).append(d)
    return groups


settings = Settings()
