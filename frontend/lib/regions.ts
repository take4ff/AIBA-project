// 地域定義と domain_id（"<theme>_<region>"）の解析ヘルパー。

export type Region = "global" | "us" | "jp";

export const REGIONS: Region[] = ["global", "us", "jp"];

export const REGION_LABEL: Record<Region, string> = {
  global: "Global",
  us: "米国",
  jp: "日本",
};

// 各地域ページのルート（global はトップ）
export const REGION_PATH: Record<Region, string> = {
  global: "/",
  us: "/us",
  jp: "/jp",
};

/** "advanced_semiconductor_us" → { theme: "advanced_semiconductor", region: "us" } */
export function parseDomainId(id: string): { theme: string; region: Region } {
  const i = id.lastIndexOf("_");
  return { theme: id.slice(0, i), region: id.slice(i + 1) as Region };
}
