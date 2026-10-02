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
 * 現在は課金の制限には使っていない(オーナー確定: iOSアプリでもウェブと同じく使い放題プランを
 * 登録・利用できる)。かつて Apple審査ガイドライン3.1.1 対応でアプリ内の課金導線とサブスクの
 * 適用を止めていた(v4.55.0 / v4.56.0)が、v4.66.0 で外した。App内課金(StoreKit)を
 * 入れるときに、アプリ内かどうかの判定としてここを使う。
 */
export const IOS_APP_UA_TOKEN = "PokerARTApp";

export function isIOSNativeApp(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.includes(IOS_APP_UA_TOKEN);
}
