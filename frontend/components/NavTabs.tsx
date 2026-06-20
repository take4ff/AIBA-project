import Link from "next/link";
import {
  Globe, Globe2, Flag, Star, Compass, Search, BarChart3, BookOpen, Bookmark, Briefcase,
  GraduationCap, LineChart, Rocket,
  type LucideIcon,
} from "lucide-react";
import NavFreshness from "@/components/NavFreshness";

interface Tab { key: string; label: string; href: string; Icon: LucideIcon }

// 「ランキング / ツール / マイ」の3グループ（Lucideアイコン・モノクロ＋アクセント）。
const GROUPS: { label: string; tabs: Tab[] }[] = [
  {
    label: "ランキング",
    tabs: [
      { key: "global", label: "Global", href: "/", Icon: Globe },
      { key: "us", label: "米国", href: "/us", Icon: Flag },
      { key: "jp", label: "日本", href: "/jp", Icon: Flag },
      { key: "row", label: "その他", href: "/row", Icon: Globe2 },
    ],
  },
  {
    label: "ツール",
    tabs: [
      { key: "pickup", label: "Pickup", href: "/pickup", Icon: Star },
      { key: "themes", label: "テーマ", href: "/themes", Icon: Compass },
      { key: "screener", label: "スクリーナー", href: "/screener", Icon: Search },
      { key: "future-gafam", label: "未来のGAFAM", href: "/future-gafam", Icon: Rocket },
      { key: "verify", label: "検証", href: "/verify", Icon: BarChart3 },
      { key: "aiba-index", label: "AIBA指数", href: "/aiba-index", Icon: LineChart },
      { key: "guide", label: "スコア定義", href: "/guide", Icon: BookOpen },
      { key: "learn", label: "投資講座", href: "/learn", Icon: GraduationCap },
    ],
  },
  {
    label: "マイ",
    tabs: [
      { key: "watchlist", label: "お気に入り", href: "/watchlist", Icon: Bookmark },
      { key: "portfolio", label: "ポートフォリオ", href: "/portfolio", Icon: Briefcase },
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
            {g.tabs.map(({ key, label, href, Icon }) => (
              <Link key={key} href={href} className={`tab${key === active ? " tab-active" : ""}`}>
                <Icon size={15} strokeWidth={2} className="tab-ico" aria-hidden />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
      <NavFreshness />
    </nav>
  );
}
