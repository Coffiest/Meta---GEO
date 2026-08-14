"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
  fetchCouponWallet,
  formatCouponDate,
  redeemCoupon,
  type CouponCode,
  type CouponWallet as Wallet,
} from "@/lib/coupons";

/** コピー用グリフ(重ねた2枚のカード)。絵文字は使わずSVGで統一する。 */
function CopyGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <Icon name="copy" className={className} />
  );
}

/** コピー完了を示すチェック。 */
function CheckGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <Icon name="check" className={className} />
  );
}

/** クーポン(切り欠きのあるチケット)を示すグリフ。 */
function TicketGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <Icon name="ticket" className={className} />
  );
}

/**
 * 獲得した「棋譜解析プラン1ヶ月無料」クーポンの一覧。いつでも中身を確認でき、コードは
 * タップ1回でコピーできる。未使用のクーポンはその場で適用でき、適用すると棋譜解析の
 * 無料期間が1ヶ月伸びる(残りがあればその後ろへ積み上がる)。
 *
 * 人から貰ったコードを貼り付けて使うための入力欄も持つ(クーポンは1枚1回だけ使える)。
 *
 * `onRedeemed` は適用が成功したときに呼ばれる。ペイウォールから使ったとき、その場で
 * 解析を再取得するために使う。
 */
import { ReportErrorButton } from "./ReportErrorButton";
import { Icon } from "./Icon";

export function CouponWallet({
  accessToken,
  onRedeemed,
  compact = false,
}: {
  accessToken: string | undefined;
  onRedeemed?: () => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const reload = useCallback(async () => {
    if (!accessToken) return;
    const data = await fetchCouponWallet(accessToken).catch(() => null);
    if (data) setWallet(data);
  }, [accessToken]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!accessToken) return null;

  async function handleCopy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      window.setTimeout(() => setCopied((c) => (c === code ? null : c)), 1600);
    } catch {
      /* クリップボード不可の環境ではコードを手で読み上げてもらう。 */
    }
  }

  async function applyCode(rawCode: string, busyKey: string) {
    if (!accessToken || busy) return;
    setBusy(busyKey);
    setMessage(null);
    try {
      const result = await redeemCoupon(accessToken, rawCode);
      if (!result) {
        setMessage({ tone: "error", text: t("coupon.error.failed") });
      } else if (result.ok) {
        setCodeInput("");
        setMessage({
          tone: "ok",
          text: t("coupon.applied", { n: String(result.months), date: formatCouponDate(result.expiresAt) }),
        });
        await reload();
        onRedeemed?.();
      } else {
        setMessage({ tone: "error", text: t(`coupon.error.${result.reason}`) });
      }
    } catch {
      setMessage({ tone: "error", text: t("coupon.error.failed") });
    } finally {
      setBusy(null);
    }
  }

  const coupons = wallet?.coupons ?? [];
  const available = coupons.filter((c) => c.redeemedAt == null);
  // ペイウォールでは「いま使えるもの」だけを出す(使用済みの履歴はホームで見られる)。
  const shown = compact ? available : coupons;
  const premium = wallet?.premium;

  return (
    <div
      className={
        compact
          ? "rounded-[20px] border border-ink-300 bg-white p-3.5"
          : "rounded-[20px] border-[1.5px] border-ink-950 bg-white p-4"
      }
    >
      <div className="flex items-center gap-2">
        <TicketGlyph className="h-4 w-4 text-gold-600" />
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-ink-400">{t("coupon.eyebrow")}</p>
        {available.length > 0 && (
          <span className="ml-auto rounded-full bg-gold-500 px-2 py-[2px] text-[10px] font-black tabular-nums text-ink-950">
            {t("coupon.availableCount", { n: String(available.length) })}
          </span>
        )}
      </div>
      {!compact && (
        <>
          <h3 className="mt-1.5 text-[19px] font-black leading-tight tracking-tight text-ink-950">
            {t("coupon.title")}
          </h3>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-600">{t("coupon.lead")}</p>
        </>
      )}

      {/* いま有効な無料期間 */}
      {premium?.active && premium.expiresAt && (
        <p className="mt-3 rounded-xl bg-gold-500/15 px-3.5 py-2.5 text-[12px] font-bold text-gold-700">
          {t("coupon.premiumUntil", { date: formatCouponDate(premium.expiresAt) })}
        </p>
      )}

      {/* クーポン一覧。コードは常に見えていて、タップ1回でコピーできる。 */}
      {shown.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {shown.map((coupon) => (
            <CouponRow
              key={coupon.code}
              coupon={coupon}
              copied={copied === coupon.code}
              busy={busy === coupon.code}
              disabled={busy != null}
              onCopy={() => void handleCopy(coupon.code)}
              onUse={() => void applyCode(coupon.code, coupon.code)}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-xl bg-ink-50 px-3.5 py-3 text-[12px] leading-relaxed text-ink-500">
          {t("coupon.empty")}
        </p>
      )}

      {/* 貰ったコードの手入力(貼り付け) */}
      <div className="mt-3">
        <div className="flex gap-2">
          <input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && void applyCode(codeInput, "input")}
            placeholder={t("coupon.enterCode")}
            maxLength={24}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-xl border border-ink-300 px-3.5 py-2.5 font-mono text-[14px] tracking-[0.12em] text-ink-950 placeholder:font-sans placeholder:text-[12px] placeholder:tracking-normal placeholder:text-ink-400 focus:border-ink-950 focus:outline-none"
          />
          <button
            onClick={() => void applyCode(codeInput, "input")}
            disabled={busy != null || codeInput.trim().length === 0}
            className="shrink-0 rounded-xl bg-ink-950 px-4 text-[13px] font-black text-white transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            {busy === "input" ? t("coupon.applying") : t("coupon.apply")}
          </button>
        </div>
        {message && (
          <div className="mt-1.5">
            <p
              className={`text-[11.5px] font-semibold ${message.tone === "ok" ? "text-gold-700" : "text-crimson-500"}`}
            >
              {message.text}
            </p>
            {/* 失敗時だけ報告導線を出す(成功メッセージには不要)。 */}
            {message.tone !== "ok" && (
              <ReportErrorButton scope="coupon" message={message.text} className="mt-1.5" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CouponRow({
  coupon,
  copied,
  busy,
  disabled,
  onCopy,
  onUse,
}: {
  coupon: CouponCode;
  copied: boolean;
  busy: boolean;
  disabled: boolean;
  onCopy: () => void;
  onUse: () => void;
}) {
  const { t } = useI18n();
  const used = coupon.redeemedAt != null;

  return (
    <li
      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
        used ? "border-ink-200 bg-ink-50" : "border-ink-300 bg-white"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p
          className={`font-mono text-[15px] font-black leading-none tracking-[0.1em] ${
            used ? "text-ink-400 line-through" : "text-ink-950"
          }`}
        >
          {coupon.code}
        </p>
        <p className="mt-1 text-[10.5px] font-bold text-ink-500">
          {used
            ? coupon.redeemedByMe
              ? t("coupon.usedByMe", { date: formatCouponDate(coupon.redeemedAt!) })
              : t("coupon.usedByOther", { date: formatCouponDate(coupon.redeemedAt!) })
            : t("coupon.worth", { n: String(coupon.months) })}
        </p>
      </div>
      {!used && (
        <>
          <button
            onClick={onCopy}
            aria-label={t("coupon.copy")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink-300 text-ink-600 transition-transform active:scale-[0.95]"
          >
            {copied ? <CheckGlyph className="h-4 w-4 text-gold-600" /> : <CopyGlyph className="h-4 w-4" />}
          </button>
          <button
            onClick={onUse}
            disabled={disabled}
            className="shrink-0 rounded-lg bg-gold-500 px-3 py-2 text-[12px] font-black text-ink-950 transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            {busy ? t("coupon.applying") : t("coupon.use")}
          </button>
        </>
      )}
    </li>
  );
}
