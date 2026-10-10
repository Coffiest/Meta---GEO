"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BallyBubble } from "./BallyBubble";
import { Icon } from "./Icon";
import { FADE, SPRING_MOVE, SPRING_SHEET, SPRING_SNAPPY } from "@/lib/motion";
import { compressImage, sendFeedback, type FeedbackResult } from "@/lib/feedbackApi";

/**
 * 「Xでシェアしてゴールドを GET」キャンペーン(オーナー指示 2026-10-10)。
 *
 * ホームの「Play」・High Roller と同じ意匠のボタン(`line-fill-btn`)。押すと下からシートが開き、
 *  1. 一言(感想など)を書いて、URL と #PokerART 付きで X に投稿する(X の投稿画面を開くだけ。自動投稿はしない)
 *  2. 投稿の URL かスクショを送る
 * 送ったものは管理者画面の「ご意見」に「Xシェア」として届き、オーナーが確認して手動でゴールド1週間を付与する。
 * 送信は「ご意見フォーム」と同じ口(kind: "shareX")を使う。
 */
const APP_URL = "https://meta-geo-poker.vercel.app/";
const HASHTAG = "#PokerART";

export function ShareCampaignButton({ accessToken }: { accessToken: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING_MOVE, delay: 0.15 }} className="pressable-lg w-full">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="line-fill-btn flex w-full items-center gap-4 px-5 py-4 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[19px] font-black leading-none tracking-[-0.02em]">シェアしてゴールド GET!</span>
            <span className="mt-1.5 block truncate text-[12px] font-bold uppercase tracking-[0.08em] opacity-70">
              X に投稿でゴールドプラン 1 週間
            </span>
          </span>
          <Icon name="arrow-right" className="line-fill-arrow h-5 w-5 shrink-0" />
        </button>
      </motion.div>
      <ShareSheet open={open} onClose={() => setOpen(false)} accessToken={accessToken} />
    </>
  );
}

function ShareSheet({ open, onClose, accessToken }: { open: boolean; onClose: () => void; accessToken: string }) {
  const [mounted, setMounted] = useState(false);
  const [comment, setComment] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setMounted(true), []);

  const postText = `${comment.trim()}\n\n${HASHTAG}\n${APP_URL}`;
  const urlOk = /^https?:\/\/(x|twitter)\.com\/\S+/i.test(postUrl.trim());
  const canSend = !sending && (urlOk || shot !== null);

  function openX() {
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(postText)}`, "_blank", "noopener,noreferrer");
  }

  async function submit() {
    if (!canSend) return;
    setSending(true);
    const body = `【Xシェア】\n投稿URL: ${postUrl.trim() || "(スクショ)"}\n一言: ${comment.trim() || "(なし)"}`;
    const r = await sendFeedback(accessToken, { kind: "shareX", body, images: shot ? [shot] : [] });
    setSending(false);
    setResult(r);
  }

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE} className="absolute inset-0 bg-black/70" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="シェアしてゴールド GET"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SPRING_SHEET}
            className="relative flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-sheet glass-sheet shadow-e4"
          >
            <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-4">
              <p className="text-[16px] font-black text-fg">シェアしてゴールド GET!</p>
              <button type="button" onClick={onClose} className="pressable text-[13px] font-bold text-fg-2">
                閉じる
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+20px)]">
              <AnimatePresence mode="wait" initial={false}>
                {result === "ok" ? (
                  <motion.div key="done" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING_SNAPPY}>
                    <BallyBubble size="lg" className="mt-2">
                      <span className="block text-[14px] font-black text-fg">受け付けたよ、ありがとう!</span>
                      <span className="mt-1 block">運営が投稿を確認したら、ゴールドプラン 1 週間をプレゼントするね。</span>
                    </BallyBubble>
                    <button
                      type="button"
                      onClick={onClose}
                      className="pressable mt-5 w-full rounded-full bg-accent py-3 text-[13px] font-black text-on-accent shadow-glow"
                    >
                      閉じる
                    </button>
                  </motion.div>
                ) : (
                  <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE}>
                    <BallyBubble size="lg">Poker ART のことを X に投稿してくれたら、ゴールドプラン 1 週間をプレゼントするよ!</BallyBubble>

                    <p className="mt-4 text-[12px] font-black text-fg">① 一言書いて X に投稿</p>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value.slice(0, 200))}
                      rows={3}
                      placeholder="感想など、なんでも一言"
                      className="mt-2 w-full resize-none rounded-2xl border border-line bg-surface-2 px-3.5 py-3 text-[14px] leading-relaxed text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none"
                    />
                    <p className="mt-1.5 whitespace-pre-wrap rounded-xl bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-fg-2">{postText}</p>
                    <button
                      type="button"
                      onClick={openX}
                      className="pressable mt-2.5 flex w-full items-center justify-center gap-2 rounded-full border border-line py-3 text-[13px] font-black text-fg"
                    >
                      <Icon name="send" className="h-4 w-4" />
                      X で投稿する
                    </button>

                    <p className="mt-5 text-[12px] font-black text-fg">② 投稿の URL かスクショを送る</p>
                    <input
                      value={postUrl}
                      onChange={(e) => setPostUrl(e.target.value.slice(0, 300))}
                      inputMode="url"
                      placeholder="https://x.com/..."
                      className="mt-2 w-full rounded-2xl border border-line bg-surface-2 px-3.5 py-3 text-[14px] text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none"
                    />
                    <div className="mt-2.5 flex items-center gap-2">
                      {shot ? (
                        <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-line">
                          {/* eslint-disable-next-line @next/next/no-img-element -- 端末で縮めた data URL の下見 */}
                          <img src={shot} alt="" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            aria-label="スクショを外す"
                            onClick={() => setShot(null)}
                            className="pressable absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-canvas/80 text-fg"
                          >
                            <Icon name="close" className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          className="pressable flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-fg-2"
                        >
                          <Icon name="camera" className="h-5 w-5" />
                          <span className="text-[9px] font-bold">スクショ</span>
                        </button>
                      )}
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void compressImage(f).then((c) => c && setShot(c.dataUrl));
                        }}
                      />
                      <p className="text-[10px] leading-snug text-fg-3">URL かスクショのどちらかがあれば送れるよ。運営が確認してから付与するね。</p>
                    </div>

                    {result && (
                      <p className="mt-3 text-[12px] font-semibold text-crimson-300">
                        {result === "rate" ? "少し時間をおいてから送ってね。" : "送れなかったよ。もう一度試してね。"}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => void submit()}
                      disabled={!canSend}
                      className="pressable mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3.5 text-[14px] font-black text-on-accent shadow-glow disabled:opacity-40"
                    >
                      <Icon name="send" className="h-4 w-4" />
                      {sending ? "送信中…" : "送信する"}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
