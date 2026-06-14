"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase-browser";

interface AuthCtx {
  user: User | null;
  ready: boolean;
  watchlist: Set<string>;
  isWatched: (domainId: string) => boolean;
  toggleWatch: (domainId: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirm: boolean }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());

  const loadWatchlist = useCallback(async (uid: string | null) => {
    if (!uid) {
      setWatchlist(new Set());
      return;
    }
    const { data } = await supabaseBrowser.from("watchlist").select("domain_id");
    setWatchlist(new Set((data ?? []).map((r: any) => r.domain_id)));
  }, []);

  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setReady(true);
      loadWatchlist(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      loadWatchlist(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadWatchlist]);

  const toggleWatch = useCallback(
    async (domainId: string) => {
      if (!user) {
        window.location.href = "/login";
        return;
      }
      const next = new Set(watchlist);
      if (next.has(domainId)) {
        next.delete(domainId);
        setWatchlist(next);
        await supabaseBrowser.from("watchlist").delete().eq("domain_id", domainId);
      } else {
        next.add(domainId);
        setWatchlist(next);
        await supabaseBrowser.from("watchlist").insert({ user_id: user.id, domain_id: domainId });
      }
    },
    [user, watchlist],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabaseBrowser.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin + "/login" },
    });
    // メール確認が有効な場合は session が無い（確認メール後にログイン）
    const needsConfirm = !error && !data.session;
    return { error: error?.message ?? null, needsConfirm };
  }, []);

  const signOut = useCallback(async () => {
    await supabaseBrowser.auth.signOut();
    setWatchlist(new Set());
  }, []);

  return (
    <Ctx.Provider
      value={{ user, ready, watchlist, isWatched: (id) => watchlist.has(id), toggleWatch, signIn, signUp, signOut }}
    >
      {children}
    </Ctx.Provider>
  );
}
