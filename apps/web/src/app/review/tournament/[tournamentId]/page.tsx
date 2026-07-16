"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/useAuth";
import { fetchTournamentReview, type TournamentReview } from "@/lib/reviewApi";
import { CLASSIFICATION_META } from "@/lib/classification";
import { Footer } from "@/components/Footer";

export default function ReviewTournamentPage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = String(params?.["tournamentId"] ?? "");
  const { session, loading: authLoading } = useAuth();
  const accessToken = session?.access_token;

  const [data, setData] = useState<TournamentReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mistakesOnly, setMistakesOnly] = useState(false);

  useEffect(() => {
    if (!tournamentId) return;
    // Supabaseのセッション復元中は判定しない(復元前に「ログインが必要」を誤表示して固まるバグの修正)。
    if (authLoading) return;
    if (!accessToken) {
      setLoading(false);
      setError("ログインが必要です。");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchTournamentReview(tournamentId, accessToken)
      .then((res) => {
        if (cancelled) return;
        if (!res) setError("このトーナメントの解析を取得できませんでした。");
        else setData(res);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tournamentId, accessToken, authLoading]);

  const hands = data?.hands.filter((h) => (mistakesOnly ? h.mistakeCount > 0 : true)) ?? [];

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 pt-5 pb-28">
        <button onClick={() => router.back()} className="text-[12px] font-bold text-ink-500 mb-3">
          ← 戻る
        </button>
        <div className="flex items-center gap-2 mb-4">
          <span className="h-1.5 w-1.5 rounded-full bg-gold-500" />
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-ink-950">トーナメント解析</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-ink-200 bg-ink-50 p-8 text-sm text-ink-500">
            <span className="h-4 w-4 rounded-full border-2 border-ink-950 border-t-transparent animate-spin" />
            全ハンドを解析中…
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-crimson-500/10 ring-1 ring-crimson-500/30 text-crimson-500 text-sm px-4 py-3">
            {error}
          </div>
        ) : data ? (
          <>
            {/* 課金予告(現在は完全無料。将来の有料化を予告するシーム)。 */}
            <div className="rounded-xl bg-gold-500/10 ring-1 ring-gold-500/30 text-ink-700 text-[11px] px-3 py-2 mb-3">
              現在すべて無料でご利用いただけます。近日、1日2回目以降のトーナメント解析は有料（月額¥980・無制限）になる予定です。
            </div>

            <div className="rounded-2xl border border-ink-950 bg-white p-4 mb-4">
              <div className="flex items-end justify-between">
                <p className="text-4xl font-black text-ink-950 tabular-nums leading-none">
                  {data.gtoAccuracy !== null ? `${data.gtoAccuracy}%` : "—"}
                  <span className="text-[11px] font-bold text-ink-400 ml-1.5">GTO精度</span>
                </p>
                <div className="text-right text-[11px] font-bold text-ink-600 space-y-0.5">
                  <p>
                    ミス <span className="text-crimson-500 tabular-nums">{data.mistakeCount}</span>
                  </p>
                  <p>
                    芸術的{" "}
                    <span className="tabular-nums" style={{ color: CLASSIFICATION_META.artistic.color }}>
                      {data.artisticCount}
                    </span>
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-ink-400 mt-2 tabular-nums">
                解析済み意思決定 {data.classifiedDecisions}/{data.totalDecisions}
              </p>
            </div>

            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-black text-ink-700">全 {data.hands.length} ハンド</p>
              <button
                onClick={() => setMistakesOnly((v) => !v)}
                className={`rounded-full px-3 py-1 text-[10px] font-black tracking-wide transition-colors ${
                  mistakesOnly ? "bg-crimson-500 text-white" : "bg-ink-100 text-ink-600"
                }`}
              >
                ミスだけ表示
              </button>
            </div>

            <div className="space-y-1.5">
              {hands.map((h) => (
                <Link key={h.handId} href={`/review/${h.handId}`}>
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white px-3 py-2.5 active:bg-ink-50"
                  >
                    <span className="text-[11px] font-bold text-ink-400 tabular-nums w-12">#{h.handNumber}</span>
                    <span className="text-sm font-black text-ink-950 tabular-nums w-14">
                      {h.gtoAccuracy !== null ? `${h.gtoAccuracy}%` : "—"}
                    </span>
                    <div className="ml-auto flex items-center gap-2 text-[11px] font-bold">
                      {h.mistakeCount > 0 && <span className="text-crimson-500 tabular-nums">ミス{h.mistakeCount}</span>}
                      {h.artisticCount > 0 && (
                        <span className="tabular-nums" style={{ color: CLASSIFICATION_META.artistic.color }}>
                          芸術{h.artisticCount}
                        </span>
                      )}
                      <span className="text-ink-300">›</span>
                    </div>
                  </motion.div>
                </Link>
              ))}
              {hands.length === 0 && (
                <p className="text-sm text-ink-400 text-center py-8">
                  {mistakesOnly ? "ミスのあるハンドはありません。" : "解析できるハンドがありません。"}
                </p>
              )}
            </div>

            <p className="text-[10px] text-ink-400 mt-4 leading-relaxed">
              v1のGTO基準はプリフロップのRFIのみ対応。フェイス/ポストフロップHUはソルバー実装後に精度%へ反映されます。
            </p>
          </>
        ) : null}
      </div>

      <Footer
        activeKey={null}
        items={[
          { key: "home", label: "Home", icon: "home", href: "/" },
          { key: "history", label: "History", icon: "layers", href: "/?tab=history" },
          { key: "database", label: "Database", icon: "layers", href: "/geo" },
          { key: "leaderboard", label: "Leaderboard", icon: "trophy", href: "/?tab=leaderboard" },
        ]}
      />
    </div>
  );
}
