/**
 * フレンド対戦(6桁のコードで友達を呼んで遊ぶ卓)の、画面側の型と定数。
 * サーバーの実体は `packages/server/src/privateRoom.ts`。設定の範囲・既定値はそちらと揃える
 * (範囲の外の値はサーバーが丸めるので、ここはあくまで画面の選択肢)。
 */

export type BlindSpeed = "turbo" | "normal" | "deep";

export interface PrivateRoomSettings {
  maxPlayers: number;
  blind: BlindSpeed;
  lateEntry: boolean;
  lateEntryUntilLevel: number;
  reentry: boolean;
  /** null は無制限。 */
  reentryLimit: number | null;
  /** 空席を自動で埋める席の数(0 なら埋めない)。 */
  autoSeats: number;
  chat: boolean;
  timeBank: boolean;
}

export const DEFAULT_PRIVATE_SETTINGS: PrivateRoomSettings = {
  maxPlayers: 6,
  blind: "normal",
  lateEntry: true,
  lateEntryUntilLevel: 6,
  reentry: true,
  reentryLimit: 1,
  autoSeats: 0,
  chat: true,
  timeBank: true,
};

/** ブラインドの3択の中身(表示用。サーバーの `BLIND_PRESETS` と同じ値)。 */
export const BLIND_SPEEDS: { key: BlindSpeed; minutes: number; bb: number }[] = [
  { key: "turbo", minutes: 3, bb: 100 },
  { key: "normal", minutes: 5, bb: 100 },
  { key: "deep", minutes: 10, bb: 200 },
];

export type PrivateRoomPhase = "lobby" | "playing" | "finished";

export interface PrivateStanding {
  userId: string;
  displayName: string;
  avatarKey: string | null;
  place: number;
}

export interface PrivateRoomInfo {
  code: string;
  hostUserId: string;
  /** 自分の userId(待合で自分の席を決めるため)。 */
  youUserId: string;
  isHost: boolean;
  phase: PrivateRoomPhase;
  settings: PrivateRoomSettings;
  members: { userId: string; displayName: string; avatarKey: string | null }[];
  standings: PrivateStanding[] | null;
}

/** ルームから外れた理由(サーバーの `privateRoomClosed`)。 */
export type PrivateClosedReason = "KICKED" | "LEFT" | "DISBANDED" | "EXPIRED" | "EMPTY";

/** 卓の画面を開くときの入り方。 */
export type PrivateIntent =
  | { mode: "create"; settings: PrivateRoomSettings }
  | { mode: "join"; code: string }
  /** アプリの再読み込みなどで、入っているルームへ戻る。 */
  | { mode: "resume" };

/** サーバーの応答(ack)。 */
export type PrivateAck = { ok: true; code?: string } | { ok: false; error: string; message: string };

/** 再読み込みのあとに同じルームへ戻るため、入っているルームのコードを端末に覚えておく。 */
const ROOM_CODE_KEY = "privateRoomCode";

export function rememberRoomCode(code: string | null): void {
  try {
    if (code) window.localStorage.setItem(ROOM_CODE_KEY, code);
    else window.localStorage.removeItem(ROOM_CODE_KEY);
  } catch {
    /* 保存できなくても遊べる(再読み込みで戻れないだけ) */
  }
}

export function rememberedRoomCode(): string | null {
  try {
    const v = window.localStorage.getItem(ROOM_CODE_KEY);
    return v && /^\d{6}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}
