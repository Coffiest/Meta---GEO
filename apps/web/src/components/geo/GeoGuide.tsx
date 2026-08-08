"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * GEO DATABASE の使い方チュートリアル(スワイプ式)。
 *
 * 旧「近日公開」プロモ(GeoComingSoon)を刷新したもの。GEO を一般開放したので、
 * 「何ができるか / どう使うか」を数枚のスライドで案内し、最後の「使ってみる」で本体へ入る。
 * 初回のみ自動表示(localStorage で既読管理)し、以降はハンバーガーメニューからのみ再表示する。
 * WelcomeTour と同じ操作感(全画面・進捗ドット・スキップ・スライド遷移)に揃えている。
 */

const SEEN_KEY = "pokerart.geoGuide.v1.seen";

/** すでに使い方チュートリアルを見終えたか(localStorage永続・端末単位)。 */
export function hasGeoGuideBeenSeen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // localStorage不可の環境では出さない側に倒す
  }
}

export function markGeoGuideSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* no-op */
  }
}

// ---- スライドで使うSVGアイコン(絵文字禁止のためストロークSVGで実装) ----
function RecordIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
    </svg>
  );
}
function RouteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="18" cy="5" r="2.5" />
      <path d="M8.5 19H14a3.5 3.5 0 0 0 0-7H10a3.5 3.5 0 0 1 0-7h5.5" />
    </svg>
  );
}
function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <path d="M3 5h18l-7 8v5l-4 2v-7L3 5Z" />
    </svg>
  );
}

/** GTO と GEO の対比表(コンパクト版)。「何が違うのか」を1枚で伝える。 */
function GtoVsGeoMini() {
  const rows: { label: string; gto: string; geo: string }[] = [
    { label: "相手の想定", gto: "全員が完璧", geo: "現実の大衆" },
    { label: "データ源", gto: "理論計算", geo: "実測プレイ" },
    { label: "教えてくれること", gto: "正解の打ち方", geo: "相手のミスの突き方" },
  ];
  return (
    <div className="mx-auto mt-6 w-full max-w-[320px] overflow-hidden rounded-[18px] border-[1.5px] border-ink-950 bg-white text-left">
      <div className="grid grid-cols-[1fr_auto_1fr]">
        <div className="px-3 py-2.5 text-center">
          <p className="text-[14px] font-black tracking-tight text-ink-400">GTO</p>
          <p className="mt-0.5 text-[9px] font-bold text-ink-400">理論値</p>
        </div>
        <div className="flex items-center">
          <span className="rounded-full border border-ink-300 px-2 py-0.5 text-[9px] font-black text-ink-500">vs</span>
        </div>
        <div className="bg-ink-950 px-3 py-2.5 text-center">
          <p className="text-[14px] font-black tracking-tight text-gold-500">GEO</p>
          <p className="mt-0.5 text-[9px] font-bold text-white/60">実測値</p>
        </div>
      </div>
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[1fr_auto_1fr] items-center border-t border-ink-200">
          <p className="px-2 py-2.5 text-center text-[11.5px] font-bold text-ink-500">{row.gto}</p>
          <p className="w-[84px] text-center text-[9px] font-black uppercase tracking-wider text-ink-400">{row.label}</p>
          <p className="px-2 py-2.5 text-center text-[11.5px] font-black text-ink-950">{row.geo}</p>
        </div>
      ))}
    </div>
  );
}

type Slide = {
  key: string;
  eyebrow?: string;
  icon?: React.ReactNode;
  title: React.ReactNode;
  body: React.ReactNode;
  extra?: React.ReactNode;
};

const SLIDES: Slide[] = [
  {
    key: "intro",
    eyebrow: "GEO DATABASE",
    title: (
      <>
        みんなの一手を、
        <br />
        ぜんぶ記録。
      </>
    ),
    body: (
      <>
        GEO ＝ General Exploit Optimal 、通称「大衆エクスプロイト戦略」。
        <br />
        全プレイヤーの実測アクションを集めて、勝つためのヒントに変えるデータベースです。
      </>
    ),
    extra: (
      <span className="mt-5 inline-block rounded-full bg-gold-500 px-3 py-1 text-[10px] font-black tracking-wide text-ink-950">
        大衆エクスプロイト戦略
      </span>
    ),
  },
  {
    key: "gto-vs-geo",
    icon: <RecordIcon />,
    title: "GTO との違い",
    body: (
      <>
        GTO が「完璧な相手にどう打つか(理論値)」なら、GEO は「現実の大衆が実際にどう打っているか(実測値)」。
        <br />
        理論とのズレ＝みんなの共通のミスを突くのが、GEO の狙いです。
      </>
    ),
    extra: <GtoVsGeoMini />,
  },
  {
    key: "matrix",
    icon: <GridIcon />,
    title: "レンジ表の見方",
    body: (
      <>
        169 通りのハンドを、実測のアクション頻度で色分けして表示します。
        <br />
        気になるマスをタップすると、フォールド/コール/レイズなどの内訳と、集計に使ったサンプル件数まで確認できます。
      </>
    ),
  },
  {
    key: "line",
    icon: <RouteIcon />,
    title: "局面をたどる",
    body: (
      <>
        ポジション別のアクションを選んでいくと、プリフロップからフロップ・ターン・リバーまで局面を再現できます。
        <br />
        途中まで巻き戻したり、2人以上残った局面ではボード(板面)を選んでポストフロップも分析できます。
      </>
    ),
  },
  {
    key: "filter",
    icon: <FilterIcon />,
    title: "条件で絞り込む",
    body: (
      <>
        スタック深度・参加人数・トナメ偏差値帯・インマネまでの残り人数(ICM)で、見たい状況だけに絞れます。
        <br />
        上部のタブで、実測の「GEO」と検証用の「GTO」を切り替えられます。
      </>
    ),
  },
];

/**
 * GEO DATABASE の使い方チュートリアル。最後のスライドの「使ってみる」で onDone を呼び、
 * 呼び出し側(/geo)が本体を表示する。スキップでも onDone(=そのまま本体へ)。
 */
export function GeoGuide({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const total = SLIDES.length;
  const isLast = step === total - 1;

  function finish() {
    markGeoGuideSeen();
    onDone();
  }
  function next() {
    if (isLast) finish();
    else setStep((s) => s + 1);
  }

  const slide = SLIDES[step]!;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col bg-white"
    >
      {/* スキップ(押しても本体へ入れる) */}
      <div className="flex justify-end px-5 pt-[calc(env(safe-area-inset-top)+12px)]">
        <button onClick={finish} className="cursor-pointer text-[12px] font-bold text-ink-400 active:text-ink-700">
          スキップ
        </button>
      </div>

      {/* 進捗ドット */}
      <div className="flex justify-center gap-1.5 pt-2">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-gold-500" : "w-1.5 bg-ink-200"}`} />
        ))}
      </div>

      <div className="flex flex-1 items-center justify-center px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.key}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-[360px] text-center"
          >
            {slide.eyebrow && (
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-gold-600">{slide.eyebrow}</p>
            )}
            {slide.icon && (
              <span className="mx-auto mt-2 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-ink-950 text-ink-950">
                {slide.icon}
              </span>
            )}
            <h2 className="mt-4 text-[22px] font-black leading-snug tracking-tight text-ink-950">{slide.title}</h2>
            <p className="mx-auto mt-3 max-w-[320px] text-[13px] leading-relaxed text-ink-600">{slide.body}</p>
            {slide.extra}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="px-8 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <button
          onClick={next}
          className="w-full cursor-pointer rounded-full bg-ink-950 py-3.5 text-[14px] font-black text-white transition-transform active:scale-[0.98]"
        >
          {isLast ? "使ってみる" : "次へ"}
        </button>
      </div>
    </motion.div>
  );
}
