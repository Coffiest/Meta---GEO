"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Icon } from "@/components/Icon";
import { usePricingSheet } from "@/components/PricingSheet";
import { useI18n } from "@/lib/i18n";
import { FADE, SPRING_MOVE } from "@/lib/motion";
import { bucketColor } from "./colors";
import { demoBucket } from "./GeoGuide";

/** 段階ごとの解放の回数(サーバーの `packages/db/src/geoAccess.ts` と同じ。表示用)。 */
const PREFLOP_AT = 10;
const POSTFLOP_AT = 20;

/**
 * GEO DATABASE の利用条件の錠(オーナー確定: インマネ10回でプリフロップまで、20回でポストフロップ以降とデータ研究)。
 * High Roller の条件のポップアップと同じ構成(錠・見出し・今の値 / 必要な値)に、進み具合のバーと、
 * 段階の一覧と、なぜ縛っているかの説明(GEO は実際のプレイデータで成り立っている)を添える。
 * 遊んでもらうための仕掛けなので、「あと○回」を大きく見せ、ロビーへ戻る導線を置く。
 *
 * stage = "preflop": まだ何も使えない(全画面) / "postflop": プリフロップまでの人がポストフロップ以降を開いた。
 */
/** preflop / postflop = インマネ回数の錠。gold / platinum = そのプランが要る(プランの錠)。 */
export type GeoLockStage = "preflop" | "postflop" | "gold" | "platinum";

/** アップグレードの印(ダイヤ。SVG)。 */
function GemMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
      <path d="M6 3h12l4 6-10 12L2 9z" fill="currentColor" />
      <path d="M2 9h20M9 3l3 6 3-6M12 9v12" stroke="#26c2a3" strokeWidth="1.2" fill="none" opacity="0.55" />
    </svg>
  );
}

/** ぼかした見本の行(実データは出さない。何が見られるかの雰囲気だけ伝える)。 */
const PREVIEW_ROWS = ["UTG", "HJ", "CO", "BTN", "SB"];

/**
 * プランが足りないときの錠(オーナー指示: chess.com の「高度な統計情報をゲット」のポップアップにならう)。
 * 見出し・説明・アップグレードボタン(→ プラン選択)と、その下にぼかした見本を置く。
 */
function PlanLockCard({ plan, onClose }: { plan: "gold" | "platinum"; onClose?: () => void }) {
  const { openPricing } = usePricingSheet();
  const { t } = useI18n();
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduce ? FADE : SPRING_MOVE}
      className="relative w-full max-w-[380px] overflow-hidden rounded-[22px] bg-surface-2 p-1.5 shadow-e4 ring-1 ring-inset ring-line"
      role="dialog"
      aria-labelledby="geo-plan-lock-title"
    >
      <div className="px-4 pb-4 pt-5">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="pressable absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-fg-3"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        )}
        <h1 id="geo-plan-lock-title" className="pr-8 text-[24px] font-black leading-tight tracking-tight text-fg">
          {t(`geo.lock.plan.${plan}`)}
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-2">{t(`geo.lock.planBody.${plan}`)}</p>
        <button
          type="button"
          onClick={() => openPricing(plan)}
          className="pressable mt-4 flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-accent text-[18px] font-black text-on-accent shadow-glow"
        >
          <GemMark />
          {t("geo.lock.planCta")}
        </button>
      </div>

      {/* ぼかした見本 */}
      <div className="rounded-[18px] bg-canvas" aria-hidden>
        <div className="flex border-b border-line px-3 text-[13px] font-black">
          {["Preflop", "Flop", "Turn", "River"].map((tab, i) => (
            <span key={tab} className={`relative flex-1 py-3 text-center ${i === 0 ? "text-fg" : "text-fg-3"}`}>
              {tab}
              {i === 0 && <span className="absolute inset-x-2 -bottom-px h-[3px] rounded-full bg-accent" />}
            </span>
          ))}
        </div>
        {/* ぼかしたレンジ表(実データではなく見本の配色。何が見られるかの雰囲気だけ伝える)。 */}
        <div className="px-3 pb-3 pt-2">
          <div className="mb-2 flex gap-1.5 text-[11px] font-black">
            {PREVIEW_ROWS.map((pos, i) => (
              <span key={pos} className={`rounded-full px-2.5 py-1 ${i === 3 ? "bg-accent/15 text-accent" : "text-fg-3"}`}>
                {pos}
              </span>
            ))}
          </div>
          <div className="grid gap-[2px] blur-[5px]" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
            {Array.from({ length: 169 }, (_, k) => (
              <span
                key={k}
                className="aspect-square rounded-[2px]"
                style={{ backgroundColor: bucketColor(demoBucket(Math.floor(k / 13), k % 13)) }}
              />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function GeoLockCard(props: {
  itmCount: number;
  required: number;
  stage?: GeoLockStage;
  onShowGuide?: () => void;
  onClose?: () => void;
}) {
  if (props.stage === "gold" || props.stage === "platinum") return <PlanLockCard plan={props.stage} onClose={props.onClose} />;
  return <ItmLockCard {...props} stage={props.stage} />;
}

function ItmLockCard({
  itmCount,
  required,
  stage = "preflop",
  onShowGuide,
  onClose,
}: {
  itmCount: number;
  required: number;
  stage?: "preflop" | "postflop";
  /** 「GEO でできることを見る」(説明の全画面を開く)。 */
  onShowGuide?: () => void;
  /** 渡すと「閉じる」を出す(ポストフロップの錠をシートで出すとき)。 */
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const remaining = Math.max(0, required - itmCount);
  const ratio = required > 0 ? Math.min(1, itmCount / required) : 0;
  const steps = [
    { at: PREFLOP_AT, label: t("geo.lock.stage.preflop") },
    { at: POSTFLOP_AT, label: t("geo.lock.stage.postflop") },
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_MOVE}
      className="w-full max-w-[360px] rounded-2xl bg-surface-2 p-6 shadow-e4"
    >
      <div className="flex items-center gap-2">
        <Icon name="lock" className="h-4 w-4 shrink-0 text-fg-2" />
        <p className="text-[11px] font-black tracking-[0.08em] text-fg-2">{t("geo.lock.title")}</p>
      </div>
      <h1 className="mt-1 text-[22px] font-black tracking-tight text-fg">
        {stage === "postflop" ? t("geo.lock.postflopTitle") : "GEO DATABASE"}
      </h1>

      <div className="mt-5 flex items-baseline justify-between gap-3 tabular-nums">
        <span className="text-[13px] font-semibold text-fg-2">{t("geo.lock.req.itm")}</span>
        <span className="text-[15px] font-black text-fg">
          {itmCount}
          <span className="font-semibold text-fg-3"> / {required}</span>
        </span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={required}
        aria-valuenow={itmCount}
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      <p className="mt-3 text-[13px] font-bold text-accent">
        {stage === "postflop" ? t("geo.lock.remainingPostflop", { n: remaining }) : t("geo.lock.remaining", { n: remaining })}
      </p>

      {/* 段階の一覧(10回 = プリフロップ / 20回 = ポストフロップ以降・データ研究)。 */}
      <ul className="mt-3 space-y-1.5">
        {steps.map((s) => {
          const done = itmCount >= s.at;
          return (
            <li key={s.at} className="flex items-center gap-2 text-[12px]">
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${done ? "bg-accent text-on-accent" : "bg-surface-3 text-fg-3"}`}
              >
                <Icon name={done ? "check" : "lock"} className="h-2.5 w-2.5" />
              </span>
              <span className="w-14 shrink-0 font-black tabular-nums text-fg">{t("geo.lock.stage.times", { n: s.at })}</span>
              <span className={done ? "font-semibold text-fg" : "text-fg-2"}>{s.label}</span>
            </li>
          );
        })}
      </ul>

      {/* なぜ縛っているか(オーナー指示の説明)。 */}
      <p className="mt-4 rounded-xl bg-canvas px-3 py-2.5 text-[11.5px] leading-relaxed text-fg-2">{t("geo.lock.why")}</p>

      <Link
        href="/"
        className="pressable mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3 text-[14px] font-black text-on-accent shadow-glow"
      >
        {t("geo.lock.play")}
        <Icon name="arrow-right" className="h-4 w-4" />
      </Link>
      {onShowGuide && (
        <button
          type="button"
          onClick={onShowGuide}
          className="pressable mt-2.5 w-full rounded-full border border-line py-2.5 text-[12px] font-bold text-fg-2"
        >
          {t("geo.lock.guide")}
        </button>
      )}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="pressable mt-2.5 w-full rounded-full border border-line py-2.5 text-[12px] font-bold text-fg-2"
        >
          {t("common.close")}
        </button>
      )}
    </motion.div>
  );
}

/** まだ GEO DATABASE を使えないときに、データベースタブの代わりに出す全画面。 */
export function GeoLockScreen(props: {
  itmCount: number;
  required: number;
  stage?: GeoLockStage;
  onShowGuide?: () => void;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-canvas px-6 py-8">
      {/* 錠の画面からも戻れるように(オーナー指摘)。 */}
      <Link
        href="/"
        aria-label="ホームへ戻る"
        className="pressable absolute left-4 top-[calc(env(safe-area-inset-top)+12px)] flex h-10 items-center gap-1 rounded-full bg-surface-2 pl-2.5 pr-3.5 text-[13px] font-bold text-fg"
      >
        <Icon name="chevron-left" className="h-4 w-4" />
        戻る
      </Link>
      <GeoLockCard {...props} />
    </div>
  );
}
