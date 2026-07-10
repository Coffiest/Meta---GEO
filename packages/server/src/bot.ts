import { compareHandRank, createOrderedDeck, evaluateBest, type Card, type PlayerAction, type Street } from "@meta-geo/engine";

/**
 * モンテカルロ勝率推定ベースのBOT。以前は粗いChen Formula風スコアで意思決定していたが、
 * 実際のショーダウン勝率(ランダムなレンジを仮定したモンテカルロ)を全ストリートで直接計算し、
 * それをポットオッズと比較する方式に置き換えた。さらに、閾値による決定論的な分岐だけでなく、
 * 勝率に連動した連続的な頻度(ベット/レイズ/ブラフ頻度)で確率的に行動を選ぶことで、
 * 単一の戦略に固定されない(exploitされにくい)GTO的な混合戦略に近づけている。
 * 相手のレンジ絞り込み(3ベットレンジ・ポジション別オープンレンジ等)までは行わない簡易モデルであり、
 * 完全なソルバー(CFR等)ではない点には留意。
 */

const cardKey = (c: Card): string => `${c.rank}${c.suit[0]}`;

function remainingDeck(used: readonly Card[]): Card[] {
  const usedKeys = new Set(used.map(cardKey));
  return createOrderedDeck().filter((c) => !usedKeys.has(cardKey(c)));
}

function shuffleInPlace(cards: Card[]): void {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = cards[i]!;
    cards[i] = cards[j]!;
    cards[j] = tmp;
  }
}

/** サンプル数は相手数が増えるほど1回あたりの計算コストが上がるため、逆比例で減らす。 */
function sampleCountFor(numOpponents: number): number {
  return Math.max(60, Math.min(260, Math.floor(3600 / (numOpponents + 2))));
}

/**
 * モンテカルロ法でショーダウン勝率(タイは山分け)を推定する。相手はランダムハンドとして扱う
 * (実際のプレイヤーのレンジ絞り込みまでは行わない簡易モデルだが、手作業のヒューリスティック
 * スコアより遥かに客観的な強さの指標になる)。
 */
export function estimateEquity(
  holeCards: readonly [Card, Card],
  board: readonly Card[],
  numOpponents: number,
): number {
  if (numOpponents <= 0) return 1;
  const used = [...holeCards, ...board];
  const pool = remainingDeck(used);
  const boardMissing = 5 - board.length;
  const samples = sampleCountFor(numOpponents);
  if (pool.length < numOpponents * 2 + boardMissing) return 0.5; // 安全側フォールバック(理論上到達しない)

  let winShare = 0;
  for (let i = 0; i < samples; i++) {
    const deck = [...pool];
    shuffleInPlace(deck);
    let cursor = 0;
    const opponents: Card[][] = [];
    for (let o = 0; o < numOpponents; o++) {
      opponents.push([deck[cursor]!, deck[cursor + 1]!]);
      cursor += 2;
    }
    const runoutBoard = [...board, ...deck.slice(cursor, cursor + boardMissing)];

    const myRank = evaluateBest([...holeCards, ...runoutBoard]);
    let winners = 1;
    let beaten = false;
    for (const opp of opponents) {
      const oppRank = evaluateBest([...opp, ...runoutBoard]);
      const cmp = compareHandRank(myRank, oppRank);
      if (cmp < 0) {
        beaten = true;
        break;
      }
      if (cmp === 0) winners++;
    }
    if (!beaten) winShare += 1 / winners;
  }
  return winShare / samples;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** 勝率が高いほど大きいサイズを選びやすいが、サイズを1種類に固定しない(頻度を混ぜる)ためのポット比率。 */
const BET_SIZE_FRACTIONS = [0.33, 0.5, 0.66, 0.75, 1.0, 1.25] as const;

function chooseBetFraction(equity: number, rand: () => number): number {
  const idx = Math.round(clamp01(equity) * (BET_SIZE_FRACTIONS.length - 1) + (rand() - 0.5) * 1.5);
  return BET_SIZE_FRACTIONS[Math.max(0, Math.min(BET_SIZE_FRACTIONS.length - 1, idx))]!;
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
  /** まだ生きている相手の人数(自分を除く)。勝率推定の精度に直結する。未指定時は1人と仮定する。 */
  readonly activeOpponentCount?: number;
  /** 決定論的なテストのために乱数生成器を差し替え可能にする(未指定なら Math.random) */
  readonly random?: () => number;
}

export function decideBotAction(input: BotDecisionInput): PlayerAction {
  const rand = input.random ?? Math.random;
  const toCall = input.currentBetToMatch - input.streetContribution;
  const maxPossible = input.streetContribution + input.stack;
  const opponents = Math.max(1, input.activeOpponentCount ?? 1);

  const equity = estimateEquity(input.holeCards, input.board, opponents);

  // スタックが浅いほど(SPRが低いほど)、勝率の閾値を緩めて広めにコミットする
  // (トーナメントのプッシュ/フォールド的な簡易ICM近似)。
  const stackToPotRatio = input.potBefore > 0 ? input.stack / input.potBefore : 99;
  const shortStackBonus = stackToPotRatio < 3 ? 0.08 : stackToPotRatio < 6 ? 0.04 : 0;

  function sizeBetTo(base: number): number {
    const fraction = chooseBetFraction(equity, rand);
    const raw = base + Math.round((input.potBefore + toCall) * fraction);
    return Math.max(input.minRaiseToAmount, Math.min(maxPossible, raw));
  }

  if (toCall <= 0) {
    // チェック可能な状況: 勝率が高いほどベット頻度・サイズが上がる。弱いハンドもごく低頻度で
    // ブラフベットを混ぜ、常にチェックだけの読みやすい戦略にならないようにする。
    if (input.canRaise && input.minRaiseToAmount <= maxPossible) {
      const valueBetProb = equity > 0.55 ? clamp01((equity - 0.55) * 2.4) : 0;
      const bluffProb = equity < 0.28 ? 0.14 : equity < 0.4 ? 0.06 : 0;
      const betProb = Math.max(valueBetProb, bluffProb);
      if (rand() < betProb) {
        return { kind: "bet", toAmount: sizeBetTo(input.streetContribution) };
      }
    }
    return { kind: "check" };
  }

  const potOdds = toCall / (input.potBefore + toCall);
  // 相手はランダムハンドではなく実際にベット/レイズしたレンジを持つため、単純なポットオッズより
  // 少し高めの勝率を要求する(相手のレンジがランダムより強いことへの補正マージン)。
  const requiredEquity = clamp01(potOdds * 1.15 - shortStackBonus);

  if (equity < requiredEquity) {
    return { kind: "fold" };
  }

  if (toCall >= input.stack) {
    return { kind: "allIn" };
  }

  if (input.canRaise && input.minRaiseToAmount <= maxPossible) {
    const raiseProb = clamp01((equity - Math.max(0.6, requiredEquity + 0.1)) * 2.2);
    if (rand() < raiseProb) {
      return { kind: "raise", toAmount: sizeBetTo(input.currentBetToMatch) };
    }
  }

  return { kind: "call" };
}
