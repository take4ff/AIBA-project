import { getAllRows, getUsdJpy, getWeeklyRoundDates } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";
import NavTabs from "@/components/NavTabs";
import SimulatorView from "@/components/SimulatorView";
import ConceptIcon from "@/components/ConceptIcon";

export const revalidate = 600;

export default async function SimulatorPage() {
  if (!isSupabaseConfigured) {
    return <main className="container"><div className="notice">Supabase の環境変数が未設定です。</div></main>;
  }
  const [universe, usdjpy, roundDates] = await Promise.all([
    getAllRows(),
    getUsdJpy(),
    getWeeklyRoundDates(),
  ]);

  return (
    <main className="container">
      <header className="header">
        <h1><ConceptIcon name="simulator" size={24} /> シミュレーター</h1>
        <p className="fullname">AIBA Trade Sim — 歴史リプレイ型取引ゲーム</p>
        <p>
          仮想資金 100万円で2022年からの実際の相場データを使って売買を体験。
          AIBAスコアを参考に週次で判断し、過去データを振り返りながら投資判断力を養います。
        </p>
      </header>
      <NavTabs active="simulator" />
      <section className="layer">
        <SimulatorView universe={universe} usdjpy={usdjpy} roundDates={roundDates} />
      </section>
      <p className="guide-note" style={{ marginTop: 16 }}>
        ※ 仮想取引です。実際の売買・資産運用は行いません。価格は daily_metrics の終値（参考値）。
        FXレートは現在値を使用（歴史的レートとは異なる場合があります）。
      </p>
    </main>
  );
}
