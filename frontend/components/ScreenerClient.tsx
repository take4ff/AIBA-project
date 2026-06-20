"use client";

import { useMemo, useState } from "react";
import { RankingRow } from "@/lib/types";
import RankingTableMore from "@/components/RankingTableMore";
import ConceptIcon from "@/components/ConceptIcon";

type Fund = { forward_pe: number | null; eps_growth: number | null };

const SORTS = {
  aiba: { label: "AIBAスコア", key: (r: RankingRow) => r.aiba_score ?? -1 },
  combo: { label: "成長×割安", key: (r: RankingRow) => r.combo_score ?? -1 },
  sentiment: { label: "熱量", key: (r: RankingRow) => r.sentiment_score ?? -1 },
  trend: { label: "センチメント傾き", key: (r: RankingRow) => r.sentiment_trend ?? -99 },
  buyzone: { label: "買い場入り確率", key: (r: RankingRow) => r.buyzone_prob ?? -1 },
} as const;
type SortKey = keyof typeof SORTS;

export default function ScreenerClient({
  rows,
  funds,
  usdjpy,
}: {
  rows: RankingRow[];
  funds: Record<string, Fund>;
  usdjpy: number;
}) {
  const [region, setRegion] = useState<"all" | "global" | "us" | "jp">("all");
  const [kind, setKind] = useState<"all" | "etf" | "stock">("all");
  const [layer, setLayer] = useState<"all" | "1" | "2" | "3">("all");
  const [minAiba, setMinAiba] = useState("");
  const [maxBuyzone, setMaxBuyzone] = useState("");
  const [maxPE, setMaxPE] = useState("");
  const [trendUp, setTrendUp] = useState(false);
  const [divOnly, setDivOnly] = useState(false);
  const [cur, setCur] = useState<"JPY" | "USD">("JPY");
  const [sort, setSort] = useState<SortKey>("aiba");

  const filtered = useMemo(() => {
    const minA = minAiba ? Number(minAiba) : null;
    const maxB = maxBuyzone ? Number(maxBuyzone) / 100 : null;
    const maxP = maxPE ? Number(maxPE) : null;
    const out = rows.filter((r) => {
      if (region !== "all" && r.region !== region) return false;
      if (kind !== "all" && r.kind !== kind) return false;
      if (layer !== "all" && String(r.layer) !== layer) return false;
      if (minA != null && (r.aiba_score ?? -1) < minA) return false;
      if (maxB != null && (r.buyzone_prob == null || r.buyzone_prob > maxB)) return false;
      if (trendUp && !(r.sentiment_trend > 1)) return false;
      if (divOnly && !r.divergence) return false;
      if (maxP != null) {
        const pe = funds[r.ticker]?.forward_pe;
        if (pe == null || pe <= 0 || pe > maxP) return false;
      }
      return true;
    });
    const k = SORTS[sort].key;
    return out.sort((a, b) => k(b) - k(a));
  }, [rows, funds, region, kind, layer, minAiba, maxBuyzone, maxPE, trendUp, divOnly, sort]);

  const reset = () => {
    setRegion("all"); setKind("all"); setLayer("all");
    setMinAiba(""); setMaxBuyzone(""); setMaxPE("");
    setTrendUp(false); setDivOnly(false); setSort("aiba");
  };

  return (
    <>
      <div className="screener-filter">
        <label>地域
          <select value={region} onChange={(e) => setRegion(e.target.value as any)}>
            <option value="all">すべて</option>
            <option value="global">Global</option>
            <option value="us">米国</option>
            <option value="jp">日本</option>
          </select>
        </label>
        <label>種別
          <select value={kind} onChange={(e) => setKind(e.target.value as any)}>
            <option value="all">すべて</option>
            <option value="etf">業界ETF</option>
            <option value="stock">個別株</option>
          </select>
        </label>
        <label>階層
          <select value={layer} onChange={(e) => setLayer(e.target.value as any)}>
            <option value="all">すべて</option>
            <option value="1">第1層</option>
            <option value="2">第2層</option>
            <option value="3">第3層</option>
          </select>
        </label>
        <label>AIBA下限
          <input type="number" step="any" value={minAiba} onChange={(e) => setMinAiba(e.target.value)} placeholder="例 60" />
        </label>
        <label>買い場確率上限%
          <input type="number" step="any" value={maxBuyzone} onChange={(e) => setMaxBuyzone(e.target.value)} placeholder="例 40" />
        </label>
        <label>予想PER上限
          <input type="number" step="any" value={maxPE} onChange={(e) => setMaxPE(e.target.value)} placeholder="例 30" />
        </label>
        <label className="screener-check">
          <input type="checkbox" checked={trendUp} onChange={(e) => setTrendUp(e.target.checked)} /> 熱量↑のみ
        </label>
        <label className="screener-check">
          <input type="checkbox" checked={divOnly} onChange={(e) => setDivOnly(e.target.checked)} /> <ConceptIcon name="divergence" size={12} /> 乖離のみ
        </label>
        <label>並び替え
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label>通貨
          <select value={cur} onChange={(e) => setCur(e.target.value as any)}>
            <option value="JPY">¥ 円</option>
            <option value="USD">$ ドル</option>
          </select>
        </label>
        <button type="button" onClick={reset}>リセット</button>
        <span className="pf-note">{filtered.length}件 ／ USD/JPY {usdjpy} 換算</span>
      </div>

      {filtered.length === 0 ? (
        <div className="notice" style={{ marginTop: 20 }}>条件に合う銘柄がありません。</div>
      ) : (
        <section className="layer">
          <RankingTableMore rows={filtered} showTheme showRegion linkMode="auto" displayCurrency={cur} usdjpy={usdjpy} />
        </section>
      )}
    </>
  );
}
