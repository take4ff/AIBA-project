import { getPickup, getUsdJpy } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";
import RankingTableMore from "@/components/RankingTableMore";
import NavTabs from "@/components/NavTabs";
import ConceptIcon from "@/components/ConceptIcon";

export const revalidate = 600; // ISR: 日次更新データを10分キャッシュ（遷移高速化）

export default async function PickupPage({
  searchParams,
}: {
  searchParams: { cur?: string; min?: string; max?: string };
}) {
  if (!isSupabaseConfigured) {
    return (
      <main className="container">
        <div className="notice">Supabase の環境変数が未設定です。</div>
      </main>
    );
  }

  const cur: "JPY" | "USD" = searchParams.cur === "USD" ? "USD" : "JPY";
  const minV = searchParams.min ? Number(searchParams.min) : null;
  const maxV = searchParams.max ? Number(searchParams.max) : null;
  const usdjpy = await getUsdJpy();

  const all = await getPickup();
  // 表示通貨に換算した株価
  const disp = (r: { close_price: number | null; region: string }) => {
    if (r.close_price == null) return null;
    const native = r.region === "jp" ? "JPY" : "USD";
    if (cur === native) return r.close_price;
    return cur === "JPY" ? r.close_price * usdjpy : r.close_price / usdjpy;
  };
  const rows = all.filter((r) => {
    const p = disp(r);
    if (minV != null || maxV != null) {
      if (p == null) return false;
      if (minV != null && p < minV) return false;
      if (maxV != null && p > maxV) return false;
    }
    return true;
  });
  const tradeDate = rows.map((r) => r.trade_date).filter(Boolean).sort().at(-1);
  const sym = cur === "JPY" ? "¥" : "$";

  // 前日順位との差：同じ候補集合を「前営業日のAIBA」で並べ替えた順位と当日順位を比較
  const prevRank = new Map<string, number>();
  [...rows].filter((r) => r.prev_aiba != null)
    .sort((a, b) => (b.prev_aiba ?? 0) - (a.prev_aiba ?? 0))
    .forEach((r, i) => prevRank.set(r.domain_id, i + 1));
  const rankDelta: Record<string, number | null> = {};
  rows.forEach((r, i) => {
    const pr = prevRank.get(r.domain_id);
    rankDelta[r.domain_id] = pr == null ? null : pr - (i + 1); // ＋=上昇
  });

  return (
    <main className="container">
      <header className="header">
        <h1><ConceptIcon name="pickup" size={24} /> Pickup — 今買いの候補</h1>
        <p className="fullname">Advanced Investment &amp; Behavior Analytics</p>
        <p>
          地域・ETF/個別株を問わず、AIBAスコアが買い水準（60以上）または乖離（仕込み好機）の銘柄を横断抽出。
          {tradeDate && <> 最新: <span className="date">{tradeDate}</span></>}
        </p>
      </header>

      <NavTabs active="pickup" />

      {/* 通貨選択＋株価フィルター（GETフォーム） */}
      <form className="pickup-filter" action="/pickup" method="get">
        <label>通貨
          <select name="cur" defaultValue={cur}>
            <option value="JPY">¥ 円</option>
            <option value="USD">$ ドル</option>
          </select>
        </label>
        <label>株価
          <input name="min" type="number" step="any" defaultValue={searchParams.min ?? ""} placeholder={`下限(${sym})`} />
        </label>
        <span>〜</span>
        <input name="max" type="number" step="any" defaultValue={searchParams.max ?? ""} placeholder={`上限(${sym})`} />
        <button className="kind-active" type="submit">適用</button>
        <span className="pf-note">USD/JPY {usdjpy} で換算</span>
      </form>

      {rows.length === 0 ? (
        <div className="notice" style={{ marginTop: 20 }}>条件に合う候補がありません。</div>
      ) : (
        <section className="layer">
          <RankingTableMore rows={rows} showTheme showRegion linkMode="auto" displayCurrency={cur} usdjpy={usdjpy} rankDelta={rankDelta} />
        </section>
      )}
    </main>
  );
}
