"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/Icon";
import { usePricingSheet } from "@/components/PricingSheet";
import { useAuth } from "@/lib/useAuth";
import { SPRING_SHEET } from "@/lib/motion";
import { SUBSCRIPTION_CHANGED_EVENT, TOURNAMENT_FINISHED_EVENT, fetchTrialOffer, useCountdown } from "@/lib/subscription";

/** 同じオファー(期限が同じ)は1回だけ自動で出す。閉じたら、料金の画面にだけ残り時間が出る。 */
const SEEN_KEY = "trialOfferSeen";

/**
 * 7日間無料の特別オファー(オーナー確定 2026-10-12: インマネ10回ごとに1回、1時間だけ)。
 * トーナメントが終わったとき・アプリを開いたとき・画面に戻ったときに確かめ、出ていれば下からシートで知らせる。
 * 期限まで残り時間を数え、「プランを見る」で料金のシートを開く(そこで「7日間 無料で試す」が押せる)。
 * PricingSheetProvider の中(ルートの layout)に置く。
 */
export function TrialOfferPopup() {
  const { accessToken } = useAuth();
  const { openPricing } = usePricingSheet();
  const [offer, setOffer] = useState<{ until: string; days: number } | null>(null);
  const [open, setOpen] = useState(false);
  const left = useCountdown(offer?.until);

  const check = useCallback(async () => {
    if (!accessToken) return;
    const result = await fetchTrialOffer(accessToken).catch(() => null);
    if (!result?.offerUntil) {
      setOffer(null);
      setOpen(false);
      return;
    }
    setOffer({ until: result.offerUntil, days: result.trialDays });
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(SEEN_KEY);
    } catch {
      seen = null;
    }
    if (seen !== result.offerUntil) {
      setOpen(true);
      try {
        localStorage.setItem(SEEN_KEY, result.offerUntil);
      } catch {
        /* 次に開いたときもう一度出るだけ */
      }
    }
  }, [accessToken]);

  useEffect(() => {
    void check();
    // トーナメントの結果が記録されるのを少し待ってから確かめる。
    const onFinished = () => setTimeout(() => void check(), 2500);
    const onVisible = () => document.visibilityState === "visible" && void check();
    window.addEventListener(TOURNAMENT_FINISHED_EVENT, onFinished);
    window.addEventListener(SUBSCRIPTION_CHANGED_EVENT, check);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(TOURNAMENT_FINISHED_EVENT, onFinished);
      window.removeEventListener(SUBSCRIPTION_CHANGED_EVENT, check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  const visible = open && offer != null && left != null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="trial-offer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70"
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SPRING_SHEET}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="特別オファー"
            className="w-full max-w-md glass-sheet rounded-t-sheet p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] text-center shadow-e4"
          >
            <div className="flex justify-end">
              <button onClick={() => setOpen(false)} className="pressable text-fg-3" aria-label="閉じる">
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-accent">SPECIAL OFFER</p>
            <h2 className="mt-1.5 text-[22px] font-black leading-tight text-fg">
              インマネ10回達成
              <br />
              {offer.days}日間 無料で試せます
            </h2>
            <p className="mt-2 text-[12px] leading-relaxed text-fg-2">
              棋譜解析の使い放題・GEO データベースなど、どのプランでも{offer.days}日間無料。
              <br />
              このオファーは1時間だけです。
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <Icon name="clock" className="h-5 w-5 text-accent" />
              <span className="text-[40px] font-black tabular-nums leading-none text-fg">{left}</span>
            </div>
            <p className="mt-1 text-[10.5px] text-fg-3">残り時間</p>
            <button
              onClick={() => {
                setOpen(false);
                openPricing();
              }}
              className="pressable mt-5 w-full rounded-2xl bg-accent py-3.5 text-[15px] font-black text-on-accent shadow-glow"
            >
              プランを見る
            </button>
            <p className="mt-2.5 text-[10.5px] leading-relaxed text-fg-3">
              体験中に解約すれば料金はかかりません。次のオファーはインマネ10回ごとに出ます。
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
