import { evaluateBest, type Card, type PlayerAction, type Street } from "@meta-geo/engine";

/**
 * シンプルなルールベースBOT。GTOソルバーではなく、粗いハンド強度評価+ポットオッズによる
 * 素朴な意思決定を行う。目的はGEO/ルールエンジンの動作確認とソロテストであり、
 * 強い対戦相手を作ることではない。
 */

/** プリフロップ・ハンド強度をChen Formula風の簡易スコア(概ね-1〜20)で評価する */
function preflopScore(hole: readonly [Card, Card]): number {
  const [a, b] = hole;
  const high = Math.max(a.rank, b.rank);
  const low = Math.min(a.rank, b.rank);

  const baseFor = (rank: number): number => {
    if (rank === 14) return 10;
    if (rank === 13) return 8;
    if (rank === 12) return 7;
    if (rank === 11) return 6;
    return rank / 2;
  };

  let score = baseFor(high);

  const isPair = a.rank === b.rank;
  if (isPair) {
    score = Math.max(score * 2, 5);
  } else {
    if (a.suit === b.suit) score += 2;
    const gap = high - low - 1;
    if (gap === 1) score -= 1;
    else if (gap === 2) score -= 2;
    else if (gap === 3) score -= 4;
    else if (gap >= 4) score -= 5;
    if (gap <= 1 && high <= 12) score += 1; // 低めのコネクター/ワンギャップへのストレート狙いボーナス
  }

  return score;
}

/** 現在の役の強さを 0(ハイカード)〜8(ストレートフラッシュ) の粗いスコアに正規化する */
function postflopStrength(hole: readonly [Card, Card], board: readonly Card[]): number {
  if (board.length < 3) return preflopScore(hole) / 2; // フロップ前相当
  const rank = evaluateBest([...hole, ...board]);
  return rank.category;
}

export interface BotDecisionInput {
  readonly street: Street;
  readonly holeCards: readonly [Card, Card];
  readonly board: readonly Card[];
  readonly currentBetToMatch: number;
  readonly streetContribution: number;
  readonly minRaiseToAmount: number;
  readonly potBefore: number;
  readonly stack: number;
  /**
   * TDA Rule 47: 直前に不完全レイズ(再オープンしないショートオールイン)が発生し、この席が
   * 既にこのストリートでアクション済みの場合は false になる。false のときは fold/call のみ選べる。
   */
  readonly canRaise: boolean;
  /** 決定論的なテストのために乱数生成器を差し替え可能にする(未指定なら Math.random) */
  readonly random?: () => number;
}

export function decideBotAction(input: BotDecisionInput): PlayerAction {
  const rand = input.random ?? Math.random;
  const toCall = input.currentBetToMatch - input.streetContribution;
  const maxPossible = input.streetContribution + input.stack;

  const strength =
    input.street === "preflop" ? preflopScore(input.holeCards) / 20 : postflopStrength(input.holeCards, input.board) / 8;

  if (toCall <= 0) {
    // チェック可能な状況: 強いハンドは時々ベットする
    if (input.canRaise && strength > 0.55 && rand() < 0.7 && input.minRaiseToAmount <= maxPossible) {
      const betTo = Math.min(maxPossible, input.minRaiseToAmount + Math.floor(input.potBefore * strength * 0.5));
      return { kind: "bet", toAmount: betTo };
    }
    return { kind: "check" };
  }

  const potOdds = toCall / (input.potBefore + toCall);
  if (strength < potOdds * 0.8) {
    return { kind: "fold" };
  }

  if (input.canRaise && strength > 0.75 && rand() < 0.5 && input.minRaiseToAmount <= maxPossible) {
    const raiseTo = Math.min(maxPossible, input.minRaiseToAmount + Math.floor(input.potBefore * strength * 0.5));
    return { kind: "raise", toAmount: raiseTo };
  }

  if (toCall >= input.stack) {
    return { kind: "allIn" };
  }
  return { kind: "call" };
}
