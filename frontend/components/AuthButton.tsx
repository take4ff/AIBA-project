"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

export default function AuthButton() {
  const { user, ready, signOut } = useAuth();
  if (!ready) return null;
  return (
    <div className="authbar">
      {user ? (
        <>
          <span className="authbar-user">{user.email}</span>
          <button className="authbar-btn" onClick={() => signOut()}>ログアウト</button>
        </>
      ) : (
        <Link className="authbar-btn" href="/login">ログイン</Link>
      )}
    </div>
  );
}
