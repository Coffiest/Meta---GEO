"use client";

/**
 * App Store配布用のiOSネイティブアプリ(WKWebViewでこのサイトを表示するラッパー)から
 * 開かれているかどうかを判定する。
 *
 * 判定方法: ネイティブアプリ側のWKWebViewで `customUserAgent` の末尾に固定トークンを
 * 付与してもらい、そのトークンの有無で見分ける(iOS Safari本体や、ホーム画面追加の
 * スタンドアロンPWAとは異なる第三の実行環境として区別する必要があるため)。
 *
 * ネイティブアプリ側(Swift/WKWebView)での設定例:
 *   webView.configuration.applicationNameForUserAgent = "\(IOS_APP_UA_TOKEN)/1.0"
 * これによりUAの末尾に " PokerARTApp/1.0" のようなトークンが付与される。
 *
 * Apple審査ガイドライン3.1.1(アプリ内で消費するデジタルコンテンツの決済は原則IAP必須)
 * への対応として、iOSアプリ内ではStripe決済(使い放題プラン登録・契約管理)を一切
 * 実行できないようにし、ウェブ版へ誘導するリンクのみを表示する(実際の課金導線は
 * ウェブ版だけに残す)。
 */
export const IOS_APP_UA_TOKEN = "PokerARTApp";

export function isIOSNativeApp(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.includes(IOS_APP_UA_TOKEN);
}
