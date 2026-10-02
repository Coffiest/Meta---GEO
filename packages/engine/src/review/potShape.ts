/**
 * プリフロップの流れから「どういうポットになったか」を判定する。
 *
 * オーナーの戦略ノートは SRP / 3betPot / リンプポット / BvB を明確に区別して書いている
 * (【3betPotの戦い方】【ブラインドヘッズリンプポット戦略】など)が、解析の決定には
 * ポットの種別が乗っていない。タイムラインのプリフロップの手から組み立てる。
 *
 * **プリフロップが終わった後の姿**を読むことに注意。プリフロップの途中の決定について
 * 引くと、「その時点でどうだったか」ではなく「最終的にどうなったか」が返る
 * (自分がオープンした直後は SRP に見えても、後ろから3betされれば threeBet になる)。
 * ポストフロップの決定ではプリフロップは確定しているので、ずれは起きない。
 * スクイーズのように「その手がポットの形を決める」知識では、これで正しく引ける。
 */

export type PotType =
  /** 誰もレイズしていない(リンプ or ブラインドのみ)。 */
  | "limped"
  /** 1回だけレイズが入った(シングルレイズドポット)。 */
  | "srp"
  /** 3bet が入った。 */
  | "threeBet"
  /** 4bet 以上。 */
  | "fourBetPlus";

export interface PotShape {
  type: PotType;
  /** プリフロップのレイズ回数(ブラインドは数えない)。 */
  raiseCount: number;
  /** フロップを見たのがブラインド同士だけ(SB vs BB)か。ノートの「BvB」。 */
  isBlindVsBlind: boolean;
}

interface PreflopAction {
  seatIndex: number;
  street: string;
  kind: string;
}

/** ブラインド/アンティの自動投入。プレイヤーの意思ではないので数に入れない。 */
function isForcedPost(kind: string): boolean {
  return kind === "postBlind" || kind === "postAnte";
}

/**
 * ボタンの位置から SB / BB の席番号を出す。
 *
 * 棋譜解析のポジション名は `POSITION_NAMES = ["BTN","SB","BB","UTG","HJ","CO"]` を
 * ボタンからのオフセットで引いている(`packages/db/src/reviewExtract.ts`)。
 * つまり ボタンの1つ次が SB、2つ次が BB。ここでも同じ数え方に揃える。
 */
export function blindSeatsOf(buttonFixedPos: number, seatCount: number): { smallBlind: number; bigBlind: number } {
  return {
    smallBlind: (buttonFixedPos + 1) % seatCount,
    bigBlind: (buttonFixedPos + 2) % seatCount,
  };
}

/**
 * ポットの形を読む。
 *
 * @param actions ハンドの全アクション(タイムライン)。プリフロップ以外は無視する。
 * @param table ボタンの位置と席数。BvB の判定に使う。
 */
export function readPotShape(
  actions: readonly PreflopAction[],
  table: { buttonFixedPos: number; seatCount: number }
): PotShape {
  const preflop = actions.filter((a) => a.street === "preflop" && !isForcedPost(a.kind));

  let raiseCount = 0;
  for (const a of preflop) {
    // プリフロップでは bet は起こらない(ブラインドが最初のベット)が、
    // 実装差で bet が来ても「レイズ1回目」と同じ意味なので拾う。
    if (a.kind === "raise" || a.kind === "bet" || a.kind === "allIn") raiseCount += 1;
  }

  const type: PotType =
    raiseCount === 0 ? "limped" : raiseCount === 1 ? "srp" : raiseCount === 2 ? "threeBet" : "fourBetPlus";

  // BvB: プリフロップで降りなかった席が SB と BB だけ。
  const folded = new Set(preflop.filter((a) => a.kind === "fold").map((a) => a.seatIndex));
  const acted = new Set(preflop.map((a) => a.seatIndex));
  const survivors = [...acted].filter((s) => !folded.has(s));
  const { smallBlind, bigBlind } = blindSeatsOf(table.buttonFixedPos, table.seatCount);
  const isBlindVsBlind =
    survivors.length === 2 && survivors.includes(smallBlind) && survivors.includes(bigBlind);

  return { type, raiseCount, isBlindVsBlind };
}
