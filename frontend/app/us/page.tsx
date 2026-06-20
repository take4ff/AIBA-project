import RegionDashboard from "@/components/RegionDashboard";
import { Kind } from "@/lib/regions";

export const revalidate = 600; // ISR: 日次更新データを10分キャッシュ（遷移高速化）

export default function UsPage({ searchParams }: { searchParams: { kind?: string } }) {
  return <RegionDashboard region="us" kind={(searchParams.kind as Kind) ?? "etf"} />;
}
