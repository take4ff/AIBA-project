import Link from "next/link";
import { Kind, KIND_LABEL, Region, REGION_PATH, regionHasStocks, regionHasEtf } from "@/lib/regions";

export default function KindToggle({ region, active }: { region: Region; active: Kind }) {
  const base = REGION_PATH[region];
  // Global=ETFのみ / US・JP=ETF+個別株 / その他=個別株のみ。
  const kinds: Kind[] = [];
  if (regionHasEtf(region)) kinds.push("etf");
  if (regionHasStocks(region)) kinds.push("stock");
  return (
    <div className="kind-toggle">
      {kinds.map((k) => {
        const href = k === "etf" ? base : `${base}?kind=stock`;
        return (
          <Link key={k} href={href} className={`kind-btn${k === active ? " kind-active" : ""}`}>
            {KIND_LABEL[k]}
          </Link>
        );
      })}
    </div>
  );
}
