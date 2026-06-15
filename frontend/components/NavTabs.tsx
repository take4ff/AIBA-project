import Link from "next/link";

interface Tab { key: string; label: string; href: string; icon: string }

// 「ランキング / ツール / マイ」の3グループに整理したナビ（FontAwesomeアイコン）。
const GROUPS: { label: string; tabs: Tab[] }[] = [
  {
    label: "ランキング",
    tabs: [
      { key: "global", label: "Global", href: "/", icon: "fa-solid fa-earth-americas" },
      { key: "us", label: "米国", href: "/us", icon: "fa-solid fa-flag-usa" },
      { key: "jp", label: "日本", href: "/jp", icon: "fa-solid fa-torii-gate" },
    ],
  },
  {
    label: "ツール",
    tabs: [
      { key: "pickup", label: "Pickup", href: "/pickup", icon: "fa-solid fa-star" },
      { key: "themes", label: "テーマ", href: "/themes", icon: "fa-solid fa-compass" },
      { key: "screener", label: "スクリーナー", href: "/screener", icon: "fa-solid fa-magnifying-glass" },
      { key: "verify", label: "検証", href: "/verify", icon: "fa-solid fa-chart-column" },
      { key: "guide", label: "スコア定義", href: "/guide", icon: "fa-solid fa-book" },
    ],
  },
  {
    label: "マイ",
    tabs: [
      { key: "watchlist", label: "お気に入り", href: "/watchlist", icon: "fa-regular fa-star" },
      { key: "portfolio", label: "ポートフォリオ", href: "/portfolio", icon: "fa-solid fa-briefcase" },
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
                <i className={`${t.icon} tab-ico`} aria-hidden /> {t.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
