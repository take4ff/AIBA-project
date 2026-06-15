import {
  Shuffle, Sprout, Zap, Scale, TrendingUp, Minus, Star, Search, BarChart3, Briefcase,
  Bookmark, Compass, Flame, FileText, Satellite, Target, Sparkles, Coins, Activity, AlertTriangle,
  type LucideIcon,
} from "lucide-react";

// 概念→Lucideアイコン。各所の絵文字をこれに統一する。
const MAP: Record<string, LucideIcon> = {
  divergence: Shuffle,   // 乖離
  long: Sprout,          // 長期 / 新興候補
  short: Zap,            // 短期
  both: Scale,           // 両面 / 業界比較
  neutral: Minus,
  momentum: TrendingUp,  // 順張り / モメンタム
  pickup: Star,          // Pickup
  screener: Search,      // スクリーナー
  verify: BarChart3,     // 検証 / ランキング見出し
  portfolio: Briefcase,  // ポートフォリオ
  watchlist: Bookmark,   // お気に入り
  themes: Compass,       // テーマ
  rising: Flame,         // 話題上昇中
  narrative: FileText,   // 一行ナラティブ
  longterm: Satellite,   // 長期トレンド
  guide: Target,         // 購入目安
  forecast: Sparkles,    // 1ヶ月先予測
  value: Coins,          // 相対PER
  macd: Activity,        // MACD
  warn: AlertTriangle,   // 決算接近 等の注意
};

export default function ConceptIcon({
  name, size = 13, className,
}: {
  name: string; size?: number; className?: string;
}) {
  const Icon = MAP[name] ?? Minus;
  return <Icon size={size} className={className} aria-hidden style={{ verticalAlign: "-0.15em" }} />;
}
