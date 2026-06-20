"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function NavFreshness() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowser
      .from("daily_metrics")
      .select("trade_date,created_at")
      .order("trade_date", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const row = data?.[0] as any;
        if (!row) return;
        const date: string = row.trade_date;
        const ts: string | null = row.created_at ?? null;
        if (!ts) { setLabel(date); return; }
        const d = new Date(ts);
        const hh = String((d.getUTCHours() + 9) % 24).padStart(2, "0");
        const mm = String(d.getUTCMinutes()).padStart(2, "0");
        setLabel(`${date} ${hh}:${mm}`);
      });
  }, []);

  if (!label) return null;
  return <span className="nav-freshness">データ更新: {label}</span>;
}
