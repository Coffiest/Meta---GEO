import {
  compareHandRank,
  createOrderedDeck,
  evaluateBest,
  HAND_CATEGORY,
  type Card,
  type PlayerAction,
  type Street,
} from "@meta-geo/engine";

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

// === プリフロップのハンド分類 & GTO準拠のレンジ表(169ハンドを関数で表現) ===
interface PreflopClass {
  readonly hi: number;
  readonly lo: number;
  readonly suited: boolean;
  readonly pair: boolean;
}
function preflopClass(hole: readonly [Card, Card]): PreflopClass {
  const hi = Math.max(hole[0].rank, hole[1].rank);
  const lo = Math.min(hole[0].rank, hole[1].rank);
  return { hi, lo, suited: hole[0].suit === hole[1].suit, pair: hole[0].rank === hole[1].rank };
}

/** ファーストイン時のオープンレイズレンジ(RFI, ~22%)。GTO準拠のブレンドレンジをハードコード。 */
function inRfiOpen({ hi, lo, suited, pair }: PreflopClass): boolean {
  if (pair) return true; // 22+
  if (suited) {
    if (hi === 14) return true; // A2s+
    if (hi === 13) return lo >= 5; // K5s+
    if (hi === 12) return lo >= 8; // Q8s+
    if (hi === 11) return lo >= 8; // J8s+
    if (hi === 10) return lo >= 7; // T7s+
    if (hi === 9) return lo >= 7; // 97s+
    if (hi === 8) return lo >= 6; // 86s+
    if (hi === 7) return lo >= 6; // 76s
    if (hi === 6) return lo >= 5; // 65s
    if (hi === 5) return lo >= 4; // 54s
    return false;
  }
  if (hi === 14) return lo >= 9; // A9o+
  if (hi === 13) return lo >= 10; // KTo+
  if (hi === 12) return lo >= 10; // QTo+
  if (hi === 11) return lo >= 10; // JTo
  return false;
}

/** 有効15BB以下のオープンプッシュ(ジャム)レンジ(~32%、RFIより広い)。 */
function inJamShort({ hi, lo, suited, pair }: PreflopClass): boolean {
  if (pair) return true;
  if (suited) {
    if (hi === 14) return true; // Axs
    if (hi === 13) return lo >= 4;
    if (hi === 12) return lo >= 7;
    if (hi === 11) return lo >= 7;
    if (hi === 10) return lo >= 6;
    if (hi === 9) return lo >= 6;
    if (hi === 8) return lo >= 6;
    if (hi === 7) return lo >= 5;
    if (hi === 6) return lo >= 5;
    return false;
  }
  if (hi === 14) return lo >= 5; // A5o+
  if (hi === 13) return lo >= 8; // K8o+
  if (hi === 12) return lo >= 9; // Q9o+
  if (hi === 11) return lo >= 9; // J9o+
  if (hi === 10) return lo >= 9; // T9o
  return false;
}

/** 有効15BB以下でレイズに直面したときのコール/リシャブ(再ジャム)レンジ(タイト)。 */
function inCallJamShort({ hi, lo, suited, pair }: PreflopClass): boolean {
  if (pair) return hi >= 5; // 55+
  if (suited) {
    if (hi === 14) return lo >= 9; // A9s+
    if (hi === 13) return lo >= 11; // KJs+
    if (hi === 12) return lo >= 11; // QJs
    return false;
  }
  if (hi === 14) return lo >= 11; // AJo+
  if (hi === 13) return lo >= 12; // KQo
  return false;
}

// === ポストフロップのメイド手 & ドロー分類 ===
interface MadeInfo {
  /** ツーペア以上(セット/ストレート/フラッシュ等を含む)。 */
  readonly strong: boolean;
  readonly overpair: boolean;
  readonly topPair: boolean;
  /** トップペア・トップキッカー相当(キッカーQ以上)。 */
  readonly tptk: boolean;
  /** セカンドヒット以下(トップでないワンペア)or ノーペア。 */
  readonly weak: boolean;
}
function classifyMade(hole: readonly [Card, Card], board: readonly Card[]): MadeInfo {
  const best = evaluateBest([...hole, ...board]);
  const cat = best.category;
  const strong = cat >= HAND_CATEGORY.twoPair;
  const topBoard = board.reduce((m, c) => Math.max(m, c.rank), 0);
  const pocketPair = hole[0].rank === hole[1].rank;
  const boardRanks = board.map((c) => c.rank);
  const overpair = pocketPair && cat === HAND_CATEGORY.onePair && hole[0].rank > topBoard;
  const hitsTop = hole.some((c) => c.rank === topBoard && boardRanks.includes(topBoard));
  const topPair = !strong && cat === HAND_CATEGORY.onePair && hitsTop;
  const kicker = topPair ? Math.max(...hole.filter((c) => c.rank !== topBoard).map((c) => c.rank), 0) : 0;
  const tptk = topPair && kicker >= 12; // Q以上
  const weak = !strong && !overpair && !(topPair && kicker >= 11);
  return { strong, overpair, topPair, tptk, weak };
}

interface DrawInfo {
  readonly flushDraw: boolean;
  readonly oesd: boolean;
  readonly gutshot: boolean;
}
function classifyDraw(hole: readonly [Card, Card], board: readonly Card[]): DrawInfo {
  const all = [...hole, ...board];
  // フラッシュドロー: いずれかのスートがちょうど4枚(まだ5枚目が来うる=board 3〜4枚)。
  const suitCounts: Record<string, number> = {};
  for (const c of all) suitCounts[c.suit] = (suitCounts[c.suit] ?? 0) + 1;
  const flushDraw = board.length <= 4 && Object.values(suitCounts).some((n) => n === 4);
  // ストレートドロー: 距離1のランク集合(Aは1としても評価)から4連=OESD、飛び=ガットショット。
  const rankSet = new Set<number>();
  for (const c of all) {
    rankSet.add(c.rank);
    if (c.rank === 14) rankSet.add(1);
  }
  let oesd = false;
  let gutshot = false;
  for (let low = 1; low <= 11 && !oesd; low++) {
    // 5枚窓 [low, low+4] に4枚あればドロー。両端が空=OESD、内側が空=ガットショット。
    const present = [0, 1, 2, 3, 4].map((i) => rankSet.has(low + i));
    const count = present.filter(Boolean).length;
    if (count === 4) {
      const missingIdx = present.indexOf(false);
      if (missingIdx === 0 || missingIdx === 4) oesd = true;
      else gutshot = true;
    }
  }
  return { flushDraw, oesd, gutshot };
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
  /** 現在のレベルのビッグブラインド額。プリフロップのレンジ表/プッシュフォールド判定に使う。未指定時は0(判定無効)。 */
  readonly bigBlind?: number | undefined;
  /**
   * このハンドで最後にアグレッシブアクション(bet/raise/allIn)を取ったのが自分か。
   * ドンクベット禁止(=アグレッサーでない席は、チェックされた場面でリードベットしない)の判定に使う。
   */
  readonly isAggressor?: boolean;
  /** 決定論的なテストのために乱数生成器を差し替え可能にする(未指定なら Math.random) */
  readonly random?: () => number;
}

/** このハンドで最後にアグレッシブアクション(bet/raise/allIn)を取った席番号を返す(ドンク判定用)。無ければnull。 */
export function lastAggressorSeat(events: readonly unknown[]): number | null {
  let seat: number | null = null;
  for (const ev of events) {
    const e = ev as { type?: string; seatIndex?: number };
    if ((e.type === "bet" || e.type === "raise" || e.type === "allIn") && typeof e.seatIndex === "number") {
      seat = e.seatIndex;
    }
  }
  return seat;
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

  // baseを起点に「フロップ33%・ターン/リバーはジオメトリック」のサイズを上乗せしたtoAmountを返す。
  // ベット後に残るスタックがポットの半分以下=実質ポットコミットになる場合は、中途半端に残さず
  // オールインに切り替える(ポットコミット回避)。ドンクは呼び出し側で禁止済み。
  function sizeBetTo(base: number): number {
    const fraction =
      input.street === "flop" ? 0.33 * (0.92 + rand() * 0.16) : geometricFraction() * (0.9 + rand() * 0.2);
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

  // === プリフロップ: GTO準拠のオープンレンジ表 + 15BB以下はプッシュ/フォールド ===
  if (input.street === "preflop" && bigBlind > 0) {
    const pc = preflopClass(input.holeCards);
    const unraised = input.currentBetToMatch <= bigBlind;
    const effBB = input.stack / bigBlind;

    // 有効15BB以下: プッシュ・オア・フォールド。
    if (effBB <= 15) {
      if (unraised) {
        if (inJamShort(pc)) return { kind: "allIn" };
        return toCall <= 0 ? { kind: "check" } : { kind: "fold" };
      }
      // レイズに直面: タイトなレンジでのみ全部入れ(コール/リシャブ=オールイン)、それ以外は降りる。
      if (inCallJamShort(pc)) return { kind: "allIn" };
      return { kind: "fold" };
    }

    // ディープ: 未レイズならレンジ表でオープン(~2.2BB)、レイズ直面は下の勝率ベース継続へ。
    if (unraised) {
      if (!inRfiOpen(pc)) return toCall <= 0 ? { kind: "check" } : { kind: "fold" };
      if (!input.canRaise || input.minRaiseToAmount > maxPossible) {
        if (toCall <= 0) return { kind: "check" };
        return toCall >= input.stack ? { kind: "allIn" } : { kind: "call" };
      }
      const openTo = Math.min(maxPossible, Math.max(input.minRaiseToAmount, 2 * bigBlind));
      if (maxPossible - openTo <= bigBlind * 1.5) return { kind: "allIn" };
      return { kind: "raise", toAmount: openTo };
    }
    // レイズ直面(ディープ)は下の勝率/ポットオッズベースの継続判定に委ねる。
  }

  const made = input.street === "preflop" ? null : classifyMade(input.holeCards, input.board);
  const draw = input.street === "preflop" ? null : classifyDraw(input.holeCards, input.board);
  const hasStrongDraw = Boolean(draw && (draw.flushDraw || draw.oesd));

  if (toCall <= 0) {
    // チェックできる場面。
    // ドンクベット禁止: 主導権(アグレッサー)を持たない席は、中途半端なバリュー/セミブラフ/ブラフでの
    // リードベット(=ドンク)をしない。ただし明確な強バリュー(ツーペア以上/オーバーペア/TPTK)だけは、
    // 主導権に関わらずバリューとしてベットする(ナッツ級を大人しくチェックする方がGTOから外れるため)。
    const canBet = input.canRaise && input.minRaiseToAmount <= maxPossible;
    if (canBet && made) {
      const strongValue = made.strong || made.overpair || made.tptk;
      let betProb = 0;
      if (strongValue) {
        betProb = 0.9; // 強バリューは主導権に関わらずベット
      } else if (input.isAggressor) {
        // 主導権を持つ席のみ、cベット(中程度のトップペア)/セミブラフ/薄いベットを混ぜる。
        if (made.topPair) betProb = 0.5;
        else if (hasStrongDraw) betProb = 0.6;
        else betProb = equity > 0.5 ? 0.25 : 0.06;
      }
      if (betProb > 0 && rand() < betProb) return { kind: "bet", toAmount: sizeBetTo(input.streetContribution) };
    }
    return { kind: "check" };
  }

  // === ベット/レイズに直面 ===
  const potOdds = toCall / (input.potBefore + toCall);
  let requiredEquity = clamp01(potOdds * 1.12 - shortStackBonus);
  // ターン以降はセカンドヒット以下(weak)でドローも無いなら、明確に強くない限り降りる(GTO準拠の折り)。
  if (made && made.weak && !hasStrongDraw && (input.street === "turn" || input.street === "river")) {
    requiredEquity = Math.max(requiredEquity, 0.62);
  }

  if (equity < requiredEquity) return { kind: "fold" };
  if (toCall >= input.stack) return { kind: "allIn" };

  // レイズ: バリュー(強いメイド手)を主体に、たまにドローでセミブラフレイズ。
  if (input.canRaise && input.minRaiseToAmount <= maxPossible) {
    const valueRaise = made ? made.strong || made.overpair || made.tptk : equity > 0.68;
    const raiseProb = valueRaise ? clamp01((equity - 0.6) * 2.0) : hasStrongDraw ? 0.22 : 0;
    if (rand() < raiseProb) return { kind: "raise", toAmount: sizeBetTo(input.currentBetToMatch) };
  }

  return { kind: "call" };
}
