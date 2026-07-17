"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/useAuth";
import { fetchHandReview, type HandReviewResponse, type ReviewedDecision } from "@/lib/reviewApi";
import { CLASSIFICATION_META, outOfScopeLabel } from "@/lib/classification";
import { ClassificationBadge } from "@/components/review/ClassificationBadge";
import { PlayingCard } from "@/components/PlayingCard";
import { PREFLOP_BUCKET_LABELS, POSTFLOP_BUCKET_LABELS } from "@/lib/geoApi";
import { bucketColor } from "@/components/geo/colors";
import { Footer } from "@/components/Footer";

const STREET_LABEL: Record<string, string> = { preflop: "プリフロップ", flop: "フロップ", turn: "ターン", river: "リバー" };

function bucketLabel(street: string, bucket: string): string {
  const table = street === "preflop" ? PREFLOP_BUCKET_LABELS : POSTFLOP_BUCKET_LABELS;
  return (table as Record<string, string>)[bucket] ?? bucket;
}

function DecisionCard({ d }: { d: ReviewedDecision }) {
  const meta = d.classification ? CLASSIFICATION_META[d.classification] : null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-ink-200 bg-white p-3.5"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-ink-500">
            {STREET_LABEL[d.street] ?? d.street} · {d.heroPos}
          </span>
        </div>
        {d.classification ? (
          <ClassificationBadge classification={d.classification} showLabel size={22} />
        ) : d.outOfScopeReason === "solving" ? (
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-ink-500">
            <span className="h-3 w-3 rounded-full border-2 border-ink-500 border-t-transparent animate-spin" />
            ソルバー解析中…
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-1.5 py-0.5 text-[10px] font-bold text-ink-600">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-3 w-3 shrink-0">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4.5" strokeLinecap="round" />
              <circle cx="12" cy="16" r="0.6" fill="currentColor" stroke="none" />
            </svg>
            解析対象外 · {outOfScopeLabel(d.outOfScopeReason, d.analyzable)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 text-[13px]">
        <span className="font-black text-ink-950">あなた: {d.actionName}</span>
        {d.evLossBb !== null && d.evLossBb > 0.02 && (
          <span className="text-[11px] font-bold text-crimson-500 tabular-nums">EV −{d.evLossBb.toFixed(2)}bb</span>
        )}
        <span className="ml-auto text-[10px] text-ink-400 tabular-nums">
          {d.effStackBb.toFixed(0)}bb · pot {d.potBb.toFixed(1)}bb
        </span>
      </div>

      {d.gtoActions && d.gtoActions.length > 0 && (
        <div className="mt-2.5">
          <p className="text-[10px] font-bold text-ink-500 mb-1">GTO推奨</p>
          <div className="flex gap-1.5 flex-wrap">
            {d.gtoActions
              .filter((a) => a.frequency > 0)
              .map((a) => (
                <div
                  key={a.bucket}
                  className="rounded-lg px-2 py-1 text-white"
                  style={{ background: bucketColor(a.bucket) }}
                >
                  <span className="text-[11px] font-bold">{bucketLabel(d.street, a.bucket)}</span>
                  <span className="text-[11px] font-black tabular-nums ml-1">{Math.round(a.frequency * 100)}%</span>
                  <span className="text-[9px] font-bold tabular-nums ml-1 opacity-80">
                    EV{a.evBb >= 0 ? "+" : ""}
                    {a.evBb.toFixed(1)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default function ReviewHandPage() {
  const params = useParams();
  const router = useRouter();
  const handId = String(params?.["handId"] ?? "");
  const { session, loading: authLoading } = useAuth();
  const accessToken = session?.access_token;

  const [data, setData] = useState<HandReviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!handId) return;
    // Supabaseのセッション復元中は判定しない(復元前に「ログインが必要」を誤表示して固まるバグの修正)。
    if (authLoading) return;
    if (!accessToken) {
      setLoading(false);
      setError("ログインが必要です。");
      return;
    }
    let cancelled = false;
    let tries = 0;
    setLoading(true);
    setError(null);
    const load = () => {
      fetchHandReview(handId, accessToken)
        .then((res) => {
          if (cancelled) return;
          if (!res) setError("このハンドのレビューを取得できませんでした。");
          else {
            setData(res);
            // HUポストフロップのソルバー解析が進行中なら数秒後に再取得(最大~2分)。
            if (res.solving && tries < 30) {
              tries += 1;
              setTimeout(() => {
                if (!cancelled) load();
              }, 4000);
            }
          }
        })
        .finally(() => !cancelled && setLoading(false));
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [handId, accessToken, authLoading]);

  const review = data?.review;
  const timeline = data?.timeline;
  const heroSeat = timeline?.seats.find((s) => s.userId === review?.heroUserId);

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 pt-5 pb-28">
        <button onClick={() => router.back()} className="text-[12px] font-bold text-ink-500 mb-3">
          ← 戻る
        </button>
        <div className="flex items-center gap-2 mb-4">
          <span className="h-1.5 w-1.5 rounded-full bg-gold-500" />
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-ink-950">局後検討</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-ink-200 bg-ink-50 p-8 text-sm text-ink-500">
            <span className="h-4 w-4 rounded-full border-2 border-ink-950 border-t-transparent animate-spin" />
            解析中…
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-crimson-500/10 ring-1 ring-crimson-500/30 text-crimson-500 text-sm px-4 py-3">
            {error}
          </div>
        ) : review && timeline ? (
          <>
            {/* サマリー(確定仕様: ハンド単位のGTO精度%と芸術的カウントは表示しない) */}
            <div className="rounded-2xl border border-ink-950 bg-white p-4 mb-4">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-black text-ink-950">Hand #{timeline.handNumber}</p>
                {review.mistakeCount > 0 && (
                  <p className="text-[11px] font-bold text-ink-600">
                    ミス <span className="text-crimson-500 tabular-nums">{review.mistakeCount}</span>
                  </p>
                )}
              </div>
              {/* ボード & ヒーローハンド */}
              <div className="mt-3 flex items-center gap-3">
                {heroSeat && heroSeat.holeCards.length === 2 && (
                  <div className="flex gap-1">
                    {heroSeat.holeCards.map((c, i) => (
                      <div key={i} className="w-10">
                        <PlayingCard card={c} size="sm" />
                      </div>
                    ))}
                  </div>
                )}
                {timeline.board.length > 0 && (
                  <div className="flex gap-1 border-l border-ink-200 pl-3">
                    {timeline.board.map((c, i) => (
                      <div key={i} className="w-10">
                        <PlayingCard card={c} size="sm" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 意思決定リスト */}
            <div className="space-y-2.5">
              {review.decisions.map((d) => (
                <DecisionCard key={d.sequenceNumber} d={d} />
              ))}
              {review.decisions.length === 0 && (
                <p className="text-sm text-ink-400 text-center py-8">このハンドにあなたの意思決定はありません。</p>
              )}
            </div>

            <p className="text-[10px] text-ink-400 mt-4 leading-relaxed">
              v1のGTO基準はプリフロップのRFI(最初の開き)のみ対応。フェイスやポストフロップHUはソルバー実装後に解析対象になります。
              芸術的(エクスプロイト検出)は母集団データ蓄積後に解禁予定。
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
