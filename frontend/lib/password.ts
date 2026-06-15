// パスワード強度＋漏洩チェック（Supabase Pro の Leaked Password Protection 相当を自前で）。

/** 強度ポリシー違反のメッセージ（問題なければ null）。 */
export function passwordPolicyError(pw: string): string | null {
  if (pw.length < 10) return "パスワードは10文字以上にしてください。";
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  if (classes < 3) return "英大文字・英小文字・数字・記号のうち3種類以上を含めてください。";
  return null;
}

async function sha1Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * HaveIBeenPwned Pwned Passwords への k-匿名性問い合わせ。
 * SHA-1 の先頭5文字だけ送信し、残りはローカルで突き合わせる（パスワード本体は送らない）。
 * ネットワーク失敗時は false（登録を妨げない＝フェイルオープン）。
 */
export async function isPwnedPassword(pw: string): Promise<boolean> {
  try {
    const hash = await sha1Hex(pw);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) return false;
    const text = await res.text();
    return text.split("\n").some((line) => {
      const [suf, count] = line.trim().split(":");
      return suf === suffix && Number(count) > 0;
    });
  } catch {
    return false;
  }
}
