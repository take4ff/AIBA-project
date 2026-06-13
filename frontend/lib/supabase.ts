import { createClient } from "@supabase/supabase-js";

// 読み取り専用クライアント。publishable(anon)キーのみを使う。
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // ビルド時ではなく実行時に気づけるよう警告のみ（ページ側でハンドリング）
  console.warn("Supabase の環境変数が未設定です (.env.local を確認してください)。");
}

export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: { persistSession: false },
});

export const isSupabaseConfigured = Boolean(url && anonKey);
