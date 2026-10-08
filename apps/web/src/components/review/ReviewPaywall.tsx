"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CouponWallet } from "@/components/CouponWallet";
import { Icon } from "../Icon";
import { FADE, SPRING_SHEET } from "@/lib/motion";
import { useSubscriptionStatus } from "@/lib/subscription";
import { usePricingSheet } from "@/components/PricingSheet";

/**
 * 棋譜解析の無料枠(24時間に1回)を使い切った人が、2回目の局後検討を開こうとしたときのポップアップ
 * (オーナー指示。chess.com の「局後検討を無制限に!」の作りを参考にする)。
 * 押すとプランを選ぶ画面(/pricing)へ進む。特定のプランは勧めず、シルバー/ゴールド/プラチナから選んでもらう。
 * 根拠の無い数字(「上達が○倍」など)は書かない。課金せずに開放する手段として、招待のクーポンも残す。
 */

function nextFreeText(nextFreeAt: string | null): string | null {
  if (!nextFreeAt) return null;
  const ms = new Date(nextFreeAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `次の無料解析まで あと約${h}時間` : `次の無料解析まで あと約${Math.max(1, m)}分`;
}

/** 虫眼鏡と分類バッジの挿絵(SVG。絵文字は使わない)。色は棋譜解析の分類の配色(データ可視化の例外)。 */
function ReviewArt() {
  return (
    <svg viewBox="0 0 220 170" className="mx-auto h-[150px] w-auto" aria-hidden>
      <defs>
        <pattern id="rp-board" width="24" height="24" patternUnits="userSpaceOnUse">
          <rect width="24" height="24" fill="#1d3b34" />
          <rect width="12" height="12" fill="#2a5a4f" />
          <rect x="12" y="12" width="12" height="12" fill="#2a5a4f" />
        </pattern>
      </defs>
      <rect x="50" y="20" width="120" height="120" rx="8" fill="url(#rp-board)" />
      <circle cx="104" cy="74" r="34" fill="#0A0A0B" stroke="#d9d9de" strokeWidth="7" />
      <circle cx="104" cy="74" r="25" fill="#26c2a3" />
      <path d="M104 58l5 10 11 1.6-8 7.8 1.9 11L104 83l-9.9 5.4L96 77.4l-8-7.8 11-1.6z" fill="#04211B" />
      <rect x="126" y="98" width="12" height="34" rx="6" transform="rotate(-45 132 115)" fill="#8e8e93" />
      <circle cx="46" cy="30" r="20" fill="#26c2a3" />
      <text x="46" y="37" textAnchor="middle" fontSize="20" fontWeight="900" fill="#04211B">!!</text>
      <circle cx="178" cy="62" r="18" fill="#f5b70a" />
      <text x="178" y="69" textAnchor="middle" fontSize="18" fontWeight="900" fill="#1c1400">?!</text>
      <circle cx="56" cy="140" r="20" fill="#e5484d" />
      <text x="56" y="147" textAnchor="middle" fontSize="20" fontWeight="900" fill="#fff">??</text>
    </svg>
  );
}

export function ReviewPaywall({
  tournamentId,
  accessToken,
  nextFreeAt,
  onUnlocked,
  onClose,
}: {
  tournamentId: string;
  accessToken: string | undefined;
  nextFreeAt: string | null;
  /** クーポン適用などで解析が開放されたときに呼ばれる(呼び出し側で解析を取り直す)。 */
  onUnlocked?: () => void;
  /** ×で閉じる(局後検討を閉じる)。 */
  onClose?: () => void;
}) {
  const { status } = useSubscriptionStatus(accessToken);
  const trial = status?.trialEligible ?? false;
  const trialDays = status?.trialDays ?? 7;
  const countdown = nextFreeText(nextFreeAt);
  // 視差の動きを減らす設定の人には、拡大・移動なしの短いフェードだけにする。
  const reduce = useReducedMotion();
  const { openPricing } = usePricingSheet();

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={reduce ? FADE : SPRING_SHEET}
      className="relative mx-auto w-full max-w-[380px] rounded-[24px] bg-surface-2 px-5 pb-5 pt-6 shadow-e4"
      role="dialog"
      aria-labelledby="review-paywall-title"
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="pressable absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-fg-2"
        >
          <Icon name="close" className="h-5 w-5" />
        </button>
      )}

      <ReviewArt />

      <div className="mt-3 flex justify-center">
        <span className="rounded-md bg-accent/15 px-2.5 py-1 text-[11px] font-black text-accent">
          今日の無料解析を使い切りました
        </span>
      </div>
      <h2 id="review-paywall-title" className="mt-3 text-center text-[26px] font-black leading-tight tracking-tight text-fg">
        局後検討を無制限に!
      </h2>
      <p className="mt-2 text-center text-[13px] leading-relaxed text-fg-2">
        プレミアム会員なら、どのトーナメントも待たずに何度でも解析。全ハンドを GTO 基準で採点し、解説付きで振り返れます。
      </p>

      <button
          type="button"
        onClick={() => openPricing()}
        className="pressable mt-5 flex h-14 w-full items-center justify-center gap-1.5 rounded-2xl bg-accent text-[17px] font-black text-on-accent shadow-glow"
      >
        さあプレミアム会員に
        <Icon name="chevron-right" className="h-5 w-5" />
      </button>
      <p className="mt-2 text-center text-[11px] leading-relaxed text-fg-3">
        {trial ? `シルバー・ゴールド・プラチナから選べます。はじめての方は${trialDays}日間無料。` : "シルバー・ゴールド・プラチナから選べます。"}
      </p>
      {countdown && <p className="mt-1 text-center text-[11px] font-bold text-fg-3 tabular-nums">{countdown}</p>}

      {/* 課金以外の開放手段。招待で貰ったクーポンをここで適用すると無料期間のあいだ解析できる。 */}
      <div className="mt-4 border-t border-line pt-3">
        <CouponWallet accessToken={accessToken} onRedeemed={onUnlocked} compact />
      </div>
    </motion.div>
  );
}
