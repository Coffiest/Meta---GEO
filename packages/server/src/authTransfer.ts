/**
 * OAuthシート→PWA本体へのセッション受け渡し(ワンタイムコード)ストア。
 *
 * iOSのスタンドアロンPWAでは、window.openで開いたアプリ内シートのストレージが
 * PWA本体と共有されない(Safari側パーティションに紐づく)端末/OSバージョンがあり、
 * シートで完了したログインのセッションが本体へ一切届かない。localStorage・
 * BroadcastChannel・postMessageはいずれもパーティション境界を越えられないため、
 * サーバーを経由した受け渡しだけが確実に機能する。
 *
 * フロー:
 *  1. 本体がログイン開始時にランダムなコードを生成し、シートへ引き渡す
 *  2. シートは認証完了後、自分のセッショントークンをコード付きでここへ預ける(POST)
 *  3. 本体はコードでポーリングし(GET)、受け取ったトークンで自分のセッションを確立する
 *
 * コード自体が秘密(128bit乱数・短TTL・一回限り)なので、コードを知らない第三者は
 * 預けられたトークンを取得できない。預け入れ側はアクセストークンの検証を通ったものだけ受け付ける。
 */

interface TransferEntry {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const TRANSFER_TTL_MS = 3 * 60 * 1000;
/** メモリ枯渇防止の上限。正常運用では同時に数件しか存在しない。 */
const MAX_ENTRIES = 2000;

const store = new Map<string, TransferEntry>();

/** 本体側が生成する16バイト乱数の16進表現(32文字)のみ受け付ける。 */
export function isValidTransferCode(code: unknown): code is string {
  return typeof code === "string" && /^[0-9a-f]{32,64}$/.test(code);
}

function prune(): void {
  const now = Date.now();
  for (const [code, entry] of store) {
    if (entry.expiresAt <= now) store.delete(code);
  }
}

/** シート側がセッショントークンを預ける。コード不正・容量超過時はfalse。 */
export function putTransfer(code: string, tokens: { accessToken: string; refreshToken: string }): boolean {
  if (!isValidTransferCode(code)) return false;
  if (!tokens.accessToken || !tokens.refreshToken) return false;
  prune();
  if (store.size >= MAX_ENTRIES) return false;
  store.set(code, { ...tokens, expiresAt: Date.now() + TRANSFER_TTL_MS });
  return true;
}

/** 本体側が受け取る。一回限り(取得と同時に削除)。無い・期限切れはnull。 */
export function takeTransfer(code: string): { accessToken: string; refreshToken: string } | null {
  if (!isValidTransferCode(code)) return null;
  const entry = store.get(code);
  if (!entry) return null;
  store.delete(code);
  if (entry.expiresAt <= Date.now()) return null;
  return { accessToken: entry.accessToken, refreshToken: entry.refreshToken };
}
