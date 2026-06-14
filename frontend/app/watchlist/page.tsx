"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { parseDomainId, REGION_LABEL } from "@/lib/regions";
import { scoreColor, fmt } from "@/lib/score-color";
import NavTabs from "@/components/NavTabs";

interface Row { id: string; name: string; ticker: string; region: string; aiba: number | null; trade_date: string | null }

export default function WatchlistPage() {
  const { user, ready, watchlist, toggleWatch } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ids = Array.from(watchlist);
    if (!user || ids.length === 0) {
      setRows([]);
      return;
    }
    setLoading(true);
    (async () => {
      const cutoff = new Date(Date.now() - 25 * 86_400_000).toISOString().slice(0, 10);
      const [{ data: doms }, { data: metrics }] = await Promise.all([
        supabaseBrowser.from("domains").select("id,name,ticker").in("id", ids),
        supabaseBrowser.from("daily_metrics").select("domain_id,trade_date,aiba_score").in("domain_id", ids).gte("trade_date", cutoff),
      ]);
      const latest = new Map<string, any>();
      for (const m of metrics ?? []) {
        const cur = latest.get(m.domain_id);
        if (!cur || m.trade_date > cur.trade_date) latest.set(m.domain_id, m);
      }
      const out: Row[] = (doms ?? []).map((d: any) => ({
        id: d.id, name: d.name, ticker: d.ticker,
        region: parseDomainId(d.id).region,
        aiba: latest.get(d.id)?.aiba_score ?? null,
        trade_date: latest.get(d.id)?.trade_date ?? null,
      })).sort((a, b) => (Number(b.aiba) || 0) - (Number(a.aiba) || 0));
      setRows(out);
      setLoading(false);
    })();
  }, [user, watchlist]);

  return (
    <main className="container">
      <header className="header">
        <h1>⭐ お気に入り（ウォッチリスト）</h1>
        <p>登録した銘柄のAIBAスコアをまとめて確認。各ページの ☆ で登録／解除できます。</p>
      </header>
      <NavTabs active="watchlist" />

      {!ready ? null : !user ? (
        <div className="notice" style={{ marginTop: 20 }}>
          ウォッチリストを使うには <Link className="back-link" href="/login">ログイン</Link> してください。
        </div>
      ) : watchlist.size === 0 ? (
        <div className="notice" style={{ marginTop: 20 }}>
          まだお気に入りがありません。ランキングや Pickup の銘柄名横の ☆ から登録できます。
        </div>
      ) : loading ? (
        <div className="notice" style={{ marginTop: 20 }}>読み込み中…</div>
      ) : (
        <div className="table-scroll" style={{ marginTop: 20 }}>
          <table className="table">
            <colgroup>
              <col style={{ width: "8%" }} /><col style={{ width: "52%" }} />
              <col style={{ width: "20%" }} /><col style={{ width: "20%" }} />
            </colgroup>
            <thead><tr><th></th><th>銘柄</th><th className="num">AIBAスコア</th><th>地域</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><button className="star-btn star-on" title="お気に入りから外す" onClick={() => toggleWatch(r.id)}>★</button></td>
                  <td>
                    <Link href={`/domain/${r.id}`}>
                      <span className="domain-name">{r.name}</span>
                      <span className="ticker">{r.ticker}</span>
                    </Link>
                  </td>
                  <td className="num" style={{ color: scoreColor(r.aiba), fontWeight: 700 }}>{fmt(r.aiba)}</td>
                  <td>{REGION_LABEL[r.region as "global" | "us" | "jp"] ?? r.region}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
