"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const SEEN_KEY = "pokerart.tour.v1.seen";

/** すでにチュートリアルを見終えたか(localStorage永続・端末単位)。 */
export function hasTourBeenSeen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // localStorage不可の環境では毎回出して邪魔にならないよう、出さない側に倒す
  }
}

function markTourSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* no-op */
  }
}

type Platform = "ios" | "android" | "other";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path d="M12 3v12" strokeLinecap="round" />
      <path d="m8 7 4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MenuDotsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

/** タブ/機能インデックスのアイコン。ロゴ画像内では絵文字を使わずSVGのみ。 */
function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}
function StatsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}
function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" className="h-5 w-5">
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </svg>
  );
}
function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M6 4h12v4a6 6 0 0 1-12 0V4Z" />
      <path d="M6 6H3v1a3 3 0 0 0 3 3M18 6h3v1a3 3 0 0 1-3 3" />
      <path d="M12 14v3M9 21h6M10 21v-1.5a2 2 0 0 1 4 0V21" />
    </svg>
  );
}
function DatabaseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
    </svg>
  );
}

const FEATURE_SLIDES: { icon: React.ReactNode; title: string; body: string }[] = [
  { icon: <HomeIcon />, title: "Home", body: "偏差値・戦績を確認し、Playボタンから Sit&Go / MTT にすぐ参加できます。" },
  { icon: <StatsIcon />, title: "Stats", body: "収支・ROI・インマネ率など、あなたの戦績を数値で振り返れます。" },
  { icon: <LayersIcon />, title: "History", body: "過去のトーナメントを一覧。棋譜解析でGTO精度スコアも確認できます。" },
  { icon: <TrophyIcon />, title: "Leaderboard", body: "全プレイヤーのランキング。偏差値で自分の立ち位置がわかります。" },
  { icon: <DatabaseIcon />, title: "Database", body: "GEO DATABASE。全プレイヤーの実測アクションから、大衆の“リーク”が見えます。" },
];

/**
 * 初回ログイン時のみ一度だけ表示するオンボーディングチュートリアル。
 * 1) 各タブでできることをざっと紹介 → 2) iOS/Android別のホーム画面追加手順、の2部構成。
 * localStorage(端末単位)で既読管理し、以降は二度と出さない。
 */
export function WelcomeTour({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [platform, setPlatform] = useState<Platform>("other");

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  const totalSteps = 1 + FEATURE_SLIDES.length + 1; // 導入 + 機能紹介 + ホーム画面追加
  const isIntro = step === 0;
  const isAddHome = step === totalSteps - 1;
  const featureIndex = step - 1;

  function next() {
    if (step < totalSteps - 1) setStep((s) => s + 1);
    else finish();
  }
  function finish() {
    markTourSeen();
    onDone();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col bg-white"
    >
      {/* スキップ */}
      <div className="flex justify-end px-5 pt-[calc(env(safe-area-inset-top)+12px)]">
        <button onClick={finish} className="cursor-pointer text-[12px] font-bold text-ink-400 active:text-ink-700">
          スキップ
        </button>
      </div>

      {/* 進捗ドット */}
      <div className="flex justify-center gap-1.5 pt-2">
        {Array.from({ length: totalSteps }, (_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-gold-500" : "w-1.5 bg-ink-200"}`} />
        ))}
      </div>

      <div className="flex flex-1 items-center justify-center px-8">
        <AnimatePresence mode="wait">
          {isIntro && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.35 }}
              className="text-center"
            >
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-gold-600">Welcome</p>
              <h1 className="mt-3 text-[28px] font-black leading-tight tracking-tight text-ink-950">
                Poker ARTへ
                <br />
                ようこそ。
              </h1>
              <p className="mt-4 text-[13px] leading-relaxed text-ink-600">
                かんたんに、どこで何ができるかご案内します。
                <br />
                30秒で終わります。
              </p>
            </motion.div>
          )}

          {!isIntro && !isAddHome && (
            <motion.div
              key={`feature-${featureIndex}`}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.3 }}
              className="text-center"
            >
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-ink-950 text-ink-950">
                {FEATURE_SLIDES[featureIndex]!.icon}
              </span>
              <h2 className="mt-5 text-[22px] font-black tracking-tight text-ink-950">{FEATURE_SLIDES[featureIndex]!.title}</h2>
              <p className="mx-auto mt-3 max-w-[280px] text-[13px] leading-relaxed text-ink-600">{FEATURE_SLIDES[featureIndex]!.body}</p>
            </motion.div>
          )}

          {isAddHome && (
            <motion.div
              key="add-home"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-[320px] text-center"
            >
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-gold-600">最後に</p>
              <h2 className="mt-2 text-[22px] font-black leading-snug tracking-tight text-ink-950">
                ホーム画面に追加すると
                <br />
                アプリのように使えます。
              </h2>

              {platform === "ios" ? (
                <div className="mt-6 space-y-3 text-left">
                  <Step n="1" icon={<ShareIcon />} text={<>下部の共有ボタン（<b>□↑</b>）をタップ</>} />
                  <Step n="2" text="「ホーム画面に追加」を選択" />
                  <Step n="3" text="右上の「追加」をタップして完了" />
                </div>
              ) : platform === "android" ? (
                <div className="mt-6 space-y-3 text-left">
                  <Step n="1" icon={<MenuDotsIcon />} text="右上のメニュー（縦の3点）をタップ" />
                  <Step n="2" text="「ホーム画面に追加」または「アプリをインストール」を選択" />
                  <Step n="3" text="「追加」をタップして完了" />
                </div>
              ) : (
                <div className="mt-6 space-y-3 text-left">
                  <Step n="1" text="スマートフォンでこのページを開いてください" />
                  <Step n="2" text="ブラウザのメニューから「ホーム画面に追加」を選択できます" />
                </div>
              )}

              <p className="mt-5 text-[11px] leading-relaxed text-ink-400">
                追加すると、アドレスバーの無いアプリ画面として起動します。
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="px-8 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <button
          onClick={next}
          className="w-full cursor-pointer rounded-full bg-ink-950 py-3.5 text-[14px] font-black text-white transition-transform active:scale-[0.98]"
        >
          {isAddHome ? "はじめる" : "次へ"}
        </button>
      </div>
    </motion.div>
  );
}

function Step({ n, icon, text }: { n: string; icon?: React.ReactNode; text: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-ink-50 px-3.5 py-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-950 text-[11px] font-black text-white">{n}</span>
      {icon && <span className="text-ink-950">{icon}</span>}
      <p className="text-[12.5px] leading-snug text-ink-800">{text}</p>
    </div>
  );
}
