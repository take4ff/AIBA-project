import Link from "next/link";

interface Tab { key: string; label: string; href: string }

// 「ランキング / ツール / マイ」の3グループに整理したナビ。
const GROUPS: { label: string; tabs: Tab[] }[] = [
  {
    label: "ランキング",
    tabs: [
      { key: "global", label: "Global", href: "/" },
      { key: "us", label: "米国", href: "/us" },
      { key: "jp", label: "日本", href: "/jp" },
    ],
  },
  {
    label: "ツール",
    tabs: [
      { key: "pickup", label: "⭐ Pickup", href: "/pickup" },
      { key: "themes", label: "🧭 テーマ", href: "/themes" },
      { key: "screener", label: "🔎 スクリーナー", href: "/screener" },
      { key: "verify", label: "📊 検証", href: "/verify" },
      { key: "guide", label: "📖 スコア定義", href: "/guide" },
    ],
  },
  {
    label: "マイ",
    tabs: [
      { key: "watchlist", label: "☆ お気に入り", href: "/watchlist" },
      { key: "portfolio", label: "💼 ポートフォリオ", href: "/portfolio" },
    ],
  },
];

export default function NavTabs({ active }: { active: string }) {
  return (
    <nav className="nav">
      {GROUPS.map((g) => (
        <div key={g.label} className="nav-group">
          <span className="nav-label">{g.label}</span>
          <div className="nav-tabs">
            {g.tabs.map((t) => (
              <Link key={t.key} href={t.href} className={`tab${t.key === active ? " tab-active" : ""}`}>
                {t.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
