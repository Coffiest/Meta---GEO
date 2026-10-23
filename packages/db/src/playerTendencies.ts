import { prisma } from "./client.js";
import { RANKED_TOURNAMENT } from "./rankedGame.js";

/**
 * プレイヤー詳細に出す、プレイの傾向の数字(KKPoker などのプレイヤー情報と同じ項目)。
 * すべて 0〜1。機会が1回も無ければ 0。
 */
export interface PlayerTendencies {
  /** 集計したハンド数(直近 TENDENCY_HAND_LIMIT ハンドまで)。 */
  hands: number;
  /** オープンしたあと 3ベットを受けて降りた割合。 */
  foldTo3BetRate: number;
  /** プリフロップの最後のレイザーが、フロップで最初にベットした割合。 */
  cbetRate: number;
  /** フロップでプリフロップのレイザーの C ベットを受けて降りた割合。 */
  foldToCbetRate: number;
  /** CO・BTN・SB で全員が降りて回ってきたときにレイズした割合。 */
  stealRate: number;
  /** ポストフロップでチェックしたあとベットを受けて、レイズした割合。 */
  checkRaiseRate: number;
  /** フロップを見たハンドのうち、ショーダウンまで行った割合。 */
  wtsdRate: number;
  /** ショーダウンまで行ったハンドのうち、チップを増やした割合。 */
  wsdRate: number;
  /** トーナメントの優勝回数。 */
  titles: number;
}

/** 読み出すハンドの上限(Supabase の転送量を抑えるため、直近の分だけ)。 */
export const TENDENCY_HAND_LIMIT = 3000;

const AGGRESSIVE = new Set(["bet", "raise", "allIn"]);

export interface TendencyHand {
  seatIndex: number;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  resultStackDelta: number;
  /** ブラインド・アンティを除いた全ストリートのアクション(順番どおり)。 */
  actions: readonly { seatIndex: number; street: string; kind: string }[];
}

/** DB に依存しない集計本体(テスト用に分けてある)。 */
export function computeTendencies(hands: readonly TendencyHand[], titles: number): PlayerTendencies {
  const c = { f3: 0, f3o: 0, cb: 0, cbo: 0, fcb: 0, fcbo: 0, st: 0, sto: 0, cr: 0, cro: 0, sd: 0, sdo: 0, wsd: 0 };
  for (const h of hands) {
    const me = h.seatIndex;
    const acts = h.actions.filter((a) => a.kind !== "postBlind" && a.kind !== "postAnte");
    const pre = acts.filter((a) => a.street === "preflop");
    const flop = acts.filter((a) => a.street === "flop");

    // プリフロップの席順(最初に動いた順)。SB・BB はブラインドなので最後。
    const order: number[] = [];
    for (const a of pre) if (!order.includes(a.seatIndex)) order.push(a.seatIndex);

    // スチール: 自分より前が全員フォールドで、自分が CO・BTN(BB/SB を除いた最後の2人)か SB。
    const myFirstIdx = pre.findIndex((a) => a.seatIndex === me);
    if (myFirstIdx >= 0 && !h.isBigBlind) {
      const before = pre.slice(0, myFirstIdx);
      if (before.every((a) => a.kind === "fold")) {
        const myPos = order.indexOf(me);
        const after = order.length - 1 - myPos; // 自分の後ろに動く人数(SB/BB を含む)
        const isLatePos = h.isSmallBlind || after <= 3; // CO = 後ろに BTN・SB・BB
        if (isLatePos) {
          c.sto++;
          if (AGGRESSIVE.has(pre[myFirstIdx]!.kind)) c.st++;
        }
      }
    }

    // フォールド・トゥ・3ベット: 自分が最初のレイズをして、そのあと再レイズを受けた。
    const firstRaiseIdx = pre.findIndex((a) => AGGRESSIVE.has(a.kind));
    if (firstRaiseIdx >= 0 && pre[firstRaiseIdx]!.seatIndex === me) {
      const reraiseIdx = pre.findIndex((a, i) => i > firstRaiseIdx && AGGRESSIVE.has(a.kind) && a.seatIndex !== me);
      if (reraiseIdx >= 0) {
        const myNext = pre.find((a, i) => i > reraiseIdx && a.seatIndex === me);
        if (myNext) {
          c.f3o++;
          if (myNext.kind === "fold") c.f3++;
        }
      }
    }

    // プリフロップの最後のレイザー
    let pfa: number | null = null;
    for (const a of pre) if (AGGRESSIVE.has(a.kind)) pfa = a.seatIndex;
    const myFlop = flop.filter((a) => a.seatIndex === me);
    if (pfa !== null && myFlop.length > 0) {
      const firstBetIdx = flop.findIndex((a) => AGGRESSIVE.has(a.kind));
      if (pfa === me) {
        // C ベット: 自分の最初のフロップの手番までに誰もベットしていない。
        const myFirst = flop.findIndex((a) => a.seatIndex === me);
        if (firstBetIdx === -1 || firstBetIdx >= myFirst) {
          c.cbo++;
          if (AGGRESSIVE.has(flop[myFirst]!.kind)) c.cb++;
        }
      } else if (firstBetIdx >= 0 && flop[firstBetIdx]!.seatIndex === pfa) {
        const resp = flop.find((a, i) => i > firstBetIdx && a.seatIndex === me);
        if (resp) {
          c.fcbo++;
          if (resp.kind === "fold") c.fcb++;
        }
      }
    }

    // チェックレイズ: ポストフロップのストリートで、チェックしたあとにベットを受けた。
    for (const street of ["flop", "turn", "river"]) {
      const s = acts.filter((a) => a.street === street);
      const chk = s.findIndex((a) => a.seatIndex === me && a.kind === "check");
      if (chk < 0) continue;
      const bet = s.findIndex((a, i) => i > chk && AGGRESSIVE.has(a.kind));
      if (bet < 0) continue;
      const resp = s.find((a, i) => i > bet && a.seatIndex === me);
      if (!resp) continue;
      c.cro++;
      if (AGGRESSIVE.has(resp.kind)) c.cr++;
    }

    // WTSD / W$SD: フロップを見た(プリフロップで降りていない)ハンドが、2人以上残って終わったか。
    const foldedPre = pre.some((a) => a.seatIndex === me && a.kind === "fold");
    const sawFlop = !foldedPre && acts.some((a) => a.street !== "preflop");
    if (sawFlop) {
      c.sdo++;
      const folded = new Set(acts.filter((a) => a.kind === "fold").map((a) => a.seatIndex));
      const remaining = order.filter((s) => !folded.has(s));
      if (!folded.has(me) && remaining.length >= 2) {
        c.sd++;
        if (h.resultStackDelta > 0) c.wsd++;
      }
    }
  }
  const r = (n: number, d: number) => (d > 0 ? n / d : 0);
  return {
    hands: hands.length,
    foldTo3BetRate: r(c.f3, c.f3o),
    cbetRate: r(c.cb, c.cbo),
    foldToCbetRate: r(c.fcb, c.fcbo),
    stealRate: r(c.st, c.sto),
    checkRaiseRate: r(c.cr, c.cro),
    wtsdRate: r(c.sd, c.sdo),
    wsdRate: r(c.wsd, c.sd),
    titles,
  };
}

export async function getPlayerTendencies(userId: string): Promise<PlayerTendencies> {
  const [seats, titles] = await Promise.all([
    prisma.handSeat.findMany({
      where: { userId, hand: { tournament: RANKED_TOURNAMENT } },
      orderBy: { hand: { createdAt: "desc" } },
      take: TENDENCY_HAND_LIMIT,
      select: {
        seatIndex: true,
        isSmallBlind: true,
        isBigBlind: true,
        resultStackDelta: true,
        hand: {
          select: {
            actions: {
              where: { kind: { notIn: ["postBlind", "postAnte"] } },
              orderBy: { sequenceNumber: "asc" },
              select: { seatIndex: true, street: true, kind: true },
            },
          },
        },
      },
    }),
    prisma.tournamentEntry.count({ where: { userId, finishPosition: 1, tournament: RANKED_TOURNAMENT } }),
  ]);
  return computeTendencies(
    seats.map((s) => ({ ...s, actions: s.hand.actions })),
    titles,
  );
}
