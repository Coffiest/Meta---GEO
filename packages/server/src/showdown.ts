import { compareHandRank, evaluateBest, type HandEngine, type HandRank } from "@meta-geo/engine";

/**
 * ショーダウンで「公開義務があるプレイヤー」の席集合を返す。
 * TenFourのような全ハンド公開はせず、ルール上見せる義務のある手だけを公開する:
 *  - フォールドで決着したハンドは誰も公開しない
 *  - オールインでベッティングが閉じたショーダウンは残存者全員がテーブルアップ(標準ルール)
 *  - 通常のショーダウンは「リバーの最終アグレッサー(いなければボタン左の最初の残存者)」が
 *    先に公開し、ポットを獲得したプレイヤーも公開する。それ以外はマック
 */
/** ショーダウンで1人の手をめくる間隔(画面の演出と同じ 0.6 秒)。 */
export const SHOWDOWN_REVEAL_STEP_MS = 600;

export function computeRevealedSeats(hand: HandEngine): Set<number> {
  const result = hand.getResult();
  if (result.wonByFold) return new Set();
  const state = hand.getPublicState();
  const contenders = state.seats.filter((s) => s.status !== "folded");
  if (contenders.length < 2) return new Set();
  // 誰かがオールインしている(=それ以上のベッティングが無かった)ショーダウンは全員公開
  if (contenders.some((s) => s.status === "allIn")) return new Set(contenders.map((s) => s.seatIndex));
  return new Set(showdownOrder(hand));
}

/**
 * 通常のショーダウン(オールインでないもの)で手を開く順番と、開く席(TDA の Showdown Order。オーナー指示)。
 *  - リバーにベットがあれば最後に攻撃した人から、無ければボタンの左の最初の残存者から、時計回り。
 *  - 2人目以降は、それまでに開いた最も強い手と同じか強いときだけ開く(弱ければ伏せたまま = マック)。
 *  - ポットを取る人は必ず開く(サイドポットの勝者を含む)。
 * オールインで決着したショーダウンと、フォールドで決着したハンドは空(順番の演出をしない)。
 */
export function showdownOrder(hand: HandEngine): number[] {
  const result = hand.getResult();
  if (result.wonByFold) return [];
  const state = hand.getPublicState();
  const contenders = state.seats.filter((s) => s.status !== "folded");
  if (contenders.length < 2 || contenders.some((s) => s.status === "allIn")) return [];

  let firstShower: number | null = null;
  for (const e of hand.getEvents()) {
    if ((e.type === "bet" || e.type === "raise" || e.type === "allIn") && e["street"] === "river") {
      firstShower = e["seatIndex"] as number;
    }
  }
  const seatCount = Math.max(...state.seats.map((s) => s.seatIndex)) + 1;
  const start = firstShower ?? (state.buttonFixedPos + 1) % seatCount;
  const ordered: number[] = [];
  for (let offset = 0; offset < seatCount; offset++) {
    const seat = (start + offset) % seatCount;
    if (contenders.some((s) => s.seatIndex === seat)) ordered.push(seat);
  }

  const winners = new Set<number>();
  for (const [playerId, amount] of result.payouts) {
    if (amount <= 0) continue;
    const seat = contenders.find((s) => s.playerId === playerId);
    if (seat) winners.add(seat.seatIndex);
  }
  const hole = hand.getAllHoleCards();
  const board = state.board;
  const out: number[] = [];
  let best: HandRank | null = null;
  for (const seat of ordered) {
    const cards = hole.get(seat);
    const rank = cards ? evaluateBest([...cards, ...board]) : null;
    const show = out.length === 0 || winners.has(seat) || (rank && best && compareHandRank(rank, best) >= 0);
    if (!show) continue;
    out.push(seat);
    if (rank && (!best || compareHandRank(rank, best) > 0)) best = rank;
  }
  return out;
}

/**
 * 保存済みのハンド記録から「公開された席」を求める。
 *
 * ライブ中の {@link computeRevealedSeats} と同じルールを、DBに残るアクション列だけから
 * 再現する。プレイ中のハンド履歴では、マックされた相手の手札をこれで伏せる
 * ―― 進行中のトーナメントで相手の非公開ハンドが読めてしまうのは不正の温床になるため。
 *
 * 判定材料がDBの記録に限られるぶん、迷ったら「公開しない」側へ倒してある
 * (伏せ過ぎは情報が減るだけだが、見せ過ぎは取り返しがつかない)。
 */
export function revealedSeatsFromRecord(rec: {
  buttonFixedPos: number;
  seats: { seatIndex: number; resultStackDelta: number }[];
  actions: { seatIndex: number; street: string; kind: string }[];
}): Set<number> {
  const revealed = new Set<number>();
  const folded = new Set(rec.actions.filter((a) => a.kind === "fold").map((a) => a.seatIndex));
  const contenders = rec.seats.filter((s) => !folded.has(s.seatIndex));
  // フォールドで決着したハンドは誰も公開しない。
  if (contenders.length < 2) return revealed;

  // オールインでベッティングが閉じたショーダウンは残存者全員がテーブルアップ(標準ルール)。
  if (rec.actions.some((a) => a.kind === "allIn" && !folded.has(a.seatIndex))) {
    for (const s of contenders) revealed.add(s.seatIndex);
    return revealed;
  }

  // 通常のショーダウン: リバーの最終アグレッサーが先に公開する。
  let firstShower: number | null = null;
  for (const a of rec.actions) {
    if (a.street === "river" && (a.kind === "bet" || a.kind === "raise" || a.kind === "allIn")) {
      firstShower = a.seatIndex;
    }
  }
  // リバーにアグレッションが無ければ、ボタンの左隣から最初の残存者。
  if (firstShower === null) {
    const seatCount = Math.max(...rec.seats.map((s) => s.seatIndex)) + 1;
    for (let offset = 1; offset <= seatCount; offset++) {
      const seat = (rec.buttonFixedPos + offset) % seatCount;
      if (contenders.some((s) => s.seatIndex === seat)) {
        firstShower = seat;
        break;
      }
    }
  }
  if (firstShower !== null) revealed.add(firstShower);

  // ポットを獲得したプレイヤーは公開して初めて獲得できる。
  for (const s of contenders) if (s.resultStackDelta > 0) revealed.add(s.seatIndex);

  return revealed;
}
