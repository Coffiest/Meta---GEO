"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { buildInviteUrl, fetchReferralSummary, redeemReferral, type ReferralSummary } from "@/lib/referral";
import { fetchCouponWallet, formatCouponDate, redeemCoupon, type CouponWallet } from "@/lib/coupons";
import { shareOrTweet } from "@/lib/share";
import { Icon } from "./Icon";

/** クーポンコードは "GEO" + 8文字(premiumCoupons.ts)。それ以外は招待コードとして扱う。 */
function isCouponCode(code: string): boolean {
  return /^GEO[A-Z0-9]{8}$/.test(code);
}

/**
 * メニューの「友達を招待 / クーポン」を1枚にまとめたカード(オーナー指示 2026-10-12: 短い文で直感的に)。
 * - 招待コードを大きく見せ、コピー(招待リンク)と送る(共有シート)
 * - 招待した人数と持っているクーポンの数は1行
 * - 使えるクーポンがあるときだけ一覧(使う / コピー)
 * - コードの入力欄は1つ。クーポンコード(GEO…)か招待コードかを見分けて適用する
 * 特典は棋譜解析の無料期間だけで、バーチャルチップは配らない(以前の InviteCard と同じ設計)。
 */
export function InviteCouponCard({ accessToken }: { accessToken: string }) {
  const { t } = useI18n();
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [wallet, setWallet] = useState<CouponWallet | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const reload = useCallback(async () => {
    const [s, w] = await Promise.all([
      fetchReferralSummary(accessToken).catch(() => null),
      fetchCouponWallet(accessToken).catch(() => null),
    ]);
    if (s) setSummary(s);
    if (w) setWallet(w);
  }, [accessToken]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!summary) return null;

  const available = (wallet?.coupons ?? []).filter((c) => c.redeemedAt == null);
  const premium = wallet?.premium;

  function copy(text: string, key: string) {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    });
  }

  async function share() {
    await shareOrTweet({
      text: t("invite.shareText", { code: summary!.code }),
      url: buildInviteUrl(summary!.code),
      surface: "invite",
      hashtags: ["ポーカーアート", "ポーカー"],
    });
  }

  async function useCoupon(code: string, key: string) {
    setBusy(key);
    setMessage(null);
    try {
      const result = await redeemCoupon(accessToken, code);
      if (result?.ok) {
        setInput("");
        setEntering(false);
        setMessage({
          ok: true,
          text:
            result.days != null
              ? t("coupon.appliedDays", { n: String(result.days), date: formatCouponDate(result.expiresAt) })
              : t("coupon.applied", { n: String(result.months), date: formatCouponDate(result.expiresAt) }),
        });
        await reload();
      } else {
        setMessage({ ok: false, text: t(`coupon.error.${result && !result.ok ? result.reason : "failed"}`) });
      }
    } catch {
      setMessage({ ok: false, text: t("coupon.error.failed") });
    } finally {
      setBusy(null);
    }
  }

  async function submitInput() {
    const code = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!code || busy) return;
    if (isCouponCode(code)) return useCoupon(code, "input");
    setBusy("input");
    setMessage(null);
    try {
      const result = await redeemReferral(accessToken, code);
      if (result?.ok) {
        setInput("");
        setEntering(false);
        setMessage({ ok: true, text: t("invite.invitedBy", { name: result.inviterDisplayName }) });
        await reload();
      } else {
        setMessage({ ok: false, text: t(`invite.error.${result && !result.ok ? result.reason : "failed"}`) });
      }
    } catch {
      setMessage({ ok: false, text: t("invite.error.failed") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-[20px] border-[1.5px] border-line-strong bg-surface p-4">
      <div className="flex items-center gap-2">
        <Icon name="user-plus" className="h-4 w-4 text-accent" />
        <h3 className="text-[15px] font-black text-fg">{t("inviteCard.title")}</h3>
        {available.length > 0 && (
          <span className="ml-auto rounded-full bg-accent px-2 py-[2px] text-[10px] font-black tabular-nums text-on-accent">
            {t("coupon.availableCount", { n: String(available.length) })}
          </span>
        )}
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-fg-2">
        {t("inviteCard.lead", {
          q: String(summary.reward.qualifyTournaments),
          n: String(summary.reward.daysPerInvite),
        })}
      </p>

      {/* 招待コード。コードを押すとコードだけ、「コピー」は招待リンクをコピーする。 */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => copy(summary.code, "code")}
          aria-label={t("invite.yourCode")}
          className="pressable min-w-0 flex-1 rounded-xl bg-canvas px-3 py-2 text-left"
        >
          <span className="block text-[9.5px] font-bold text-fg-3">{t("invite.yourCode")}</span>
          <span className="block truncate font-mono text-[19px] font-black leading-tight tracking-[0.16em] text-fg">
            {copied === "code" ? t("inviteCard.copied") : summary.code}
          </span>
        </button>
        <button
          type="button"
          onClick={() => copy(buildInviteUrl(summary.code), "link")}
          className="pressable flex h-12 shrink-0 flex-col items-center justify-center rounded-xl bg-surface-2 px-3 text-[10.5px] font-black text-fg"
        >
          <Icon name={copied === "link" ? "check" : "copy"} className="mb-0.5 h-4 w-4" />
          {copied === "link" ? t("inviteCard.copied") : t("inviteCard.copy")}
        </button>
        <button
          type="button"
          onClick={() => void share()}
          className="pressable flex h-12 shrink-0 flex-col items-center justify-center rounded-xl bg-accent px-3 text-[10.5px] font-black text-on-accent"
        >
          <Icon name="share" className="mb-0.5 h-4 w-4" />
          {t("inviteCard.share")}
        </button>
      </div>

      <p className="mt-2 text-[11px] font-bold tabular-nums text-fg-3">
        {t("inviteCard.stats", {
          people: String(summary.invitedCount),
          coupons: String(available.length),
        })}
        {summary.invitedByDisplayName && ` ・ ${t("invite.invitedBy", { name: summary.invitedByDisplayName })}`}
      </p>

      {premium?.active && premium.expiresAt && (
        <p className="mt-2 rounded-lg bg-accent/15 px-3 py-2 text-[11.5px] font-bold text-accent">
          {t("coupon.premiumUntil", { date: formatCouponDate(premium.expiresAt) })}
        </p>
      )}

      {/* 使えるクーポン(あるときだけ) */}
      {available.length > 0 && (
        <ul className="mt-2.5">
          {available.map((c) => (
            <li key={c.code} className="flex items-center gap-2 border-t border-line py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[13px] font-black tracking-[0.08em] text-fg">{c.code}</p>
                <p className="text-[10.5px] font-bold text-fg-3">
                  {c.days != null ? t("coupon.worthDays", { n: String(c.days) }) : t("coupon.worth", { n: String(c.months) })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => copy(c.code, c.code)}
                aria-label={t("coupon.copy")}
                className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-3"
              >
                <Icon name={copied === c.code ? "check" : "copy"} className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void useCoupon(c.code, c.code)}
                disabled={busy != null}
                className="pressable shrink-0 rounded-lg bg-accent/15 px-3 py-1.5 text-[12px] font-black text-accent ring-1 ring-accent disabled:opacity-40"
              >
                {busy === c.code ? t("coupon.applying") : t("coupon.use")}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* コードの入力(招待コード・クーポンコードの両方) */}
      {entering ? (
        <div className="mt-2.5 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && void submitInput()}
            placeholder={t("inviteCard.enterPlaceholder")}
            maxLength={24}
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="input-inset min-w-0 flex-1 rounded-full px-3.5 py-2 font-mono text-[13px] tracking-[0.1em] text-fg placeholder:font-sans placeholder:text-[11.5px] placeholder:tracking-normal placeholder:text-fg-3 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void submitInput()}
            disabled={busy != null || input.trim().length === 0}
            className="pressable shrink-0 rounded-xl bg-surface-2 px-3.5 text-[12px] font-black text-fg disabled:opacity-40"
          >
            {busy === "input" ? t("coupon.applying") : t("coupon.apply")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEntering(true)}
          className="pressable mt-2 text-[11.5px] font-bold text-fg-3 underline decoration-dashed underline-offset-2"
        >
          {t("inviteCard.enter")}
        </button>
      )}
      {message && (
        <p className={`mt-1.5 text-[11.5px] font-semibold ${message.ok ? "text-accent" : "text-crimson-300"}`}>{message.text}</p>
      )}
    </div>
  );
}
