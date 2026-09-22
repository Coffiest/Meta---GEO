"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Icon } from "./Icon";
import { isStandalonePwa } from "@/lib/pwa";

const DISMISSED_KEY = "pokerart.installCardDismissed.v1";

type Platform = "ios" | "android" | "other";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

/**
 * ブラウザのタブで開いている間だけ出す「ホーム画面に追加」の案内。
 *
 * ホーム画面から起動していない限り、アドレスバーとツールバーを消すことはできない
 * (ブラウザのタブである以上OSが必ず出す)。さらにiOSは、Safariのタブとホーム画面の
 * アプリでストレージを別々に持つため、タブ側でログインしてもアプリ側は未ログインのままになる
 * ―― 「毎回ログインさせられる」という報告の主因がこれ。追加してもらうこと自体が解決策なので、
 * タブで使っている間だけ追加方法をその場で示す。
 *
 * 初回の WelcomeTour にも同じ案内はあるが、あれは一度きりで、閉じたあとは二度と出ない。
 * 一度閉じたらこのカードも出さない(通知は「次に何をすればいいか分かるもの」だけに絞る)。
 */
export function InstallAppCard() {
  // 判定はwindowが要るので初回描画後に行う(SSRとの食い違いを避ける)。
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");

  useEffect(() => {
    if (isStandalonePwa()) return;
    const p = detectPlatform();
    if (p === "other") return; // PCはホーム画面の概念が無いので出さない
    try {
      if (window.localStorage.getItem(DISMISSED_KEY) === "1") return;
    } catch {
      /* localStorage不可でも案内自体は出す */
    }
    setPlatform(p);
    setShow(true);
  }, []);

  if (!show) return null;

  function dismiss() {
    setShow(false);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* 記憶できなくても閉じる動作は効かせる */
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-[20px] border-[1.5px] border-line-strong bg-surface px-4 py-3"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
          <Icon name="arrow-up" className="h-[18px] w-[18px]" />
        </span>
        <p className="min-w-0 flex-1 text-[11px] font-black uppercase tracking-[0.22em] text-fg-2">Install</p>
        <button
          onClick={dismiss}
          aria-label="閉じる"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-n-2 text-fg-2 pressable"
        >
          <Icon name="close" className="h-[17px] w-[17px]" />
        </button>
      </div>

      <p className="mt-2 text-[13px] font-black leading-snug text-fg">
        ホーム画面に追加すると、アドレスバーの無いアプリとして起動します。
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-fg-3">
        追加したアプリは、一度ログインすればそのままログイン状態が続きます。
      </p>

      <ol className="mt-3 space-y-1.5 text-[12px] leading-snug text-fg-2">
        {platform === "ios" ? (
          <>
            <li>1. 下部の共有ボタン(□↑)をタップ</li>
            <li>2. 「ホーム画面に追加」を選択</li>
            <li>3. 右上の「追加」をタップ</li>
          </>
        ) : (
          <>
            <li>1. 右上のメニュー(縦の3点)をタップ</li>
            <li>2. 「アプリをインストール」または「ホーム画面に追加」を選択</li>
            <li>3. 「追加」をタップ</li>
          </>
        )}
      </ol>
    </motion.div>
  );
}
