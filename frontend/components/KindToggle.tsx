import Link from "next/link";
import { Kind, KIND_LABEL, Region, REGION_PATH } from "@/lib/regions";

const KINDS: Kind[] = ["etf", "stock"];

export default function KindToggle({ region, active }: { region: Region; active: Kind }) {
  const base = REGION_PATH[region];
  return (
    <div className="kind-toggle">
      {KINDS.map((k) => {
        const href = k === "etf" ? base : `${base}${base === "/" ? "?" : "?"}kind=stock`;
        return (
          <Link key={k} href={href} className={`kind-btn${k === active ? " kind-active" : ""}`}>
            {KIND_LABEL[k]}
          </Link>
        );
      })}
    </div>
  );
}
