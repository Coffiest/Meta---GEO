import type { Card } from "../types/card.js";
import { evaluateBest, compareHandRank } from "../handEvaluator.js";

/**
 * 多ストリートHUポストフロップCFR(チャンスノード=次カード配布を厳密列挙)。
 *
 * リバー専用の cfrPostflop.ts を一般化し、ターン(4枚ボード→リバー44枚を列挙)や
 * リバー(5枚ボード=チャンスなし)を同一エンジンで厳密に解く。フロップ(3枚)は
 * 列挙数が大きい(47×46)ため本段階では対象外(後続でチャンスサンプリングを追加)。
 *
 * ベースライン: ルート(開始ストリート)のポット rootPot を「既に場にある賞金」とみなし、
 * 各端点のOOP効用 = 勝ち分 − 当ゲームでの自拠出 − rootPot/2 (ゼロサム)。
 */

export interface HandCombo {
  a: Card;
  b: Card;
  weight: number;
}

export interface PostflopSolveInput {
  /** 3〜5枚のボード(本段階は4=ターン/5=リバーを厳密対応)。 */
  board: Card[];
  oop: HandCombo[];
  ip: HandCombo[];
  potBb: number;
  stackBb: number;
  betSizes?: number[];
  iterations?: number;
  allowRaise?: boolean;
}

export interface ActionEv {
  action: string;
  frequency: number;
}

export interface PostflopSolveResult {
  oopRoot: ActionEv[];
  oopEvBb: number;
  iterations: number;
}

const SUIT_IDX: Record<string, number> = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };
function cardIndex(c: Card): number {
  return c.rank * 4 + SUIT_IDX[c.suit]!;
}

interface Cmb {
  i0: number;
  i1: number;
  w: number;
  cards: Card[];
}
function toCmb(h: HandCombo): Cmb {
  return { i0: cardIndex(h.a), i1: cardIndex(h.b), w: h.weight, cards: [h.a, h.b] };
}
function conflict(a: Cmb, b: Cmb): boolean {
  return a.i0 === b.i0 || a.i0 === b.i1 || a.i1 === b.i0 || a.i1 === b.i1;
}
function usesCard(c: Cmb, idx: number): boolean {
  return c.i0 === idx || c.i1 === idx;
}

type Terminal =
  | { kind: "showdown"; boardKey: string; board: Card[]; matched: number }
  | { kind: "fold"; folder: 0 | 1 };

interface DecisionNode {
  kind: "decision";
  id: number;
  player: 0 | 1;
  actions: string[];
  children: TreeNode[];
}
interface ChanceNode {
  kind: "chance";
  children: { cardIdx: number; node: TreeNode }[];
}
type TreeNode = DecisionNode | ChanceNode | Terminal;

const CARD_BY_INDEX: Card[] = (() => {
  const suits = ["spades", "hearts", "diamonds", "clubs"] as const;
  const arr: Card[] = [];
  for (let r = 2; r <= 14; r++) for (let s = 0; s < 4; s++) arr[r * 4 + s] = { rank: r as Card["rank"], suit: suits[s]! };
  return arr;
})();

/**
 * ゲーム木を構築する。cum=[累計拠出0,累計拠出1]。facingはcumから導出。
 */
function buildGameTree(
  rootPot: number,
  stack: number,
  boardStart: number[],
  betSizes: number[],
  allowRaise: boolean,
): { root: TreeNode; decisionNodes: DecisionNode[]; showdowns: Terminal[] } {
  let nextId = 0;
  const decisionNodes: DecisionNode[] = [];
  const showdowns: Terminal[] = [];

  function closeStreet(board: number[], cum: [number, number]): TreeNode {
    const matched = Math.min(cum[0], cum[1]);
    if (board.length >= 5) {
      const key = [...board].sort((a, b) => a - b).join(",");
      const t: Terminal = { kind: "showdown", boardKey: key, board: board.map((i) => CARD_BY_INDEX[i]!), matched };
      showdowns.push(t);
      return t;
    }
    // チャンス: 次の1枚を列挙。
    const used = new Set(board);
    const children: { cardIdx: number; node: TreeNode }[] = [];
    for (let c = 8; c < 60; c++) {
      if (!CARD_BY_INDEX[c]) continue;
      if (used.has(c)) continue;
      children.push({ cardIdx: c, node: build([...board, c], 0, [cum[0], cum[1]], false, allowRaise ? 1 : 0) });
    }
    return { kind: "chance", children };
  }

  function build(
    board: number[],
    toAct: 0 | 1,
    cum: [number, number],
    passedCheck: boolean,
    raisesLeft: number,
  ): TreeNode {
    const other = (toAct === 0 ? 1 : 0) as 0 | 1;
    const facing = cum[other] - cum[toAct];
    const behind = stack - cum[toAct];
    const currentPot = rootPot + cum[0] + cum[1];
    const node: DecisionNode = { kind: "decision", id: nextId++, player: toAct, actions: [], children: [] };
    decisionNodes.push(node);

    if (facing > 1e-9) {
      node.actions.push("fold");
      node.children.push({ kind: "fold", folder: toAct });

      const toCall = Math.min(facing, behind);
      const c2: [number, number] = [cum[0], cum[1]];
      c2[toAct] = cum[toAct] + toCall;
      node.actions.push("call");
      node.children.push(closeStreet(board, c2));

      if (allowRaise && raisesLeft > 0 && behind > toCall + 1e-9) {
        const c3: [number, number] = [cum[0], cum[1]];
        c3[toAct] = stack; // オールインレイズ
        node.actions.push("allin");
        node.children.push(build(board, other, c3, false, raisesLeft - 1));
      }
      return node;
    }

    // チェック
    node.actions.push("check");
    if (passedCheck) node.children.push(closeStreet(board, cum));
    else node.children.push(build(board, other, cum, true, raisesLeft));

    for (const f of betSizes) {
      const amt = Math.min(f * currentPot, behind);
      if (amt <= 1e-9) continue;
      const c2: [number, number] = [cum[0], cum[1]];
      c2[toAct] = cum[toAct] + amt;
      node.actions.push(`bet${f}`);
      node.children.push(build(board, other, c2, false, raisesLeft));
    }
    return node;
  }

  const root = build(boardStart, 0, [0, 0], false, allowRaise ? 1 : 0);
  return { root, decisionNodes, showdowns };
}

export function solvePostflopHu(input: PostflopSolveInput): PostflopSolveResult {
  const betSizes = input.betSizes ?? [0.75];
  const iterations = input.iterations ?? 400;
  const allowRaise = input.allowRaise ?? true;
  const P = input.potBb;
  const boardStartIdx = input.board.map(cardIndex);
  const boardSet = new Set(boardStartIdx);

  const oop = input.oop.map(toCmb).filter((c) => !usesAny(c, boardSet) && c.w > 0);
  const ip = input.ip.map(toCmb).filter((c) => !usesAny(c, boardSet) && c.w > 0);
  const nO = oop.length;
  const nI = ip.length;

  const { root, decisionNodes, showdowns } = buildGameTree(P, input.stackBb, boardStartIdx, betSizes, allowRaise);

  // ショーダウン符号をボードごとに事前計算(反復間で不変)。sign[i*nI+j]: OOP視点 +1/0/-1、2=無効。
  const signByBoard = new Map<string, Int8Array>();
  for (const t of showdowns) {
    if (t.kind !== "showdown" || signByBoard.has(t.boardKey)) continue;
    const arr = new Int8Array(nO * nI);
    for (let i = 0; i < nO; i++) {
      const ro = evaluateBest([...t.board, ...oop[i]!.cards]);
      for (let j = 0; j < nI; j++) {
        if (conflict(oop[i]!, ip[j]!)) {
          arr[i * nI + j] = 2;
          continue;
        }
        const ri = evaluateBest([...t.board, ...ip[j]!.cards]);
        const cmp = compareHandRank(ro, ri);
        arr[i * nI + j] = cmp > 0 ? 1 : cmp < 0 ? -1 : 0;
      }
    }
    signByBoard.set(t.boardKey, arr);
  }

  const regret: Float64Array[] = [];
  const stratSum: Float64Array[] = [];
  for (const n of decisionNodes) {
    const cnt = n.player === 0 ? nO : nI;
    regret[n.id] = new Float64Array(cnt * n.actions.length);
    stratSum[n.id] = new Float64Array(cnt * n.actions.length);
  }

  function strategy(nodeId: number, nActions: number, cnt: number): Float64Array {
    const r = regret[nodeId]!;
    const s = new Float64Array(cnt * nActions);
    for (let c = 0; c < cnt; c++) {
      let sum = 0;
      for (let a = 0; a < nActions; a++) {
        const v = r[c * nActions + a]!;
        if (v > 0) sum += v;
      }
      for (let a = 0; a < nActions; a++) {
        const v = r[c * nActions + a]!;
        s[c * nActions + a] = sum > 0 ? (v > 0 ? v / sum : 0) : 1 / nActions;
      }
    }
    return s;
  }

  function terminalValue(t: Terminal, traverser: 0 | 1, reachOpp: Float64Array): Float64Array {
    const nTrav = traverser === 0 ? nO : nI;
    const nOpp = traverser === 0 ? nI : nO;
    const out = new Float64Array(nTrav);
    if (t.kind === "showdown") {
      const sign = signByBoard.get(t.boardKey)!;
      const stake = P / 2 + t.matched;
      for (let i = 0; i < nTrav; i++) {
        let acc = 0;
        for (let j = 0; j < nOpp; j++) {
          const s = traverser === 0 ? sign[i * nI + j]! : sign[j * nI + i]!;
          if (s === 2) continue;
          const rj = reachOpp[j]!;
          if (rj === 0) continue;
          const so = traverser === 0 ? s : -s;
          acc += rj * so * stake;
        }
        out[i] = acc;
      }
      return out;
    }
    const travWins = t.folder !== traverser;
    const val = (travWins ? 1 : -1) * (P / 2);
    for (let i = 0; i < nTrav; i++) {
      const ci = traverser === 0 ? oop[i]! : ip[i]!;
      let reachValid = 0;
      for (let j = 0; j < nOpp; j++) {
        const rj = reachOpp[j]!;
        if (rj === 0) continue;
        const cj = traverser === 0 ? ip[j]! : oop[j]!;
        if (conflict(ci, cj)) continue;
        reachValid += rj;
      }
      out[i] = reachValid * val;
    }
    return out;
  }

  function walk(n: TreeNode, traverser: 0 | 1, reachTrav: Float64Array, reachOpp: Float64Array): Float64Array {
    if (n.kind === "showdown" || n.kind === "fold") return terminalValue(n, traverser, reachOpp);

    if (n.kind === "chance") {
      const nTrav = traverser === 0 ? nO : nI;
      const nOpp = traverser === 0 ? nI : nO;
      const travCombos = traverser === 0 ? oop : ip;
      const oppCombos = traverser === 0 ? ip : oop;
      const sum = new Float64Array(nTrav);
      const cnt = new Int32Array(nTrav);
      for (const ch of n.children) {
        const c = ch.cardIdx;
        // このランナウトで無効になるコンボの reach を0に。
        const rt = new Float64Array(nTrav);
        for (let i = 0; i < nTrav; i++) rt[i] = usesCard(travCombos[i]!, c) ? 0 : reachTrav[i]!;
        const ro = new Float64Array(nOpp);
        for (let j = 0; j < nOpp; j++) ro[j] = usesCard(oppCombos[j]!, c) ? 0 : reachOpp[j]!;
        const cv = walk(ch.node, traverser, rt, ro);
        for (let i = 0; i < nTrav; i++) {
          if (usesCard(travCombos[i]!, c)) continue;
          sum[i] = sum[i]! + cv[i]!;
          cnt[i] = cnt[i]! + 1;
        }
      }
      for (let i = 0; i < nTrav; i++) sum[i] = cnt[i]! > 0 ? sum[i]! / cnt[i]! : 0;
      return sum;
    }

    const nActions = n.actions.length;
    if (n.player === traverser) {
      const cnt = traverser === 0 ? nO : nI;
      const sigma = strategy(n.id, nActions, cnt);
      const nodeVal = new Float64Array(cnt);
      const actionVals: Float64Array[] = [];
      for (let a = 0; a < nActions; a++) {
        const rt = new Float64Array(cnt);
        for (let c = 0; c < cnt; c++) rt[c] = reachTrav[c]! * sigma[c * nActions + a]!;
        const cv = walk(n.children[a]!, traverser, rt, reachOpp);
        actionVals.push(cv);
        for (let c = 0; c < cnt; c++) nodeVal[c] = nodeVal[c]! + sigma[c * nActions + a]! * cv[c]!;
      }
      const r = regret[n.id]!;
      const ss = stratSum[n.id]!;
      for (let c = 0; c < cnt; c++) {
        for (let a = 0; a < nActions; a++) {
          const rv = r[c * nActions + a]! + (actionVals[a]![c]! - nodeVal[c]!);
          r[c * nActions + a] = rv > 0 ? rv : 0;
          ss[c * nActions + a] = ss[c * nActions + a]! + reachTrav[c]! * sigma[c * nActions + a]!;
        }
      }
      return nodeVal;
    }

    const cntOpp = n.player === 0 ? nO : nI;
    const sigmaOpp = strategy(n.id, nActions, cntOpp);
    const nTrav = traverser === 0 ? nO : nI;
    const total = new Float64Array(nTrav);
    for (let a = 0; a < nActions; a++) {
      const ro = new Float64Array(cntOpp);
      for (let c = 0; c < cntOpp; c++) ro[c] = reachOpp[c]! * sigmaOpp[c * nActions + a]!;
      const cv = walk(n.children[a]!, traverser, reachTrav, ro);
      for (let i = 0; i < nTrav; i++) total[i] = total[i]! + cv[i]!;
    }
    return total;
  }

  const reachO = new Float64Array(nO);
  for (let i = 0; i < nO; i++) reachO[i] = oop[i]!.w;
  const reachI = new Float64Array(nI);
  for (let j = 0; j < nI; j++) reachI[j] = ip[j]!.w;

  let oopEv = 0;
  for (let it = 0; it < iterations; it++) {
    const vo = walk(root, 0, reachO, reachI);
    walk(root, 1, reachI, reachO);
    if (it === iterations - 1) {
      let ev = 0;
      let wsum = 0;
      for (let i = 0; i < nO; i++) {
        ev += vo[i]!;
        wsum += reachO[i]!;
      }
      oopEv = wsum > 0 ? ev / wsum : 0;
    }
  }

  const rootNode = root as DecisionNode;
  const cntRoot = nO;
  const nActionsRoot = rootNode.actions.length;
  const ss = stratSum[rootNode.id]!;
  const freq = new Array(nActionsRoot).fill(0);
  let wsum = 0;
  for (let c = 0; c < cntRoot; c++) {
    let cs = 0;
    for (let a = 0; a < nActionsRoot; a++) cs += ss[c * nActionsRoot + a]!;
    const w = oop[c]!.w;
    wsum += w;
    for (let a = 0; a < nActionsRoot; a++) freq[a] += w * (cs > 0 ? ss[c * nActionsRoot + a]! / cs : 1 / nActionsRoot);
  }
  for (let a = 0; a < nActionsRoot; a++) freq[a] = wsum > 0 ? freq[a] / wsum : 0;

  return {
    oopRoot: rootNode.actions.map((a, idx) => ({ action: a, frequency: freq[idx]! })),
    oopEvBb: oopEv,
    iterations,
  };
}

function usesAny(c: Cmb, board: Set<number>): boolean {
  return board.has(c.i0) || board.has(c.i1);
}
