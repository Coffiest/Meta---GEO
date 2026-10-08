"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FADE, SPRING_SHEET } from "@/lib/motion";
import { PricingPanel } from "@/components/PricingPanel";
import type { PlanId } from "@/lib/subscription";

/**
 * 料金(プラン選び)はページ移動ではなく、どこからでも下から出るシートで開く(オーナー指示)。
 * `/pricing` のページは URL を直接開いたときと Stripe からの戻り先として残す。
 */
type Ctx = { openPricing: (plan?: PlanId) => void };
const PricingSheetContext = createContext<Ctx>({ openPricing: () => {} });

export function usePricingSheet(): Ctx {
  return useContext(PricingSheetContext);
}

export function PricingSheetProvider({ children }: { children: ReactNode }) {
  const [plan, setPlan] = useState<PlanId | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const openPricing = useCallback((p?: PlanId) => setPlan(p ?? "gold"), []);
  const close = useCallback(() => setPlan(null), []);
  const value = useMemo(() => ({ openPricing }), [openPricing]);
  return (
    <PricingSheetContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {plan && (
              <motion.div
                key="pricing-sheet"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={FADE}
                onClick={close}
                className="fixed inset-0 z-[95] flex items-end justify-center bg-black/70 backdrop-blur-xl"
              >
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  aria-label="プランを選ぶ"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={SPRING_SHEET}
                  onClick={(e) => e.stopPropagation()}
                  className="h-[94dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[32px] bg-canvas shadow-e4"
                >
                  <PricingPanel initialPlan={plan} onClose={close} />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </PricingSheetContext.Provider>
  );
}
