import Link from "next/link";
import { REGIONS, REGION_LABEL, REGION_PATH, Region } from "@/lib/regions";

export default function RegionTabs({ active }: { active: Region }) {
  return (
    <nav className="tabs">
      {REGIONS.map((r) => (
        <Link
          key={r}
          href={REGION_PATH[r]}
          className={`tab${r === active ? " tab-active" : ""}`}
        >
          {REGION_LABEL[r]}
        </Link>
      ))}
    </nav>
  );
}
