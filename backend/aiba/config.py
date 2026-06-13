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


@dataclass(frozen=True)
class Domain:
    """監視対象ドメイン1件。"""

    id: str
    name: str
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
    """targets.yaml を読み込み Domain のリストを返す。"""
    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    domains: list[Domain] = []
    for d in raw.get("domains", []):
        domains.append(
            Domain(
                id=d["id"],
                name=d["name"],
                layer=int(d["layer"]),
                ticker=d["ticker"],
                github_keywords=list(d.get("github_keywords", [])),
                arxiv_keywords=list(d.get("arxiv_keywords", [])),
            )
        )
    return domains


settings = Settings()
