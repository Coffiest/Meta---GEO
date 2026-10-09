import { readBoardTexture } from "./boardTexture.js";
import { readHandStrength } from "./handStrength.js";
import type { NotionGrade } from "./strategyVerdict.js";

/**
 * 3bet ポット・4bet ポットのフロップの簡易戦略(オーナー指示)。
 * 出典: オーナー支給のスライドゼミ4「3betpot、4betpot」/ GTO Wizard「3ベットポットにおけるOOPのCベット」。
 *
 * しきい値(オーナー確定): SPR 2.5 未満 = 浅い、以上 = 深い。安ベット = 33% 以下、ハーフ = 40〜60%。
 * 外したときのバッジ: サイズ違いは緩手、打つ/打たないを逆にしたら悪手。
 */
export type RaisedPotSpot = "ip3bettor" | "oop3bettor" | "oop4betCaller" | "vsDonkJam";

export type RaisedPotCorrect = "check" | "smallBet" | "halfBet" | "bigBet" | "jam" | "betAny" | "checkOrSmall" | "call" | "fold";

export interface RaisedPotJudgement {
  spot: RaisedPotSpot;
  /** ボードの系統(解説用)。 */
  board: "aceHigh" | "twoBroadway" | "lowConnect" | "kingHigh" | "amm" | "tenOrLower" | "other";
  deep: boolean;
  correct: RaisedPotCorrect;
  /** 手の役割(解説用)。 */
  handRole: string;
  grade: NotionGrade;
}

export const RP_SMALL_MAX = 0.35;
export const RP_HALF_MIN = 0.4;
export const RP_HALF_MAX = 0.6;
export const RP_BIG_MIN = 0.75;
export const RP_DEEP_SPR = 2.5;

type Action = { kind: "check" | "bet" | "allIn" | "call" | "fold"; sizePct: number };

function sizeOf(a: Action): "check" | "small" | "half" | "mid" | "big" | "jam" {
  if (a.kind === "check") return "check";
  if (a.kind === "allIn") return "jam";
  if (a.sizePct <= RP_SMALL_MAX) return "small";
  if (a.sizePct >= RP_HALF_MIN && a.sizePct <= RP_HALF_MAX) return "half";
  if (a.sizePct >= RP_BIG_MIN) return "big";
  return "mid";
}

/** 正解のアクションと実際のアクションから格付け。 */
function gradeOf(correct: RaisedPotCorrect, a: Action): NotionGrade {
  const s = sizeOf(a);
  const bet = s !== "check";
  switch (correct) {
    case "check":
      return bet ? "mistake" : "best";
    case "checkOrSmall":
      return !bet || s === "small" ? "best" : "inaccuracy";
    case "betAny":
      return bet ? "best" : "mistake";
    case "smallBet":
      return !bet ? "mistake" : s === "small" ? "best" : "inaccuracy";
    case "halfBet":
      return !bet ? "mistake" : s === "half" ? "best" : "inaccuracy";
    case "bigBet":
      return !bet ? "mistake" : s === "big" || s === "jam" ? "best" : "inaccuracy";
    case "jam":
      return !bet ? "mistake" : s === "jam" ? "best" : "inaccuracy";
    case "call":
      return a.kind === "call" ? "best" : "mistake";
    case "fold":
      return a.kind === "fold" ? "best" : "mistake";
  }
}

function boardKind(flop: readonly string[]) {
  const tex = readBoardTexture(flop.slice(0, 3));
  if (!tex) return null;
  const span = Math.max(...tex.ranks) - Math.min(...tex.ranks);
  return {
    tex,
    aceHigh: tex.isAceHigh,
    twoBw: tex.broadwayCount >= 2,
    low: tex.highRank <= 9,
    lowConnect: tex.highRank <= 9 || span <= 4,
    kingHigh: tex.isKingHigh,
    amm: (tex.highRank === 14 || tex.highRank === 12) && tex.bands[1] === "M" && tex.bands[2] === "M",
    tenOrLower: tex.highRank <= 10,
  };
}

/**
 * @param spot どの場面か
 * @param spr 決定の時点の SPR(有効スタック ÷ ポット)
 */
export function judgeRaisedPot(params: {
  spot: RaisedPotSpot;
  hole: readonly string[];
  flop: readonly string[];
  spr: number;
  action: Action;
}): RaisedPotJudgement | null {
  const b = boardKind(params.flop);
  const hs = readHandStrength(params.hole, params.flop.slice(0, 3));
  if (!b || !hs) return null;
  const deep = params.spr >= RP_DEEP_SPR;
  const m = hs.made;
  const ranks = params.hole.map((c) => ({ A: 14, K: 13, Q: 12, J: 11, T: 10 } as Record<string, number>)[c[0]!.toUpperCase()] ?? Number(c[0]));
  const pocket = ranks[0] === ranks[1];
  const onePair = m === "topPair" || m === "middlePair" || m === "bottomPair" || m === "pocketPairBelow";
  const strong = ["straightFlush", "quads", "fullHouse", "flush", "straight", "trips", "twoPair"].includes(m);
  const straightDraw = hs.draws.openEnded || hs.draws.gutshot;
  const out = (board: RaisedPotJudgement["board"], correct: RaisedPotCorrect, handRole: string): RaisedPotJudgement => ({
    spot: params.spot,
    board,
    deep,
    correct,
    handRole,
    grade: gradeOf(correct, params.action),
  });

  switch (params.spot) {
    case "ip3bettor": {
      // スライド: A ハイ・2BW はチェックか安ベット。ポケット・A ヒットの弱いキッカー・セカンドペア・ボトムペアはチェック。
      if (b.aceHigh || b.twoBw) {
        const weakA = m === "topPair" && b.aceHigh && hs.kicker === "low";
        const checkHand = pocket && !strong ? true : weakA || m === "middlePair" || m === "bottomPair";
        const board = b.aceHigh ? "aceHigh" : "twoBroadway";
        if (checkHand) return out(board, "check", weakA ? "A ヒットの弱いキッカー" : pocket ? "ポケットペア" : m === "middlePair" ? "セカンドペア" : "ボトムペア");
        // ディープの 2BW はハーフでポットを焚いてリバーのオールインを目指す。ショートは 10〜25% の安いサイズ。
        return out(board, !b.aceHigh && deep ? "halfBet" : "smallBet", "ベットする手");
      }
      if (b.lowConnect) {
        const must = strong || (m === "overPair" && ranks[0]! >= 9 && ranks[0]! <= 12);
        return must ? out("lowConnect", "betAny", "絶対に打つ手(セット・ストレート・2P・99〜QQ)") : out("lowConnect", "checkOrSmall", "チェックか安ベット");
      }
      return out("other", "checkOrSmall", "チェックか安ベット");
    }
    case "oop3bettor": {
      if (!deep) {
        if (b.low) {
          if (onePair) return out("lowConnect", "jam", "ワンペア");
          return out("lowConnect", "smallBet", m === "overPair" ? "オーバーペア" : "エアー");
        }
        return out(b.aceHigh ? "aceHigh" : "other", "smallBet", "レンジで安ベット");
      }
      if (b.low) {
        const vulnerableOver = m === "overPair" && ranks[0]! >= 7 && ranks[0]! <= 10;
        return vulnerableOver ? out("lowConnect", "bigBet", "まくられやすいオーバーペア(77〜TT)") : out("lowConnect", "checkOrSmall", "チェックか 10% ベット");
      }
      if (b.aceHigh) {
        const weakA = m === "topPair" && hs.kicker === "low";
        return pocket || weakA ? out("aceHigh", "check", pocket ? "ポケットペア" : "弱い A") : out("aceHigh", "smallBet", "安ベット");
      }
      return out("other", "smallBet", "安ベット");
    }
    case "oop4betCaller": {
      if (b.amm) return out("amm", "smallBet", "めっちゃ安いドンク");
      if (b.kingHigh) return out("kingHigh", "check", "レンジチェック");
      if (b.tenOrLower) {
        const jamHand = onePair || m === "overPair" || straightDraw;
        return jamHand ? out("tenOrLower", "jam", "ワンペア・オーバーペア・ストレートドロー") : out("tenOrLower", "check", "チェック");
      }
      return out("other", "check", "チェック");
    }
    case "vsDonkJam": {
      const ak = ranks.includes(14) && ranks.includes(13);
      const callHand = onePair || m === "overPair" || strong || ak;
      return out(b.tenOrLower ? "tenOrLower" : "other", callHand ? "call" : "fold", callHand ? "ワンペア以上か AK" : "それ以外");
    }
  }
}
