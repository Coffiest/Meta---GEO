"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabaseClient";

export interface AuthState {
  /** Supabaseの環境変数が未設定の場合はfalse(ログイン機能そのものが使えない) */
  authAvailable: boolean;
  loading: boolean;
  session: Session | null;
  sendMagicLink: (email: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const supabase = getSupabaseClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;

  return {
    authAvailable: Boolean(supabase),
    loading,
    session,
    sendMagicLink: async (email: string) => {
      if (!supabase) return { error: "認証機能が設定されていません" };
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
      return { error: error?.message ?? null };
    },
    signInWithGoogle: async () => {
      if (!supabase) return;
      await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    },
    signInWithApple: async () => {
      if (!supabase) return;
      await supabase.auth.signInWithOAuth({ provider: "apple", options: { redirectTo } });
    },
    signOut: async () => {
      if (!supabase) return;
      await supabase.auth.signOut();
    },
  };
}
