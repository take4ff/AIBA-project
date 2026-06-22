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
  global: {
    // `cache: "no-store"` はビルド時に Next.js の "Dynamic server usage" エラーを起こすため
    // `next: { revalidate: 0 }` で代替する（= 常に最新取得、ビルド時制約なし）。
    // キャッシュ制御は unstable_cache で行う。
    fetch: (input, init) => fetch(input, { ...init, next: { revalidate: 0 } } as RequestInit),
  },
});

export const isSupabaseConfigured = Boolean(url && anonKey);
