import { getAllRows, getFundamentalsFull } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";
import NavTabs from "@/components/NavTabs";
import ConceptIcon from "@/components/ConceptIcon";
import FutureGafamView from "@/components/FutureGafamView";

export const revalidate = 600;

export default async function FutureGafamPage() {
  if (!isSupabaseConfigured) {
    return <main className="container"><div className="notice">Supabase の環境変数が未設定です。</div></main>;
  }
  const [rows, funds] = await Promise.all([getAllRows(), getFundamentalsFull()]);

  return (
    <main className="container">
      <header className="header">
        <h1><ConceptIcon name="forecast" size={24} /> 未来のGAFAM候補</h1>
        <p className="fullname">Advanced Investment &amp; Behavior Analytics</p>
        <p>
          <strong>成長 × 研究熱量 × テーマ展開幅 × 事業の頑丈さ × 規模の伸びしろ</strong> を合成し、
          「今は中型でも次の巨大プラットフォームに化ける」候補を順位付け（投機的なヒューリスティック）。
        </p>
      </header>
      <NavTabs active="future-gafam" />
      <FutureGafamView rows={rows} funds={funds} />
    </main>
  );
}
