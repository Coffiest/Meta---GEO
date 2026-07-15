"use client";

import { useRef, useState } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { Avatar } from "./Avatar";

const MAX_AVATAR_DIMENSION = 256;
const AVATAR_JPEG_QUALITY = 0.75;

/** カメラロールから選んだ画像を正方形に切り抜いてリサイズし、data URI(JPEG)にする。 */
function fileToAvatarDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = MAX_AVATAR_DIMENSION;
        canvas.height = MAX_AVATAR_DIMENSION;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("画像の処理に失敗しました"));
          return;
        }
        ctx.drawImage(img, sx, sy, size, size, 0, 0, MAX_AVATAR_DIMENSION, MAX_AVATAR_DIMENSION);
        resolve(canvas.toDataURL("image/jpeg", AVATAR_JPEG_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

const EASE = [0.16, 1, 0.3, 1] as const;
const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/** この先に待っている3つの体験。初回オンボーディングで期待感を高めるために表示する(i18nキー)。 */
const NEXT_UP_KEYS = ["onb.next1", "onb.next2", "onb.next3"];

/**
 * 初回オンボーディング / プロフィール編集画面。名前は必須、アイコンはカメラロールから
 * 選ぶ任意項目(未設定なら頭文字アバターになる)。この画面を通過しない限りロビーは
 * 描画されないため、名前設定のスキップは構造的に不可能。
 * Swiss(モノクロ + ゴールドの単一アクセント)を保ったまま、アニメーションとコピーで
 * 「これからプレイする」高揚感を演出する。
 */
export function Onboarding({
  title = "プロフィールを設定",
  initialName = "",
  initialAvatarKey = null,
  submitLabel = "はじめる",
  saving = false,
  error = null,
  onSubmit,
  onCancel,
}: {
  title?: string;
  initialName?: string;
  initialAvatarKey?: string | null;
  submitLabel?: string;
  saving?: boolean;
  error?: string | null;
  onSubmit: (params: { displayName: string; avatarKey: string | null }) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [avatarKey, setAvatarKey] = useState<string | null>(initialAvatarKey);
  const [processing, setProcessing] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();
  const { t } = useI18n();
  const canSubmit = name.trim().length > 0 && !saving && !processing;
  // onCancelが無い = 初回オンボーディング。ここだけ高揚感のあるコピー/演出にする。
  const isFirstTime = !onCancel;

  const handlePickFile = async (file: File | undefined) => {
    if (!file) return;
    setPickError(null);
    setProcessing(true);
    try {
      setAvatarKey(await fileToAvatarDataUri(file));
    } catch {
      setPickError(t("onb.photoError"));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-ink-50 text-ink-950">
      {/* 背景のごく淡いゴールドの光(ログイン画面と統一) */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <motion.div
          className="absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-gold-400/20 blur-3xl"
          animate={reduce ? undefined : { scale: [1, 1.18, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pt-12 pb-10">
        {/* ブランド */}
        <motion.div initial="hidden" animate="show" variants={container}>
          <motion.div variants={item} className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-gold-500" />
            <span className="text-[13px] font-extrabold tracking-[0.22em] uppercase">Poker ART</span>
          </motion.div>

          {/* ヒーローコピー */}
          <motion.p variants={item} className="mt-9 text-[11px] font-bold tracking-[0.22em] uppercase text-gold-600">
            {isFirstTime ? t("onb.step") : t("onb.profile")}
          </motion.p>
          <motion.h1 variants={item} className="mt-2 text-[34px] font-extrabold leading-[1.05] tracking-tight text-balance">
            {isFirstTime ? (
              <>
                {t("onb.heroLine1")}
                <br />
                {t("onb.heroLine2")}
                <span className="text-gold-500">.</span>
              </>
            ) : (
              title
            )}
          </motion.h1>
          <motion.p variants={item} className="mt-3 text-[13px] leading-relaxed text-ink-600">
            {isFirstTime ? t("onb.leadFirst") : t("onb.leadEdit")}
          </motion.p>
        </motion.div>

        {/* 入力カード */}
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.55, ease: EASE }}
          className="mt-8 rounded-2xl border border-ink-200 bg-white p-6 shadow-panel"
        >
          {/* アバターピッカー */}
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="relative flex h-[108px] w-[108px] items-center justify-center transition-transform active:scale-95"
              aria-label="アイコン画像を選択"
            >
              {/* ゆっくり回る破線のゴールドリング(注目を集める幾何モチーフ) */}
              <motion.svg
                viewBox="0 0 108 108"
                className="absolute inset-0 h-full w-full text-gold-400"
                animate={reduce ? undefined : { rotate: 360 }}
                transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
              >
                <circle
                  cx="54"
                  cy="54"
                  r="52"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeDasharray="3 7"
                  strokeLinecap="round"
                />
              </motion.svg>
              <Avatar avatarKey={avatarKey} displayName={name} size={84} />
              <div className="absolute -bottom-0.5 -right-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-ink-950 text-white ring-2 ring-white">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-3.5 w-3.5">
                  <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2l1.2-1.6a1 1 0 0 1 .8-.4h3a1 1 0 0 1 .8.4L13.5 7h2A1.5 1.5 0 0 1 17 8.5v7A1.5 1.5 0 0 1 15.5 17h-11A1.5 1.5 0 0 1 3 15.5v-7Z" strokeLinejoin="round" />
                  <circle cx="10" cy="11.5" r="2.6" />
                </svg>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handlePickFile(e.target.files?.[0])}
            />
            <div className="flex items-center gap-3 text-[12px]">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="font-semibold text-ink-950 underline decoration-dashed underline-offset-2"
              >
                {processing ? t("onb.processing") : avatarKey ? t("onb.changePhoto") : t("onb.pickPhoto")}
              </button>
              {avatarKey && (
                <button onClick={() => setAvatarKey(null)} className="text-ink-500">
                  {t("onb.delete")}
                </button>
              )}
            </div>
            {pickError && <p className="text-[12px] text-crimson-500">{pickError}</p>}
          </div>

          {/* 名前入力 */}
          <div className="mt-6">
            <div className="mb-1.5 flex items-baseline justify-between">
              <label className="text-[12px] font-semibold tracking-wide text-ink-700">{t("onb.playerName")}</label>
              <span className="text-[11px] tabular-nums text-ink-400">{name.length}/16</span>
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && onSubmit({ displayName: name.trim(), avatarKey })}
              placeholder={t("onb.namePlaceholder")}
              maxLength={16}
              autoFocus={isFirstTime}
              autoComplete="off"
              enterKeyHint="go"
              className="w-full rounded-xl border border-ink-300 bg-white px-4 py-3 text-sm text-ink-950 placeholder:text-ink-400 focus:border-ink-950 focus:outline-none focus:ring-2 focus:ring-ink-950/5"
            />
          </div>

          {error && <p className="mt-3 px-1 text-[12px] text-crimson-500">{error}</p>}

          <button
            onClick={() => canSubmit && onSubmit({ displayName: name.trim(), avatarKey })}
            disabled={!canSubmit}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-ink-950 py-3.5 font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            <span>{saving ? t("onb.saving") : submitLabel}</span>
            {!saving && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            )}
          </button>

          {onCancel && (
            <button onClick={onCancel} className="mt-3 w-full py-1 text-[12px] text-ink-500">
              キャンセル
            </button>
          )}
        </motion.div>

        {/* この先に待っているもの(初回のみ・期待感の演出) */}
        {isFirstTime && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55, duration: 0.6 }}
            className="mt-8"
          >
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.22em] text-ink-400">{t("onb.nextUp")}</p>
            <div className="flex flex-wrap gap-2">
              {NEXT_UP_KEYS.map((key) => (
                <span
                  key={key}
                  className="rounded-full border border-ink-300 px-3 py-1.5 text-[12px] font-semibold text-ink-700"
                >
                  {t(key)}
                </span>
              ))}
            </div>
          </motion.div>
        )}

        <p className="mt-auto pt-8 text-center text-[11px] tracking-wide text-ink-400">
          {t("onb.footer")}
        </p>
      </div>
    </div>
  );
}
