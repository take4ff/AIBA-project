import RegionDashboard from "@/components/RegionDashboard";
import { Kind } from "@/lib/regions";

export const revalidate = 0;

export default function UsPage({ searchParams }: { searchParams: { kind?: string } }) {
  return <RegionDashboard region="us" kind={(searchParams.kind as Kind) ?? "etf"} />;
}
