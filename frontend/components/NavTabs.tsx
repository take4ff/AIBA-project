import Link from "next/link";

const TABS: { key: string; label: string; href: string }[] = [
  { key: "global", label: "Global", href: "/" },
  { key: "us", label: "米国", href: "/us" },
  { key: "jp", label: "日本", href: "/jp" },
  { key: "pickup", label: "⭐ Pickup", href: "/pickup" },
  { key: "watchlist", label: "☆ お気に入り", href: "/watchlist" },
  { key: "portfolio", label: "💼 マイ・ポートフォリオ", href: "/portfolio" },
  { key: "verify", label: "📊 検証", href: "/verify" },
];

export default function NavTabs({ active }: { active: string }) {
  return (
    <nav className="tabs">
      {TABS.map((t) => (
        <Link key={t.key} href={t.href} className={`tab${t.key === active ? " tab-active" : ""}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
