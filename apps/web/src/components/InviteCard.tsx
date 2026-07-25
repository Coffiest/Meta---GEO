"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import {
  buildInviteUrl,
  fetchReferralSummary,
  redeemReferral,
  type ReferralSummary,
} from "@/lib/referral";

/** 友達招待の導線を示すグリフ(人物+プラス)。絵文字は使わずSVGで統一する。 */
function InviteGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden="true">
      <circle cx="9" cy="8" r="3.4" />
      <path d="M3 20v-1a5.5 5.5 0 0 1 5.5-5.5h1A5.5 5.5 0 0 1 15 19v1" strokeLinecap="round" />
      <path d="M18.5 7.5v5M16 10h5" strokeLinecap="round" />
    </svg>
  );
}

/** 称号バッジのグリフ(リボン付きメダル)。 */
function TierGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden="true">
      <circle cx="12" cy="9" r="5" />
      <path d="M8.5 13.4 7 21l5-2.4L17 21l-1.5-7.6" strokeLinejoin="round" />
    </svg>
  );
}

/** X(旧Twitter)ロゴ。絵文字禁止のためSVGで実装。 */
function XLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817-5.966 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

/**
 * ホームの「友達を招待」カード。招待コード/リンクの共有と、招待成立数に応じた称号を表示する。
 * 報酬はバーチャルチップではなく称号のみ(射幸性と自己招待による増殖を避けるための意図的な設計)。
 * まだ誰の招待も受けていないユーザーには、招待コードの手入力欄も出す。
 */
export function InviteCard({ accessToken }: { accessToken?: string }) {
  const { t } = useI18n();
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [copied, setCopied] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [showRedeem, setShowRedeem] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void fetchReferralSummary(accessToken)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        /* 通信断。カードは非表示のままにする(ホームの他の情報は妨げない)。 */
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (!accessToken || !summary) return null;

  const inviteUrl = buildInviteUrl(summary.code);
  const tierLabel = summary.tier ? t(`invite.tier.${summary.tier}`) : null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* クリップボード不可の環境ではコードを手で読み上げてもらう。 */
    }
  }

  function handleShareX() {
    const text = t("invite.shareText", { code: summary!.code });
    const intent =
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}` +
      `&url=${encodeURIComponent(inviteUrl)}` +
      `&hashtags=${encodeURIComponent("ポーカーアート,ポーカー")}`;
    try {
      window.open(intent, "_blank", "noopener,noreferrer");
    } catch {
      /* ポップアップブロック等。無視する。 */
    }
  }

  async function handleRedeem() {
    if (!accessToken || !codeInput.trim() || redeeming) return;
    setRedeeming(true);
    setRedeemError(null);
    try {
      const result = await redeemReferral(accessToken, codeInput);
      if (!result) {
        setRedeemError(t("invite.error.failed"));
      } else if (result.ok) {
        setCodeInput("");
        setShowRedeem(false);
        setSummary(await fetchReferralSummary(accessToken));
      } else {
        setRedeemError(t(`invite.error.${result.reason}`));
      }
    } catch {
      setRedeemError(t("invite.error.failed"));
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-[20px] border-[1.5px] border-ink-950 bg-white p-4"
    >
      <div className="flex items-center gap-2">
        <InviteGlyph className="h-4 w-4 text-gold-600" />
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-ink-400">{t("invite.eyebrow")}</p>
      </div>
      <h3 className="mt-1.5 text-[19px] font-black leading-tight tracking-tight text-ink-950">{t("invite.title")}</h3>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-600">{t("invite.lead")}</p>

      {/* 招待成立数と現在の称号 */}
      <div className="mt-3.5 flex items-stretch gap-2">
        <div className="flex-1 rounded-xl bg-ink-50 px-3.5 py-2.5">
          <p className="text-[10px] font-bold tracking-wide text-ink-500">{t("invite.count")}</p>
          <p className="mt-0.5 text-[20px] font-black leading-none tabular-nums text-ink-950">
            {summary.invitedCount}
            <span className="ml-0.5 text-[12px] font-bold text-ink-500">{t("invite.people")}</span>
          </p>
        </div>
        <div className="flex-1 rounded-xl bg-ink-50 px-3.5 py-2.5">
          <p className="text-[10px] font-bold tracking-wide text-ink-500">{t("invite.tierLabel")}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[14px] font-black leading-none text-ink-950">
            {tierLabel ? (
              <>
                <TierGlyph className="h-4 w-4 shrink-0 text-gold-500" />
                {tierLabel}
              </>
            ) : (
              <span className="text-ink-400">{t("invite.tier.none")}</span>
            )}
          </p>
        </div>
      </div>

      {summary.nextTier && (
        <p className="mt-2 text-[11.5px] font-semibold text-gold-600">
          {t("invite.nextTier", {
            n: String(summary.nextTier.minInvites - summary.invitedCount),
            tier: t(`invite.tier.${summary.nextTier.key}`),
          })}
        </p>
      )}
      {!summary.nextTier && <p className="mt-2 text-[11.5px] font-semibold text-gold-600">{t("invite.maxTier")}</p>}

      {/* 招待コード */}
      <div className="mt-3.5 rounded-xl border border-ink-300 bg-white px-3.5 py-2.5">
        <p className="text-[10px] font-bold tracking-wide text-ink-500">{t("invite.yourCode")}</p>
        <p className="mt-0.5 font-mono text-[22px] font-black leading-none tracking-[0.18em] text-ink-950">{summary.code}</p>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <button
          onClick={() => void handleCopy()}
          className="rounded-xl border border-ink-950 bg-white py-3 text-[13px] font-black text-ink-950 transition-transform active:scale-[0.98]"
        >
          {copied ? t("invite.copied") : t("invite.copy")}
        </button>
        <button
          onClick={handleShareX}
          className="flex items-center justify-center gap-2 rounded-xl bg-ink-950 py-3 text-[13px] font-black text-white transition-transform active:scale-[0.98]"
        >
          <XLogo className="h-[15px] w-[15px]" />
          {t("invite.shareX")}
        </button>
      </div>

      {/* 招待してくれた人 / 招待コードの手入力 */}
      {summary.invitedByDisplayName ? (
        <p className="mt-3 text-[11.5px] text-ink-500">
          {t("invite.invitedBy", { name: summary.invitedByDisplayName })}
        </p>
      ) : showRedeem ? (
        <div className="mt-3">
          <div className="flex gap-2">
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && void handleRedeem()}
              placeholder={t("invite.enterCode")}
              maxLength={16}
              autoComplete="off"
              autoCapitalize="characters"
              className="min-w-0 flex-1 rounded-xl border border-ink-300 px-3.5 py-2.5 font-mono text-[14px] tracking-[0.14em] text-ink-950 placeholder:font-sans placeholder:text-[12px] placeholder:tracking-normal placeholder:text-ink-400 focus:border-ink-950 focus:outline-none"
            />
            <button
              onClick={() => void handleRedeem()}
              disabled={redeeming || codeInput.trim().length === 0}
              className="shrink-0 rounded-xl bg-gold-500 px-4 text-[13px] font-black text-ink-950 transition-transform active:scale-[0.98] disabled:opacity-40"
            >
              {redeeming ? t("invite.applying") : t("invite.apply")}
            </button>
          </div>
          {redeemError && <p className="mt-1.5 text-[11.5px] font-semibold text-crimson-500">{redeemError}</p>}
        </div>
      ) : (
        <button
          onClick={() => setShowRedeem(true)}
          className="mt-3 text-[11.5px] font-semibold text-ink-500 underline decoration-dashed underline-offset-2"
        >
          {t("invite.haveCode")}
        </button>
      )}
    </motion.div>
  );
}
