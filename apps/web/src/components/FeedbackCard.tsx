"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BallyBubble } from "./BallyBubble";
import { Icon } from "./Icon";
import { useI18n } from "@/lib/i18n";
import { FADE, SPRING_SHEET, SPRING_SNAPPY } from "@/lib/motion";
import { FEEDBACK_MAX_IMAGES, compressImage, sendFeedback, type FeedbackKind, type FeedbackResult } from "@/lib/feedbackApi";

/**
 * ホームの「ご意見フォーム」への入口。バリィが「なんでも気軽に送ってね」と話しかける。
 * 押すと下からシートが開き、要望・不具合・その他を本文と写真(最大3枚)で送れる。
 * 届いたものは管理者画面(`/admin` の「ご意見」)で読む。
 */
export function FeedbackCard({ accessToken }: { accessToken: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-tour="feedback"
        className="pressable-lg block w-full rounded-[20px] glass-panel p-3.5 text-left shadow-e1"
      >
        <BallyBubble size="sm">{t("feedback.card.bubble")}</BallyBubble>
        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2.5">
          <span className="flex items-center gap-2 text-[13px] font-bold text-fg">
            <Icon name="chat" className="h-4 w-4 text-accent" />
            {t("feedback.card.title")}
          </span>
          <Icon name="chevron-right" className="h-4 w-4 text-fg-3" />
        </div>
      </button>
      <FeedbackSheet open={open} onClose={() => setOpen(false)} accessToken={accessToken} />
    </>
  );
}

const KINDS: FeedbackKind[] = ["request", "bug", "other"];

interface Attached {
  id: number;
  dataUrl: string;
}

function FeedbackSheet({ open, onClose, accessToken }: { open: boolean; onClose: () => void; accessToken: string }) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("request");
  const [body, setBody] = useState("");
  const [images, setImages] = useState<Attached[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);

  useEffect(() => setMounted(true), []);

  function reset() {
    setKind("request");
    setBody("");
    setImages([]);
    setResult(null);
  }

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const room = FEEDBACK_MAX_IMAGES - images.length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    const out: Attached[] = [];
    for (const f of picked) {
      const c = await compressImage(f);
      if (c) out.push({ id: nextId.current++, dataUrl: c.dataUrl });
    }
    setImages((prev) => [...prev, ...out].slice(0, FEEDBACK_MAX_IMAGES));
  }

  async function submit() {
    if (sending || (!body.trim() && images.length === 0)) return;
    setSending(true);
    const r = await sendFeedback(accessToken, { kind, body, images: images.map((i) => i.dataUrl) });
    setSending(false);
    setResult(r);
    if (r === "ok") {
      setBody("");
      setImages([]);
    }
  }

  const canSend = !sending && (body.trim().length > 0 || images.length > 0);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
            className="absolute inset-0 bg-black/70"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t("feedback.card.title")}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SPRING_SHEET}
            className="relative flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-sheet glass-sheet shadow-e4"
          >
            <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-4">
              <p className="text-[16px] font-black text-fg">{t("feedback.sheet.title")}</p>
              <button type="button" onClick={onClose} className="pressable text-[13px] font-bold text-fg-2">
                {t("common.close")}
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+20px)]">
              <AnimatePresence mode="wait" initial={false}>
                {result === "ok" ? (
                  <motion.div key="done" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING_SNAPPY}>
                    <BallyBubble size="lg" className="mt-2">
                      <span className="block text-[14px] font-black text-fg">{t("feedback.done.title")}</span>
                      <span className="mt-1 block">{t("feedback.done.body")}</span>
                    </BallyBubble>
                    <div className="mt-5 flex gap-2">
                      <button
                        type="button"
                        onClick={reset}
                        className="pressable flex-1 rounded-full border border-line py-3 text-[13px] font-bold text-fg"
                      >
                        {t("feedback.done.again")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          reset();
                        }}
                        className="pressable flex-1 rounded-full bg-accent py-3 text-[13px] font-black text-on-accent shadow-glow"
                      >
                        {t("common.close")}
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE}>
                    <BallyBubble size="lg">{t("feedback.sheet.bubble")}</BallyBubble>

                    <div className="mt-4 flex gap-1.5" role="radiogroup">
                      {KINDS.map((k) => (
                        <button
                          key={k}
                          type="button"
                          role="radio"
                          aria-checked={kind === k}
                          onClick={() => setKind(k)}
                          className={`pressable flex-1 rounded-full py-2 text-[12px] font-bold ${
                            kind === k ? "bg-accent/15 text-accent ring-1 ring-accent" : "bg-surface-2 text-fg-2"
                          }`}
                        >
                          {t(`feedback.kind.${k}`)}
                        </button>
                      ))}
                    </div>

                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value.slice(0, 4000))}
                      rows={6}
                      placeholder={t("feedback.placeholder")}
                      className="mt-3 w-full resize-none rounded-2xl border border-line bg-surface-2 px-3.5 py-3 text-[14px] leading-relaxed text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none"
                    />

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {images.map((img) => (
                        <div key={img.id} className="relative h-16 w-16 overflow-hidden rounded-xl border border-line">
                          {/* eslint-disable-next-line @next/next/no-img-element -- 端末で縮めた data URL の下見 */}
                          <img src={img.dataUrl} alt="" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            aria-label={t("feedback.photo.remove")}
                            onClick={() => setImages((prev) => prev.filter((p) => p.id !== img.id))}
                            className="pressable absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-canvas/80 text-fg"
                          >
                            <Icon name="close" className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {images.length < FEEDBACK_MAX_IMAGES && (
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          className="pressable flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-fg-2"
                        >
                          <Icon name="camera" className="h-5 w-5" />
                          <span className="text-[9px] font-bold">{t("feedback.photo.add")}</span>
                        </button>
                      )}
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          void addFiles(e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] text-fg-3">{t("feedback.photo.hint", { n: FEEDBACK_MAX_IMAGES })}</p>

                    {result && (
                      <p className="mt-3 text-[12px] font-semibold text-crimson-300">
                        {result === "rate" ? t("feedback.rate") : t("feedback.error")}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => void submit()}
                      disabled={!canSend}
                      className="pressable mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3.5 text-[14px] font-black text-on-accent shadow-glow disabled:opacity-40"
                    >
                      <Icon name="send" className="h-4 w-4" />
                      {sending ? t("feedback.sending") : t("feedback.send")}
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
