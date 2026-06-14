"use client";

import { createClient } from "@supabase/supabase-js";

// 認証付きブラウザクライアント（セッションを localStorage に保持）。
// 公開データ読み取りの lib/supabase.ts とは別（あちらは persistSession:false）。
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabaseBrowser = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // マジックリンク復帰時にセッションを確立
  },
});
