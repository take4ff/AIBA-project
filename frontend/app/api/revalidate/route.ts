import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

/**
 * オンデマンド再検証エンドポイント。
 * 日次バッチ（GitHub Actions）完了後に叩くと、ISRのTTL（10分）を待たずに
 * 全ページ＋集計キャッシュ（unstable_cache）を即時更新する。
 *   curl -X POST -H "Authorization: Bearer $REVALIDATE_TOKEN" https://<site>/api/revalidate
 * REVALIDATE_TOKEN（Vercel の環境変数）未設定時は 401 を返す。
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "") || req.nextUrl.searchParams.get("token");
  const secret = process.env.REVALIDATE_TOKEN;
  if (!secret || token !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  revalidateTag("aiba-data"); // unstable_cache（全ランキング集計・ファンダ等）
  revalidatePath("/", "layout"); // 全ルートのISRページキャッシュ
  return NextResponse.json({ ok: true, revalidated: true, at: new Date().toISOString() });
}
