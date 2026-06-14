import RegionDashboard from "@/components/RegionDashboard";
import { Kind } from "@/lib/regions";

export const revalidate = 0;

export default function Home({ searchParams }: { searchParams: { kind?: string } }) {
  return <RegionDashboard region="global" kind={(searchParams.kind as Kind) ?? "etf"} />;
}
