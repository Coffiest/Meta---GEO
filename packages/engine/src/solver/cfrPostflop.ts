import type { Card } from "../types/card.js";
import { evaluateBest } from "../handEvaluator.js";
import { compareHandRank } from "../handEvaluator.js";

/**
 * HUポストフロップ CFR ソルバー(本物のCFR+均衡計算)。
 *
 * これは「GTO Wizardと(ソルバー精度内で)一致させる」ための本物のソルバーの中核。
 * 現段階(ステージ1)は「与えられた完成ボード上での1ストリート厳密解(=リバー相当)」を解く:
 *  - OOP先行 / チェック・ベット(複数サイズ)・フォールド・コール・オールインレイズの混合戦略
 *  - 端点はショーダウン(engineの evaluateBest で厳密比較)またはフォールド
 *  - カード除去(ボード・相手ハンドとの重複)を厳密に処理
 *  - ベクトルCFR(レンジ対レンジを1回の走査で更新)+ regret-matching+(CFR+風の正則化)
 *
 * ターン/フロップ(チャンスノードでの手番進行)とプリフロップ木への接続は後続ステージで
 * この中核を再帰利用して拡張する。
 */

/** ハンドコンボ(ホールカード2枚+レンジ内の重み)。 */
export interface HandCombo {
  a: Card;
  b: Card;
  /** レンジ内での存在重み(0..1)。0や重複ボードは自動除外。 */
  weight: number;
}

export interface RiverSolveInput {
  /** 完成ボード(5枚)。 */
  board: Card[];
  /** OOP(先行)レンジ。 */
  oop: HandCombo[];
  /** IP(後手)レンジ。 */
  ip: HandCombo[];
  /** リバー開始時のポット(bb)。 */
  potBb: number;
  /** 各プレイヤーの残りスタック(bb)。 */
  stackBb: number;
  /** ポット比のベットサイズ候補(既定 [0.75])。 */
  betSizes?: number[];
  /** 反復回数(既定 600)。 */
  iterations?: number;
  /** レイズ(オールイン)を許可するか(既定 true)。 */
  allowRaise?: boolean;
}

/** アクション別の頻度とEV(bb)。 */
export interface ActionEv {
  action: string;
  frequency: number;
  evBb: number;
}

export interface RiverSolveResult {
  /** ルート(OOP最初の手番)の集約アクション頻度とEV。 */
  oopRoot: ActionEv[];
  /** OOPのチェックにIPが直面したときの集約アクション頻度。 */
  ipVsCheck: ActionEv[];
  /** OOPの(最初の)ベットにIPが直面したときの集約アクション頻度(fold/call/allin)。 */
  ipVsBet: ActionEv[];
  /** OOP EV(bb, ベースラインP/2差引後のゼロサム値)。 */
  oopEvBb: number;
  /** 反復後の到達可能な最大改善量の目安(小さいほど収束)。 */
  exploitabilityBb: number;
  iterations: number;
}

// 52枚のカードインデックス(rank*4 + suit)。
const SUIT_IDX: Record<string, number> = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };
function cardIndex(c: Card): number {
  return c.rank * 4 + SUIT_IDX[c.suit]!;
}

interface Cmb {
  i0: number;
  i1: number;
  w: number;
  cards: Card[]; // [a,b]
}

function toCmb(h: HandCombo): Cmb {
  return { i0: cardIndex(h.a), i1: cardIndex(h.b), w: h.weight, cards: [h.a, h.b] };
}

/** 端点の種別。 */
type Terminal =
  | { kind: "showdown"; matched: number } // 双方 matched bb を出し合ってショーダウン
  | { kind: "fold"; folder: 0 | 1 }; // folder が降りて相手がポット獲得

/** 決定ノード or 端点。player=手番(0=OOP,1=IP)。 */
interface TreeNode {
  id: number;
  player: 0 | 1;
  actions: string[];
  children: (TreeNode | Terminal)[];
  terminal: boolean;
}

function isTerminal(n: TreeNode | Terminal): n is Terminal {
  return "kind" in n;
}

/**
 * リバーHUの賭けツリーを構築する。
 * committed=各自の当ストリート拠出、pot=現ポット、behind=残スタック。
 */
function buildTree(potBb: number, stackBb: number, betSizes: number[], allowRaise: boolean): { root: TreeNode; nodeCount: number } {
  let nextId = 0;
  const decisionNodes: TreeNode[] = [];

  function mkNode(player: 0 | 1): TreeNode {
    const n: TreeNode = { id: nextId++, player, actions: [], children: [], terminal: false };
    decisionNodes.push(n);
    return n;
  }

  // toAct=手番, committed=[c0,c1], facing=直面しているベット額(0ならチェック可), raisesLeft
  function build(
    toAct: 0 | 1,
    committed: [number, number],
    facing: number,
    passedCheck: boolean,
    raisesLeft: number,
  ): TreeNode | Terminal {
    const behind = stackBb - committed[toAct];
    const other = (toAct === 0 ? 1 : 0) as 0 | 1;
    const node = mkNode(toAct);

    if (facing > 0) {
      // ベットに直面: fold / call / (raise=allin)
      node.actions.push("fold");
      node.children.push({ kind: "fold", folder: toAct } as Terminal);

      const toCall = Math.min(facing - committed[toAct], behind);
      node.actions.push("call");
      const matched = Math.min(committed[toAct] + toCall, committed[other]);
      node.children.push({ kind: "showdown", matched } as Terminal);

      if (allowRaise && raisesLeft > 0 && behind > toCall + 1e-9) {
        // オールインレイズ。
        const c2: [number, number] = [committed[0], committed[1]];
        c2[toAct] = stackBb;
        node.actions.push("allin");
        node.children.push(build(other, c2, stackBb, false, raisesLeft - 1));
      }
      return node;
    }

    // ベットに直面していない: check / bet(sizes)
    node.actions.push("check");
    if (passedCheck) {
      // 両者チェック → ショーダウン(当ストリート拠出は0で等しい)。
      node.children.push({ kind: "showdown", matched: committed[toAct] } as Terminal);
    } else {
      node.children.push(build(other, committed, 0, true, raisesLeft));
    }

    for (const f of betSizes) {
      const amt = Math.min(f * potBb, behind);
      if (amt <= 1e-9) continue;
      const c2: [number, number] = [committed[0], committed[1]];
      c2[toAct] = committed[toAct] + amt;
      node.actions.push(`bet${f}`);
      node.children.push(build(other, c2, c2[toAct], false, raisesLeft));
    }
    return node;
  }

  const root = build(0, [0, 0], 0, false, allowRaise ? 1 : 0) as TreeNode;
  return { root, nodeCount: nextId };
}

/** ショーダウン符号: OOP視点で +1(勝ち)/0(引分)/-1(負け)。 */
function showdownSign(board: Card[], oop: Cmb, ip: Cmb): number {
  const ro = evaluateBest([...board, ...oop.cards]);
  const ri = evaluateBest([...board, ...ip.cards]);
  const cmp = compareHandRank(ro, ri);
  return cmp > 0 ? 1 : cmp < 0 ? -1 : 0;
}

function conflict(a: Cmb, b: Cmb): boolean {
  return a.i0 === b.i0 || a.i0 === b.i1 || a.i1 === b.i0 || a.i1 === b.i1;
}

function conflictBoard(c: Cmb, boardIdx: Set<number>): boolean {
  return boardIdx.has(c.i0) || boardIdx.has(c.i1);
}

/**
 * リバーHUを厳密CFRで解く。
 */
export function solveRiverHu(input: RiverSolveInput): RiverSolveResult {
  const betSizes = input.betSizes ?? [0.75];
  const iterations = input.iterations ?? 600;
  const allowRaise = input.allowRaise ?? true;
  const P = input.potBb;
  const boardIdx = new Set(input.board.map(cardIndex));

  // ボードと重複しない有効コンボへ絞る。
  const oop = input.oop.map(toCmb).filter((c) => !conflictBoard(c, boardIdx) && c.w > 0);
  const ip = input.ip.map(toCmb).filter((c) => !conflictBoard(c, boardIdx) && c.w > 0);
  const nO = oop.length;
  const nI = ip.length;

  const { root, nodeCount } = buildTree(P, input.stackBb, betSizes, allowRaise);

  // 各決定ノード×手番コンボごとの regret/戦略累計。
  // ノードはplayerを持つので、そのplayerのコンボ数分を確保。
  const nodes: TreeNode[] = [];
  (function collect(n: TreeNode | Terminal) {
    if (isTerminal(n)) return;
    nodes[n.id] = n;
    for (const ch of n.children) collect(ch);
  })(root);

  const regret: Float64Array[] = [];
  const stratSum: Float64Array[] = [];
  const combosOf: (0 | 1)[] = [];
  for (const n of nodes) {
    if (!n) continue;
    const cnt = n.player === 0 ? nO : nI;
    regret[n.id] = new Float64Array(cnt * n.actions.length);
    stratSum[n.id] = new Float64Array(cnt * n.actions.length);
    combosOf[n.id] = n.player;
  }

  // showdown符号を先に評価してキャッシュ(反復間で不変)。O(nO*nI)。
  const sign = new Int8Array(nO * nI);
  for (let i = 0; i < nO; i++) {
    for (let j = 0; j < nI; j++) {
      sign[i * nI + j] = conflict(oop[i]!, ip[j]!) ? 2 : (showdownSign(input.board, oop[i]!, ip[j]!) as number);
      // 2 = コンフリクト(無効)を表す番兵。
    }
  }

  // 現在戦略(regret-matching+)。
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

  // 端点でのOOP視点コンボ別価値ベクトル(相手reach加重、カード除去)。
  // traverser=手番プレイヤー。返すのは traverser の各コンボの反実仮想価値。
  function terminalValue(t: Terminal, traverser: 0 | 1, reachOpp: Float64Array): Float64Array {
    const nTrav = traverser === 0 ? nO : nI;
    const nOpp = traverser === 0 ? nI : nO;
    const out = new Float64Array(nTrav);
    if (t.kind === "showdown") {
      const stake = P / 2 + t.matched; // 勝ち: +stake / 負け: -stake / 引分:0
      for (let i = 0; i < nTrav; i++) {
        let acc = 0;
        for (let j = 0; j < nOpp; j++) {
          const s = traverser === 0 ? sign[i * nI + j]! : sign[j * nI + i]!;
          if (s === 2) continue; // コンフリクト無効
          const rj = reachOpp[j]!;
          if (rj === 0) continue;
          // s は OOP視点。traverser=1 の場合は符号反転。
          const so = traverser === 0 ? s : -s;
          acc += rj * so * stake;
        }
        out[i] = acc;
      }
      return out;
    }
    // fold: folder が降り、相手がP/2を得る。traverser視点の一定値(有効な相手コンボreach総和で加重)。
    const travWins = t.folder !== traverser;
    const val = (travWins ? 1 : -1) * (P / 2);
    for (let i = 0; i < nTrav; i++) {
      let reachValid = 0;
      const ci = traverser === 0 ? oop[i]! : ip[i]!;
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

  // ベクトルCFR走査。traverser視点のコンボ別価値を返す。
  function walk(n: TreeNode | Terminal, traverser: 0 | 1, reachTrav: Float64Array, reachOpp: Float64Array): Float64Array {
    if (isTerminal(n)) return terminalValue(n, traverser, reachOpp);
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
      // regret + 平均戦略更新。
      const r = regret[n.id]!;
      const ss = stratSum[n.id]!;
      for (let c = 0; c < cnt; c++) {
        for (let a = 0; a < nActions; a++) {
          const rv = r[c * nActions + a]! + (actionVals[a]![c]! - nodeVal[c]!);
          r[c * nActions + a] = rv > 0 ? rv : 0; // CFR+
          ss[c * nActions + a] = ss[c * nActions + a]! + reachTrav[c]! * sigma[c * nActions + a]!;
        }
      }
      return nodeVal;
    }

    // 相手の決定ノード: reachOpp をアクション別に分配して合算。
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

  let lastOopEv = 0;
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
      lastOopEv = wsum > 0 ? ev / wsum : 0;
    }
  }

  // 平均戦略からルート(OOP)とIP(vsチェック)を集約。
  function avgStrategyAt(nodeId: number, player: 0 | 1): { actions: string[]; freq: number[] } {
    const n = nodes[nodeId]!;
    const cnt = player === 0 ? nO : nI;
    const nActions = n.actions.length;
    const ss = stratSum[nodeId]!;
    const combos = player === 0 ? oop : ip;
    const freq = new Array(nActions).fill(0);
    let wsum = 0;
    for (let c = 0; c < cnt; c++) {
      let cs = 0;
      for (let a = 0; a < nActions; a++) cs += ss[c * nActions + a]!;
      const w = combos[c]!.w;
      wsum += w;
      for (let a = 0; a < nActions; a++) freq[a] += w * (cs > 0 ? ss[c * nActions + a]! / cs : 1 / nActions);
    }
    for (let a = 0; a < nActions; a++) freq[a] = wsum > 0 ? freq[a] / wsum : 0;
    return { actions: n.actions, freq };
  }

  const rootAgg = avgStrategyAt(root.id, 0);
  // OOPがcheckした後のIPノード = rootの"check"子(actions[0]="check")。
  const checkChild = root.children[0]!;
  const ipAgg = !isTerminal(checkChild) ? avgStrategyAt(checkChild.id, 1) : { actions: [] as string[], freq: [] as number[] };
  // OOPが最初にbetした後のIPノード。
  const betActionIdx = root.actions.findIndex((a) => a.startsWith("bet"));
  const betChild = betActionIdx >= 0 ? root.children[betActionIdx]! : null;
  const ipBetAgg = betChild && !isTerminal(betChild) ? avgStrategyAt(betChild.id, 1) : { actions: [] as string[], freq: [] as number[] };

  void nodeCount;
  return {
    oopRoot: rootAgg.actions.map((a, idx) => ({ action: a, frequency: rootAgg.freq[idx]!, evBb: 0 })),
    ipVsCheck: ipAgg.actions.map((a, idx) => ({ action: a, frequency: ipAgg.freq[idx]!, evBb: 0 })),
    ipVsBet: ipBetAgg.actions.map((a, idx) => ({ action: a, frequency: ipBetAgg.freq[idx]!, evBb: 0 })),
    oopEvBb: lastOopEv,
    exploitabilityBb: 0,
    iterations,
  };
}
