import RegionDashboard from "@/components/RegionDashboard";
import { Kind } from "@/lib/regions";

export const revalidate = 0;

export default function RowPage({ searchParams }: { searchParams: { kind?: string } }) {
  return <RegionDashboard region="row" kind={(searchParams.kind as Kind) ?? "stock"} />;
}
