import Link from "next/link";
import { getIndustry } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Region, REGION_LABEL, REGION_PATH } from "@/lib/regions";
import RankingTable from "@/components/RankingTable";

export const revalidate = 0;

export default async function IndustryPage({
  params,
}: {
  params: { theme: string; region: string };
}) {
  const region = params.region as Region;
  if (!isSupabaseConfigured) {
    return (
      <main className="container">
        <Link className="back-link" href={REGION_PATH[region] ?? "/"}>← 戻る</Link>
        <div className="notice">Supabase の環境変数が未設定です。</div>
      </main>
    );
  }

  const rows = await getIndustry(params.theme, region);
  const etf = rows.find((r) => r.kind === "etf");
  const themeName = etf?.domain_name ?? rows[0]?.theme_name ?? params.theme;
  const tradeDate = rows.map((r) => r.trade_date).filter(Boolean).sort().at(-1);

  return (
    <main className="container">
      <Link className="back-link" href={REGION_PATH[region] ?? "/"}>← {REGION_LABEL[region]}ランキングへ</Link>
      <header className="header" style={{ marginTop: 12 }}>
        <h1>
          {themeName}
          <span className="region-badge">{REGION_LABEL[region]}</span>
        </h1>
        <p>
          業界ETF（最上部）と主要個別株のAIBAスコア比較。
          {tradeDate && <> 最新: <span className="date">{tradeDate}</span></>}
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="notice">この業界×地域のデータがまだありません。</div>
      ) : (
        <RankingTable rows={rows} linkMode="domain" />
      )}

      <p className="guide-note" style={{ marginTop: 16 }}>
        ※ 先頭が業界ETF（業界全体）、以下は構成する有名個別株。個別株が業界ETFよりAIBAが高ければ
        「業界より割安・仕込み妙味」、低ければ「業界より割高/過熱」と読めます。銘柄名クリックで詳細チャートへ。
      </p>
    </main>
  );
}
