import { getHyperscalerData } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";
import NavTabs from "@/components/NavTabs";
import ConceptIcon from "@/components/ConceptIcon";
import HyperscalerView from "@/components/HyperscalerView";

export const revalidate = 600;

export default async function HyperscalerPage() {
  if (!isSupabaseConfigured) {
    return (
      <main className="container">
        <div className="notice">Supabase の環境変数が未設定です。</div>
      </main>
    );
  }

  const data = await getHyperscalerData();

  return (
    <main className="container">
      <header className="header">
        <h1><ConceptIcon name="longterm" size={24} /> ハイパースケーラ CAPEX モニター</h1>
        <p className="fullname">Advanced Investment &amp; Behavior Analytics</p>
        <p>
          AWS・Azure・GCP などハイパースケーラの設備投資（CAPEX）サイクルを研究熱量でモニタリング。
          CAPEX拡大フェーズでは半導体・DC機器・クラウドSaaS銘柄に順番に波及する。
          各フェーズのAIBAスコアと組み合わせて投資タイミングを判断する。
        </p>
      </header>

      <NavTabs active="hyperscaler" />

      <section className="layer" style={{ marginTop: 8 }}>
        <HyperscalerView etfHistory={data.etfHistory} stocks={data.stocks} />
      </section>
    </main>
  );
}
