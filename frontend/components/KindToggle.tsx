import Link from "next/link";
import { Kind, KIND_LABEL, Region, REGION_PATH, regionHasStocks } from "@/lib/regions";

export default function KindToggle({ region, active }: { region: Region; active: Kind }) {
  const base = REGION_PATH[region];
  // Global は業界ETFのみ。レイアウト高さを揃えるため枠は常に表示する。
  const kinds: Kind[] = regionHasStocks(region) ? ["etf", "stock"] : ["etf"];
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
