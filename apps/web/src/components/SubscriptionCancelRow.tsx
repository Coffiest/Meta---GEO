"use client";

import { useEffect, useState } from "react";
import { subscriptionCancel, type CancelState } from "@/lib/subscription";

/**
 * メニューの「サブスク解除」(オーナー指示)。期間末で止める形なので、払った期間は最後まで使える。
 * Stripe の契約がある人にだけ出す。押すと確認を挟んでから解除し、解除の予定は取り消せる。
 */
export function SubscriptionCancelRow({ accessToken }: { accessToken: string }) {
  const [state, setState] = useState<CancelState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void subscriptionCancel(accessToken).then(setState).catch(() => setState(null));
  }, [accessToken]);

  if (!state?.cancelable) return null;
  const until = state.periodEnd ? new Date(state.periodEnd).toLocaleDateString() : null;

  const run = async (resume: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setState(await subscriptionCancel(accessToken, resume));
      setConfirming(false);
    } catch {
      setError("処理できませんでした。時間をおいて再度お試しください。");
    }
    setBusy(false);
  };

  if (state.cancelAtPeriodEnd) {
    return (
      <div className="px-3 py-3.5 text-sm">
        <p className="text-fg">サブスク解除済み</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-n-9">
          {until ? `${until} まで使えます。` : ""}以降は更新・請求されません。
        </p>
        <button
          onClick={() => void run(true)}
          disabled={busy}
          className="pressable mt-2 text-[12px] font-bold text-accent disabled:opacity-60"
        >
          {busy ? "処理中…" : "解除を取り消して続ける"}
        </button>
        {error && <p className="mt-1.5 text-[11px] font-semibold text-crimson-300">{error}</p>}
      </div>
    );
  }

  return (
    <div className="py-1">
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="pressable w-full flex items-center justify-between px-3 py-3.5 text-sm text-crimson-300"
        >
          サブスク解除 <span className="text-n-9">›</span>
        </button>
      ) : (
        <div className="rounded-xl bg-crimson-500/[0.06] px-3 py-3">
          <p className="text-[13px] font-black text-crimson-300">サブスクを解除しますか?</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-n-9">
            {until ? `${until} までは今のプランのまま使えます。` : ""}その後は自動で更新されず、請求もされません。日割りの返金はありません。
          </p>
          {error && <p className="mt-2 text-[11px] font-semibold text-crimson-300">{error}</p>}
          <div className="mt-2.5 flex gap-2">
            <button
              onClick={() => void run(false)}
              disabled={busy}
              className="pressable flex-1 rounded-lg bg-crimson-600 py-2 text-[12px] font-bold text-white disabled:opacity-60"
            >
              {busy ? "処理中…" : "解除する"}
            </button>
            <button
              onClick={() => {
                setConfirming(false);
                setError(null);
              }}
              disabled={busy}
              className="pressable flex-1 rounded-lg bg-n-4 py-2 text-[12px] font-bold text-n-10"
            >
              やめる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
