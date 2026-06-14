"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

export default function LoginPage() {
  const { user, signOut, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    if (mode === "login") {
      const { error } = await signIn(email.trim(), password);
      if (error) setError(error);
      else window.location.href = "/";
    } else {
      const { error, needsConfirm } = await signUp(email.trim(), password);
      if (error) setError(error);
      else if (needsConfirm) setInfo("確認メールを送信しました。メール内のリンクで認証後、ログインしてください。");
      else window.location.href = "/";
    }
    setBusy(false);
  }

  return (
    <main className="container">
      <header className="header">
        <Link className="back-link" href="/">← ダッシュボードへ</Link>
        <h1>🔑 {mode === "login" ? "ログイン" : "新規登録"}</h1>
        <p>お気に入り（ウォッチリスト）等を使うにはアカウントが必要です。</p>
      </header>

      {user ? (
        <div className="notice">
          ログイン済み：<span className="date">{user.email}</span>
          <div style={{ marginTop: 12 }}>
            <button className="authbar-btn" onClick={() => signOut()}>ログアウト</button>
          </div>
        </div>
      ) : (
        <form className="login-form" onSubmit={submit}>
          <input type="email" required placeholder="you@example.com" value={email}
            onChange={(e) => setEmail(e.target.value)} className="login-input" autoComplete="email" />
          <input type="password" required minLength={6} placeholder="パスワード（6文字以上）" value={password}
            onChange={(e) => setPassword(e.target.value)} className="login-input"
            autoComplete={mode === "login" ? "current-password" : "new-password"} />
          <button className="kind-active login-submit" disabled={busy} type="submit">
            {busy ? "処理中…" : mode === "login" ? "ログイン" : "新規登録"}
          </button>
          {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}
          {info && <p style={{ color: "#15a34a", fontSize: 13 }}>{info}</p>}
          <button type="button" className="link-toggle"
            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); setInfo(null); }}>
            {mode === "login" ? "アカウントが無い方はこちら（新規登録）" : "既にアカウントをお持ちの方（ログイン）"}
          </button>
        </form>
      )}
    </main>
  );
}
