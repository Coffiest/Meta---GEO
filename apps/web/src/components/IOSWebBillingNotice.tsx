"use client";

import { PROD_URL } from "@/lib/share";
import { Icon } from "@/components/Icon";

/**
 * App Store配布のiOSアプリ内で、Stripe決済ボタンの代わりに出す案内。
 *
 * Apple審査ガイドライン3.1.1により、アプリ内で消費するデジタルコンテンツ・機能への
 * 課金はApple In-App Purchase以外の決済手段を提示できない。このアプリはバーチャル
 * チップ専用NLHの課金(棋譜解析の使い放題プラン)にStripeを使っており、IAPには
 * 対応していないため、iOSアプリ内では登録・契約管理ボタン自体を出さず、
 * 「ウェブ版でご登録ください」という案内とリンクのみを表示する。
 *
 * リンク先は外部ブラウザ(Safari)で開く想定(target="_blank")。ネイティブアプリ側の
 * WKWebView/WKUIDelegateで、この遷移をアプリ内に留めずSafariへ渡すよう設定しておく
 * 必要がある(apps/web単体では制御できないネイティブ側の設定)。
 */
export function IOSWebBillingNotice({
  variant = "pricing",
}: {
  /** "pricing": 加入前の案内文言 / "manage": 契約管理の案内文言 */
  variant?: "pricing" | "manage";
}) {
  const href = `${PROD_URL}/pricing`;
  return (
    <div className="mt-5 rounded-2xl border border-line-strong bg-n-4/60 p-4 text-center">
      <p className="text-[13px] font-bold text-fg">
        {variant === "manage" ? "契約の管理はウェブ版から行えます" : "ご登録はウェブ版から行えます"}
      </p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-fg-2">
        Apple のガイドラインにより、iOSアプリ内では課金・契約管理を行えません。
        <br />
        下のリンクからウェブ版を開いて手続きしてください。
      </p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-accent text-[13px] font-black text-on-accent pressable"
      >
        ウェブ版で{variant === "manage" ? "契約を管理する" : "登録する"}
        <Icon name="arrow-right" className="h-4 w-4" />
      </a>
    </div>
  );
}
