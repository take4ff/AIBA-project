import { ImageResponse } from "next/og";
import { supabase } from "@/lib/supabase";
import { parseDomainId, REGION_LABEL } from "@/lib/regions";
import { scoreColor, fmt } from "@/lib/score-color";

// 銘柄詳細を共有したときの OG 画像（AIBAスコア入りカード）。
// Next.js が /domain/[id]/opengraph-image を自動で og:image に配線する。
export const alt = "AIBA スコアカード";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600; // 日次更新データなので1時間キャッシュで十分

// 使用文字だけを Google Fonts からサブセット取得（satori は woff2 不可のため TTF を要求）
async function loadFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(url)).text();
    const m = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
    if (!m) return null;
    return await (await fetch(m[1])).arrayBuffer();
  } catch {
    return null;
  }
}

export default async function OgImage({ params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id);
  const [{ data: doms }, { data: metrics }] = await Promise.all([
    supabase.from("domains").select("name,ticker").eq("id", id).limit(1),
    supabase.from("daily_metrics")
      .select("trade_date,aiba_score,technical_score,sentiment_score,rsi_14")
      .eq("domain_id", id).order("trade_date", { ascending: false }).limit(1),
  ]);
  const dom = doms?.[0];
  const m = metrics?.[0];
  const p = parseDomainId(id);
  const name = dom?.name ?? id;
  const ticker = dom?.ticker ?? "";
  const region = REGION_LABEL[p.region] ?? p.region;
  const aiba = m?.aiba_score ?? null;

  const rows = [
    { label: "テクニカル", value: fmt(m?.technical_score ?? null, 0) },
    { label: "研究熱量", value: fmt(m?.sentiment_score ?? null, 0) },
    { label: "RSI(14)", value: fmt(m?.rsi_14 ?? null, 0) },
  ];

  const text = `AIBA ${name} ${ticker} ${region} テクニカル研究熱量RSI(14)0123456789.-—スコア買い時度個別株業界ETF/`;
  const font = await loadFont(text);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          background: "linear-gradient(135deg, #101828 0%, #1d2939 100%)",
          color: "#ffffff", padding: 64, fontFamily: "NotoSansJP",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <span style={{ fontSize: 40, fontWeight: 700, color: "#60a5fa" }}>AIBA</span>
            <span style={{ fontSize: 22, color: "#94a3b8" }}>買い時度スコア</span>
          </div>
          <span style={{ fontSize: 24, color: "#94a3b8" }}>
            {region} / {p.kind === "etf" ? "業界ETF" : "個別株"}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 48 }}>
          <span style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.2 }}>{name}</span>
          <span style={{ fontSize: 30, color: "#94a3b8", marginTop: 8 }}>{ticker}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", marginTop: "auto", gap: 56 }}>
          <div
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              width: 220, height: 220, borderRadius: 24,
              background: scoreColor(aiba), color: "#101828",
            }}
          >
            <span style={{ fontSize: 26, fontWeight: 700 }}>AIBA</span>
            <span style={{ fontSize: 88, fontWeight: 700, lineHeight: 1 }}>{fmt(aiba, 0)}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {rows.map((r) => (
              <div key={r.label} style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
                <span style={{ fontSize: 26, color: "#94a3b8", width: 190 }}>{r.label}</span>
                <span style={{ fontSize: 40, fontWeight: 700 }}>{r.value}</span>
              </div>
            ))}
            {m?.trade_date && (
              <span style={{ fontSize: 20, color: "#64748b" }}>{m.trade_date}</span>
            )}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: font
        ? [{ name: "NotoSansJP", data: font, weight: 700 as const, style: "normal" as const }]
        : undefined,
    },
  );
}
