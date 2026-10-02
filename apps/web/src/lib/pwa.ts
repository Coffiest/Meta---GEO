"use client";

/**
 * ホーム画面から起動したスタンドアロンPWAとして動作しているかを判定する。
 *
 * iOSのスタンドアロンWebアプリでは、メインウィンドウをOAuthプロバイダ(特にAppleの
 * appleid.apple.com)へフルリダイレクトすると、認証途中でコンテキストがSafari本体へ
 * ハンドオフされ、以後ユーザーがSafari上でアプリを使い続けてしまう(しかもiOSはPWAと
 * Safariでストレージが分離されているため、セッションはSafari側にしか作られない)。
 * この判定を使い、スタンドアロン時のみ「本体ウィンドウを遷移させない」ログインフローに
 * 切り替える。
 */
export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
  } catch {
    /* matchMedia非対応環境は下のフォールバックのみで判定 */
  }
  // iOS Safari独自プロパティ(ホーム画面起動時にtrue)
  return (window.navigator as { standalone?: boolean }).standalone === true;
}
