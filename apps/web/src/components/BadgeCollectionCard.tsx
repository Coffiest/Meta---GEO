"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import {
  BADGE_KEY_ORDER,
  badgeProgress,
  badgeTargetLabel,
  fetchBadgeCollection,
  type Badge,
  type BadgeCollection,
  type BadgeKey,
} from "@/lib/badges";

/**
 * 系統ごとのSVGグリフ。絵文字は使わず、ストロークのモノクロアイコンで統一する
 * (獲得済みはゴールド、未獲得はグレーで塗り分ける)。
 */
function BadgeGlyph({ badgeKey, className = "h-5 w-5" }: { badgeKey: BadgeKey; className?: string }) {
  const paths: Record<BadgeKey, React.ReactNode> = {
    tournaments: (
      <>
        <rect x="4" y="5" width="16" height="14" rx="2.5" />
        <path d="M8 5V3.5M16 5V3.5M4 9.5h16" strokeLinecap="round" />
      </>
    ),
    wins: (
      <>
        <path d="M7 4h10v4.5a5 5 0 0 1-10 0V4Z" strokeLinejoin="round" />
        <path d="M7 5.2H4.6A2.4 2.4 0 0 0 7 8.4M17 5.2h2.4A2.4 2.4 0 0 1 17 8.4" strokeLinecap="round" />
        <path d="M12 13.3v3.4M9 20h6" strokeLinecap="round" />
      </>
    ),
    itm: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7.5v9M9.8 9.8h3.4a2 2 0 0 1 0 4H9.8m0 0h3.6" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    hands: (
      <>
        <rect x="3.5" y="4.5" width="10" height="14" rx="2" />
        <path d="M10.5 4.5h6a2 2 0 0 1 2 2v11" strokeLinecap="round" />
      </>
    ),
    rating: (
      <>
        <path d="M4 17.5 9 11l3.5 3.5L20 6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15.5 6H20v4.5" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    rank: (
      <>
        <path d="M12 3.5 14.2 8l5 .7-3.6 3.5.9 5-4.5-2.4L7.5 17.2l.9-5L4.8 8.7l5-.7L12 3.5Z" strokeLinejoin="round" />
      </>
    ),
    invites: (
      <>
        <circle cx="9" cy="8" r="3.4" />
        <path d="M3 20v-1a5.5 5.5 0 0 1 5.5-5.5h1A5.5 5.5 0 0 1 15 19v1" strokeLinecap="round" />
        <path d="M18.5 7.5v5M16 10h5" strokeLinecap="round" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className={className} aria-hidden="true">
      {paths[badgeKey]}
    </svg>
  );
}

/** X(旧Twitter)ロゴ。 */
function XLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817-5.966 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

function BadgeTile({ badge }: { badge: Badge }) {
  const { t } = useI18n();
  const progress = badgeProgress(badge);
  return (
    <div
      className={`relative flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center ${
        badge.achieved ? "border-gold-500 bg-gold-500/10" : "border-ink-200 bg-ink-50"
      }`}
    >
      <BadgeGlyph badgeKey={badge.key} className={`h-6 w-6 ${badge.achieved ? "text-gold-600" : "text-ink-300"}`} />
      <p className={`text-[11px] font-black leading-tight ${badge.achieved ? "text-ink-950" : "text-ink-400"}`}>
        {badgeTargetLabel(badge, t)}
      </p>
      {/* 未獲得は進捗バーで「あと少し」を見せる(順位バッジは進捗を測れないので出さない)。 */}
      {!badge.achieved && progress !== null && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-ink-200">
          <div className="h-full rounded-full bg-ink-400" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

/**
 * バッジ図鑑。Statsタブの先頭に置き、「あと1戦・あと1勝」の理由を作る。
 * バッジは専用テーブルを持たず、常に現在の実績から導出される(サーバー側 getBadgeCollection)。
 */
export function BadgeCollectionCard({ accessToken }: { accessToken?: string }) {
  const { t } = useI18n();
  const [collection, setCollection] = useState<BadgeCollection | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void fetchBadgeCollection(accessToken)
      .then((data) => {
        if (!cancelled) setCollection(data);
      })
      .catch(() => {
        /* 通信断。Statsタブの他の情報は妨げない。 */
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (!accessToken || !collection) return null;

  function handleShare() {
    const text = t("badge.shareText", {
      n: collection!.achievedCount,
      total: collection!.totalCount,
    });
    const intent =
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}` +
      `&url=${encodeURIComponent("https://meta-geo-poker.vercel.app")}` +
      `&hashtags=${encodeURIComponent("ポーカーアート,ポーカー")}`;
    try {
      globalThis.open?.(intent, "_blank", "noopener,noreferrer");
    } catch {
      /* ポップアップブロック等。無視する。 */
    }
  }

  const grouped = BADGE_KEY_ORDER.map((key) => ({
    key,
    badges: collection.badges.filter((b) => b.key === key).sort((a, b) => a.tier - b.tier),
  })).filter((g) => g.badges.length > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-[20px] border-[1.5px] border-ink-950 bg-white p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-ink-400">{t("badge.eyebrow")}</p>
          <h3 className="mt-1.5 text-[19px] font-black leading-tight tracking-tight text-ink-950">{t("badge.title")}</h3>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[22px] font-black leading-none tabular-nums text-ink-950">
            {collection.achievedCount}
            <span className="text-[13px] font-bold text-ink-400">/{collection.totalCount}</span>
          </p>
          <p className="mt-0.5 text-[10px] font-bold tracking-wide text-ink-500">{t("badge.acquired")}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3.5">
        {grouped.map((group) => (
          <div key={group.key}>
            <p className="mb-1.5 text-[11px] font-bold text-ink-600">{t(`badge.group.${group.key}`)}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {group.badges.map((badge) => (
                <BadgeTile key={`${badge.key}-${badge.tier}`} badge={badge} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleShare}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-ink-950 py-3 text-[13px] font-black text-white transition-transform active:scale-[0.98]"
      >
        <XLogo className="h-[15px] w-[15px]" />
        {t("badge.share")}
      </button>
    </motion.div>
  );
}
