"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

export default function LoginPage() {
  const { user, signOut, signInWithEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await signInWithEmail(email.trim());
    setBusy(false);
    if (error) setError(error);
    else setSent(true);
  }

  return (
    <main className="container">
      <Link className="back-link" href="/">← ダッシュボードへ</Link>
      <header className="header" style={{ marginTop: 12 }}>
        <h1>🔑 ログイン</h1>
        <p>お気に入り（ウォッチリスト）を使うにはログインが必要です。パスワード不要・メールのリンクで認証します。</p>
      </header>

      {user ? (
        <div className="notice">
          ログイン済み：<span className="date">{user.email}</span>
          <div style={{ marginTop: 12 }}>
            <button className="authbar-btn" onClick={() => signOut()}>ログアウト</button>
          </div>
        </div>
      ) : sent ? (
        <div className="notice">
          📧 <strong>{email}</strong> にログインリンクを送信しました。メール内のリンクを開くとログインできます。
        </div>
      ) : (
        <form className="login-form" onSubmit={submit}>
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="login-input"
          />
          <button className="kind-active login-submit" disabled={busy} type="submit">
            {busy ? "送信中…" : "ログインリンクを送る"}
          </button>
          {error && <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>}
        </form>
      )}
    </main>
  );
}
