"use client";

import { useState } from "react";
import RankingTable from "@/components/RankingTable";
import { RankingRow } from "@/lib/types";

/**
 * RankingTable に「初期表示件数＋もっと見る」を付与するクライアントラッパー。
 * 長いリスト（Pickup/スクリーナー/個別株ランキング）の初期描画を軽くする。
 */
export default function RankingTableMore({
  rows, initial = 30, step = 30, ...rest
}: {
  rows: RankingRow[];
  initial?: number;
  step?: number;
  showTheme?: boolean;
  linkMode?: "auto" | "domain";
  showRegion?: boolean;
  displayCurrency?: "JPY" | "USD";
  usdjpy?: number;
  rankDelta?: Record<string, number | null>;
}) {
  const [n, setN] = useState(initial);
  const shown = rows.slice(0, n);
  const remaining = rows.length - n;
  return (
    <>
      <RankingTable rows={shown} {...rest} />
      {remaining > 0 && (
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <button className="more-link" onClick={() => setN((v) => v + step)}>
            もっと見る <span className="more-count">＋{Math.min(step, remaining)}</span>（残り {remaining}）
          </button>
        </div>
      )}
    </>
  );
}
