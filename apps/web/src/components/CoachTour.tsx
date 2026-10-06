"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BallyBubble } from "./BallyBubble";
import { Icon } from "./Icon";
import { useI18n } from "@/lib/i18n";
import { FADE, SPRING_MOVE } from "@/lib/motion";

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

/**
 * 1つの段。`target` はホームの実際の要素の `data-tour` 属性の値。無ければ画面の中央にバリィだけ出す。
 * 文言は i18n の `tour.<id>`。
 */
interface TourStep {
  id: string;
  target?: string;
}

const STEPS: TourStep[] = [
  { id: "intro" },
  { id: "play", target: "play" },
  { id: "elite", target: "elite" },
  { id: "rating", target: "rating" },
  { id: "stats", target: "tab-stats" },
  { id: "history", target: "tab-history" },
  { id: "db", target: "tab-db" },
  { id: "leaderboard", target: "tab-leaderboard" },
  { id: "menu", target: "menu" },
  { id: "feedback", target: "feedback" },
  { id: "home" },
];

type Platform = "ios" | "android" | "other";
function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

/** スポットライトの余白(要素の外側にこれだけ広げて穴を開ける)。 */
const PAD = 6;

function measure(target: string): Rect | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!el) return null;
  const b = el.getBoundingClientRect();
  if (b.width === 0 || b.height === 0) return null;
  const radius = parseFloat(getComputedStyle(el.firstElementChild ?? el).borderRadius) || 16;
  return { x: b.left - PAD, y: b.top - PAD, w: b.width + PAD * 2, h: b.height + PAD * 2, r: Math.min(radius + PAD, (b.height + PAD * 2) / 2) };
}

/**
 * 初回のチュートリアル(コーチマーク)。全画面のスライドではなく、ホームの実際のボタンや欄に
 * 1つずつスポットライトを当て、バリィの吹き出しで「これは〜です」と説明する(オーナー指示)。
 *
 * - 暗幕は、穴の位置に置いた箱の大きな box-shadow で作る。穴はスプリング(SPRING_MOVE)で次の要素へ移る。
 * - 対象は画面内へスクロールしてから測る。スクロール・回転・リサイズのたびに測り直す。
 * - 対象が見つからない段(未ログインで出ない要素など)は飛ばす。
 * - 最後はホーム画面への追加の案内(端末ごと)。localStorage で既読を残し、以降は出さない。
 */
export function CoachTour({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [vh, setVh] = useState(0);
  const [platform, setPlatform] = useState<Platform>("other");
  const step = STEPS[index]!;

  useEffect(() => {
    setMounted(true);
    setPlatform(detectPlatform());
  }, []);

  const finish = useCallback(() => {
    markTourSeen();
    onDone();
  }, [onDone]);

  const go = useCallback(
    (dir: 1 | -1) => {
      let i = index + dir;
      // 対象が画面に無い段は飛ばす。
      while (i > 0 && i < STEPS.length - 1 && STEPS[i]!.target && !document.querySelector(`[data-tour="${STEPS[i]!.target}"]`)) {
        i += dir;
      }
      if (i >= STEPS.length) finish();
      else setIndex(Math.max(0, i));
    },
    [index, finish],
  );

  // 対象を画面内へ動かしてから測る。スクロールやリサイズでも測り直す。
  useLayoutEffect(() => {
    const target = step.target;
    setVh(window.innerHeight);
    if (!target) {
      setRect(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
    const fixed = el ? getComputedStyle(el.closest("nav") ?? el).position === "fixed" : false;
    if (el && !fixed) el.scrollIntoView({ block: "center", behavior: "smooth" });
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setRect(measure(target));
        setVh(window.innerHeight);
      });
    };
    update();
    // スムーススクロールの間も追いかける(数フレームだけ)。
    const timers = [120, 260, 420, 600].map((ms) => window.setTimeout(update, ms));
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [step.target]);

  if (!mounted) return null;

  const isLast = index === STEPS.length - 1;
  // 吹き出しは対象の下に空きがあれば下、無ければ上に置く。
  const below = rect ? rect.y + rect.h + 220 < vh : true;
  const bubbleStyle: React.CSSProperties = rect
    ? below
      ? { top: rect.y + rect.h + 12 }
      : { bottom: vh - rect.y + 12 }
    : { top: "50%", transform: "translateY(-50%)" };

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label={t("tour.aria")}>
      {/* 暗幕(穴あき)。対象が無い段は全面を暗くする。 */}
      <motion.div
        className="pointer-events-none absolute"
        initial={false}
        animate={
          rect
            ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: rect.r, opacity: 1 }
            : { left: "50%", top: "50%", width: 0, height: 0, borderRadius: 0, opacity: 1 }
        }
        transition={SPRING_MOVE}
        style={{ boxShadow: "0 0 0 200vmax rgb(0 0 0 / 0.74)" }}
      >
        {rect && <span className="absolute inset-0 rounded-[inherit] ring-2 ring-accent shadow-glow" />}
      </motion.div>
      {/* 暗幕の上のタップは吸収する(下のボタンを押させない)。 */}
      <div className="absolute inset-0" />

      <div className="absolute inset-x-0 px-4" style={bubbleStyle}>
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            initial={{ opacity: 0, y: below ? 8 : -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={FADE}
            className="mx-auto w-full max-w-md rounded-[20px] glass-sheet p-3.5 shadow-e4"
          >
            <BallyBubble size={step.target ? "md" : "lg"}>
              {step.id === "intro" && <span className="mb-1 block text-[15px] font-black text-fg">{t("tour.intro.title")}</span>}
              {step.id === "home" ? (
                <>
                  <span className="block">{t("tour.home")}</span>
                  <span className="mt-1.5 block text-[11px] font-semibold leading-relaxed text-fg-2">
                    {platform === "ios" ? t("tour.home.ios") : platform === "android" ? t("tour.home.android") : t("tour.home.other")}
                  </span>
                </>
              ) : (
                t(`tour.${step.id}`)
              )}
            </BallyBubble>

            <div className="mt-3 flex items-center gap-2">
              <span className="text-[10px] font-bold tabular-nums text-fg-3">
                {index + 1} / {STEPS.length}
              </span>
              {!isLast && (
                <button type="button" onClick={finish} className="pressable px-1.5 text-[11px] font-bold text-fg-3">
                  {t("tour.skip")}
                </button>
              )}
              <span className="flex-1" />
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label={t("tour.back")}
                  className="pressable flex h-9 w-9 items-center justify-center rounded-full border border-line text-fg-2"
                >
                  <Icon name="chevron-left" className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => (isLast ? finish() : go(1))}
                className="pressable flex h-9 items-center gap-1 rounded-full bg-accent px-4 text-[12px] font-black text-on-accent shadow-glow"
              >
                {isLast ? t("tour.start") : t("tour.next")}
                {!isLast && <Icon name="chevron-right" className="h-3.5 w-3.5" />}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>,
    document.body,
  );
}
