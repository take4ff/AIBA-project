import { getSnapshots, getAllRows, getBenchmark } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";
import NavTabs from "@/components/NavTabs";
import ConceptIcon from "@/components/ConceptIcon";
import AibaIndexView from "@/components/AibaIndexView";

export const revalidate = 0;

export default async function AibaIndexPage() {
  if (!isSupabaseConfigured) {
    return <main className="container"><div className="notice">Supabase の環境変数が未設定です。</div></main>;
  }
  const [snaps, rows, bench] = await Promise.all([getSnapshots(), getAllRows(), getBenchmark("ACWI")]);

  return (
    <main className="container">
      <header className="header">
        <h1><ConceptIcon name="verify" size={24} /> AIBAインデックス</h1>
        <p className="fullname">Advanced Investment &amp; Behavior Analytics</p>
        <p>AIBAスコアのルールで構成する“疑似インデックス”。毎月リバランス・等ウェイトの成績を、全世界株ACWIと比較。積立の試算も。</p>
      </header>
      <NavTabs active="aiba-index" />
      <section className="layer">
        <AibaIndexView snaps={snaps} rows={rows} bench={bench} />
      </section>
      <p className="guide-note" style={{ marginTop: 16 }}>
        ※ 実在の金融商品ではなく、過去データ（定点記録）に基づくサイト内シミュレーションです。実発注・自動積立は行いません。重複・取引コスト未考慮の概算で、将来の成果を保証しません。
      </p>
    </main>
  );
}
