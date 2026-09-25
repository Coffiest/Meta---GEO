"use client";

/**
 * 埋め込みモード。
 *
 * RRPoker のアプリの中に Poker ART をそのまま埋め込んで動かすための仕組み。
 * RRPoker は Firebase Auth、Poker ART は Supabase Auth と認証基盤が違うので、
 * 埋め込まれた側は「親から渡されたトークン」をそのまま使う。
 * (サーバー側は既に Firebase の IDトークンも受け付けられる。firebaseAuth.ts 参照)
 *
 * トークンの受け渡しは postMessage で行う。URLに載せない理由:
 *  - URLは履歴・リファラ・ログに残り、トークンが漏れる経路が増える
 *  - iOSのストレージ分離により、埋め込み側のCookieやlocalStorageは当てにできない
 *
 * 受け取り側は必ず `event.origin` を照合する。許可するオリジンは
 * NEXT_PUBLIC_EMBED_PARENT_ORIGINS(カンマ区切り)で明示し、未設定なら埋め込みを受け付けない
 * (設定漏れが「誰からでもトークンを受け取る」状態に化けないようにするため)。
 */

/** 親→子: アクセストークンの受け渡し。 */
export const EMBED_TOKEN_MESSAGE = "pokerart:token";
/** 子→親: 準備ができたのでトークンを送ってほしい。 */
export const EMBED_READY_MESSAGE = "pokerart:ready";
/** 子→親: 画面遷移の要求(親のフッターと状態を合わせるため)。 */
export const EMBED_NAVIGATE_MESSAGE = "pokerart:navigate";

/** 埋め込みモードで動いているか。URLの ?embed=1 で明示的に切り替える。 */
export function isEmbedded(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("embed") === "1";
}

/** トークンを受け取ってよい親オリジンの一覧。未設定なら空(=受け取らない)。 */
export function allowedParentOrigins(): string[] {
  const raw = process.env["NEXT_PUBLIC_EMBED_PARENT_ORIGINS"] ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** そのオリジンからのメッセージを受け取ってよいか。完全一致のみ許す。 */
export function isAllowedParentOrigin(origin: string): boolean {
  return allowedParentOrigins().includes(origin);
}

export interface EmbedTokenMessage {
  type: typeof EMBED_TOKEN_MESSAGE;
  /** 親アプリのアクセストークン(RRPokerならFirebaseのIDトークン)。 */
  token: string;
}

/** 受け取ったメッセージが期待する形かどうか。 */
export function parseEmbedTokenMessage(data: unknown): EmbedTokenMessage | null {
  if (data === null || typeof data !== "object") return null;
  const msg = data as Record<string, unknown>;
  if (msg["type"] !== EMBED_TOKEN_MESSAGE) return null;
  const token = msg["token"];
  return typeof token === "string" && token.length > 0 ? { type: EMBED_TOKEN_MESSAGE, token } : null;
}

/**
 * 親へ「準備できた」と伝える。親はこれを受けてトークンを送り返す。
 * 送信先オリジンはワイルドカードにせず、許可済みオリジンだけへ個別に送る。
 */
export function requestTokenFromParent(): void {
  if (typeof window === "undefined" || window.parent === window) return;
  for (const origin of allowedParentOrigins()) {
    try {
      window.parent.postMessage({ type: EMBED_READY_MESSAGE }, origin);
    } catch {
      // 送れないオリジンは黙って飛ばす(別のオリジンで成功すればよい)。
    }
  }
}

/** 親に画面遷移を伝える(親のフッターの選択状態を合わせるため)。 */
export function notifyParentOfNavigation(path: string): void {
  if (typeof window === "undefined" || window.parent === window) return;
  for (const origin of allowedParentOrigins()) {
    try {
      window.parent.postMessage({ type: EMBED_NAVIGATE_MESSAGE, path }, origin);
    } catch {
      /* 同上 */
    }
  }
}
