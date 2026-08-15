"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { isStandalonePwa } from "@/lib/pwa";
import { disablePush, enablePush, fetchPushConfig, notificationPermission, pushSupported } from "@/lib/push";

/** ベルのSVGグリフ。絵文字は使わない。 */
function BellGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <Icon name="bell" className={className} />
  );
}

/**
 * プッシュ通知の許可カード。プライムタイム開始と招待成立を逃さないための導線。
 *
 * 表示するのは「まだ許可していない」かつ「この環境でプッシュが使える」かつ
 * 「サーバー側でVAPID鍵が設定されている」ときだけ。許可済みなら黙って消える
 * (ホームに常設のノイズを残さない)。
 * iOSでは、ホーム画面に追加したPWAでしか通知を使えないため、その場合は追加方法を案内する。
 */
import { ReportErrorButton } from "./ReportErrorButton";
import { Icon } from "./Icon";

export function PushOptInCard({ accessToken }: { accessToken?: string }) {
  const { t } = useI18n();
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [standalone, setStandalone] = useState(false);

  // 実行時判定はマウント後に行う(SSRとクライアントで描画がズレないように)。
  useEffect(() => {
    setSupported(pushSupported());
    setStandalone(isStandalonePwa());
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void fetchPushConfig(accessToken)
      .then((config) => {
        if (cancelled || !config) return;
        setPublicKey(config.available ? config.publicKey : null);
        // 許可を取り消した端末でもカードを出せるよう、購読状態はブラウザの許可状態と併せて判断する。
        setSubscribed(config.subscribed && notificationPermission() === "granted");
      })
      .catch(() => {
        /* 通信断。カードは出さない。 */
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (!accessToken || supported === null || subscribed === null) return null;
  // サーバーにVAPID鍵が無い(通知機能が無効)、または既に有効化済みなら何も出さない。
  if (!publicKey || subscribed) return null;

  // iOS Safariのタブなど、PWAとして起動していない環境ではPushManagerが存在しない。
  // その場合は「ホーム画面に追加すれば使える」ことだけ案内する。
  const needsInstall = !supported && !standalone;

  async function handleEnable() {
    if (!accessToken || !publicKey || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await enablePush(accessToken, publicKey);
      if (ok) setSubscribed(true);
      else setError(t("push.denied"));
    } catch {
      setError(t("push.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-[20px] border-[1.5px] border-ink-950 bg-white px-4 py-3"
    >
      {/* 文字を極力持たない1行構成: ベル図形 + 英字の小見出し + 右端のトグル型ボタン。 */}
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold-500/15 text-gold-600">
          <BellGlyph className="h-[18px] w-[18px]" />
        </span>
        <p className="min-w-0 flex-1 text-[11px] font-black uppercase tracking-[0.22em] text-ink-500">Alerts</p>

        {needsInstall ? (
          // インストールが先に必要な環境(iOSのSafariタブ等)は、共有→ホーム画面追加の図形だけ示す。
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-100 text-ink-500" aria-label={t("push.installFirst")}>
            <Icon name="share" className="h-[18px] w-[18px]" />
          </span>
        ) : (
          <button
            onClick={() => void handleEnable()}
            disabled={busy}
            aria-label={busy ? t("push.enabling") : t("push.enable")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold-500 text-ink-950 transition-transform active:scale-[0.94] disabled:opacity-50"
          >
            <Icon name="check" className="h-[17px] w-[17px]" weight="bold" />
          </button>
        )}
      </div>

      {error && (
        <div className="mt-2">
          <p className="text-[11.5px] font-semibold text-crimson-500">{error}</p>
          <ReportErrorButton scope="push" message={error} className="mt-1.5" />
        </div>
      )}
    </motion.div>
  );
}

/** 設定メニュー等から通知を切るためのヘルパー(現状はホームのカードからは戻せないため個別に公開)。 */
export async function turnOffPush(accessToken: string): Promise<void> {
  await disablePush(accessToken);
}
