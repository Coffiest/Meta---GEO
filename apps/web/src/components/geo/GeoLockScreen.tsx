"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Icon } from "@/components/Icon";
import { useI18n } from "@/lib/i18n";
import { SPRING_MOVE } from "@/lib/motion";

/**
 * GEO DATABASE の利用条件(インマネ20回以上)を満たしていないときに、データベースタブの代わりに出す画面。
 * High Roller の条件のポップアップと同じ構成(錠・見出し・今の値 / 必要な値)に、進み具合のバーを添える。
 * 遊んでもらうための仕掛けなので、「あと○回」を大きく見せ、ロビーへ戻る導線を置く。
 */
export function GeoLockScreen({
  itmCount,
  required,
  onShowGuide,
}: {
  itmCount: number;
  required: number;
  /** 「GEO でできることを見る」(説明の全画面を開く)。 */
  onShowGuide?: () => void;
}) {
  const { t } = useI18n();
  const remaining = Math.max(0, required - itmCount);
  const ratio = required > 0 ? Math.min(1, itmCount / required) : 0;
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
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
        <h1 className="mt-1 text-[22px] font-black tracking-tight text-fg">GEO DATABASE</h1>

        <div className="mt-5 flex items-baseline justify-between gap-3 tabular-nums">
          <span className="text-[13px] font-semibold text-fg-2">{t("geo.lock.req.itm")}</span>
          <span className="text-[15px] font-black text-fg">
            {itmCount}
            <span className="font-semibold text-fg-3"> / {required}</span>
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={required} aria-valuenow={itmCount}>
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(ratio * 100)}%` }} />
        </div>
        <p className="mt-3 text-[13px] font-bold text-accent">{t("geo.lock.remaining", { n: remaining })}</p>
        <p className="mt-2 text-[12px] leading-relaxed text-fg-3">{t("geo.lock.hint", { n: required })}</p>

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
      </motion.div>
    </div>
  );
}
