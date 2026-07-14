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
  /** 現在のレベルのビッグブラインド額。プリフロップのリンプ禁止/2BBオープン判定に使う。未指定時は0(判定無効)。 */
  readonly bigBlind?: number | undefined;
  /** 決定論的なテストのために乱数生成器を差し替え可能にする(未指定なら Math.random) */
  readonly random?: () => number;
}

export function decideBotAction(input: BotDecisionInput): PlayerAction {
  const rand = input.random ?? Math.random;
  const toCall = input.currentBetToMatch - input.streetContribution;
  const maxPossible = input.streetContribution + input.stack;
  const opponents = Math.max(1, input.activeOpponentCount ?? 1);
  const bigBlind = input.bigBlind ?? 0;

  const equity = estimateEquity(input.holeCards, input.board, opponents);

  // スタックが浅いほど(SPRが低いほど)、勝率の閾値を緩めて広めにコミットする
  // (トーナメントのプッシュ/フォールド的な簡易ICM近似)。
  const stackToPotRatio = input.potBefore > 0 ? input.stack / input.potBefore : 99;
  const shortStackBonus = stackToPotRatio < 3 ? 0.08 : stackToPotRatio < 6 ? 0.04 : 0;

  // 残りのストリート数(現在のストリートより後に賭けが起こりうる回数)。
  const streetsRemaining = input.street === "turn" ? 2 : input.street === "river" ? 1 : 3;

  // ジオメトリック(等比)ベットサイジング: 残りストリートで等比数列的にポットを膨らませ、
  // リバーで無理なく全スタックを注ぎ込める1ストリートあたりのベット額(ポット比 f)を求める。
  // f = ( ((2E+P)/P)^(1/n) - 1 ) / 2  (E=コール後の実効残スタック, P=コール後のポット, n=残ストリート)
  function geometricFraction(): number {
    const pot = input.potBefore + Math.max(0, toCall);
    const behind = Math.max(0, input.stack - Math.max(0, toCall));
    if (pot <= 0 || behind <= 0) return 0.66;
    const ratio = (2 * behind + pot) / pot;
    const f = (Math.pow(ratio, 1 / streetsRemaining) - 1) / 2;
    return Math.max(0.33, Math.min(1.5, f));
  }

  // baseを起点にジオメトリックサイズ分を上乗せしたtoAmountを返す。
  // ベット後に残るスタックがポットの半分以下=実質ポットコミットになる場合は、
  // 中途半端に残さずオールインに切り替える(ユーザー要望のポットコミット回避)。
  function sizeBetTo(base: number): number {
    const fraction = geometricFraction() * (0.9 + rand() * 0.2);
    const potNow = input.potBefore + Math.max(0, toCall);
    const raw = base + Math.round(potNow * fraction);
    const capped = Math.max(input.minRaiseToAmount, Math.min(maxPossible, raw));
    const remainingBehind = maxPossible - capped;
    const potAfterBet = potNow + (capped - input.streetContribution);
    if (remainingBehind > 0 && remainingBehind <= potAfterBet * 0.5) {
      return maxPossible;
    }
    return capped;
  }

  // === プリフロップ: リンプ禁止・2BBオープン ===
  // まだ誰もレイズしていない(現在のベット額がBB以下)プリフロップでは、コールでリンプせず、
  // オープンするなら2BBへレイズ、しないならフォールド(BBの席はチェック可能なのでチェック)。
  const preflopUnraised = input.street === "preflop" && bigBlind > 0 && input.currentBetToMatch <= bigBlind;
  if (preflopUnraised) {
    const openThreshold = 0.5 + 0.03 * (opponents - 1) - shortStackBonus;
    const wantsToOpen = equity >= openThreshold;
    if (!wantsToOpen) {
      return toCall <= 0 ? { kind: "check" } : { kind: "fold" };
    }
    if (!input.canRaise || input.minRaiseToAmount > maxPossible) {
      // レイズ不可(再オープン不可 等)。チェックできるならチェック、無理ならオールイン/コール。
      if (toCall <= 0) return { kind: "check" };
      if (toCall >= input.stack) return { kind: "allIn" };
      return { kind: "call" };
    }
    const openTo = Math.min(maxPossible, Math.max(input.minRaiseToAmount, 2 * bigBlind));
    // 2BBオープンでほぼコミットするショートスタックは最初からオールイン(プッシュ/フォールド)。
    if (maxPossible - openTo <= bigBlind * 1.5) return { kind: "allIn" };
    return { kind: "raise", toAmount: openTo };
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
