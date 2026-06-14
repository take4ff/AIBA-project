import RegionDashboard from "@/components/RegionDashboard";
import { Kind } from "@/lib/regions";

export const revalidate = 0;

export default function JpPage({ searchParams }: { searchParams: { kind?: string } }) {
  return <RegionDashboard region="jp" kind={(searchParams.kind as Kind) ?? "etf"} />;
}
