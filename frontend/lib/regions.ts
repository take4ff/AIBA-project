// 地域・種別の定義と domain_id（"<theme>_<region>_<kind>"）の解析ヘルパー。

export type Region = "global" | "us" | "jp" | "row";
export type Kind = "etf" | "stock";

export const REGIONS: Region[] = ["global", "us", "jp", "row"];

export const REGION_LABEL: Record<Region, string> = {
  global: "Global",
  us: "米国",
  jp: "日本",
  row: "その他",
};

export const REGION_PATH: Record<Region, string> = {
  global: "/",
  us: "/us",
  jp: "/jp",
  row: "/row",
};

export const KIND_LABEL: Record<Kind, string> = {
  etf: "業界ETF",
  stock: "個別株",
};

/** Global は業界ETFのみ。US/JP は ETF + 個別株。その他(row) は個別株のみ。 */
export function regionHasStocks(region: Region): boolean {
  return region !== "global";
}

/** その他(row) は専用ETFを持たない（主要各国の個別株のみ）。 */
export function regionHasEtf(region: Region): boolean {
  return region !== "row";
}

/**
 * ID体系: ETF="<theme>_<region>_etf" / 個別株="<theme>_<region>_<slug>"
 * 末尾が "etf" なら ETF、それ以外は個別株。region は末尾から2番目。
 */
export function parseDomainId(id: string): { theme: string; region: Region; kind: Kind } {
  const parts = id.split("_");
  const last = parts.pop() as string;
  const kind: Kind = last === "etf" ? "etf" : "stock";
  const region = parts.pop() as Region;
  return { theme: parts.join("_"), region, kind };
}
