/**
 * ICM(Independent Chip Model)。トーナメントのその時点での、各プレイヤーの
 * 優勝率・インマネ(入賞)率・期待賞金を、スタックの比から求める(Malmuth-Harville)。
 *
 * Harville のモデル: まだ順位の決まっていないプレイヤーの中で、次の順位(1位から順に)を取る確率は
 * そのプレイヤーのスタック ÷ 残りのスタックの合計。これを入賞の順位の数だけ繰り返す。
 *  - 優勝率 = スタック ÷ 全員のスタックの合計(チップ比)と一致する
 *  - インマネ率 = 入賞の順位のどれかを取る確率
 *  - 期待賞金 = Σ(その順位を取る確率 × その順位の賞金)
 *
 * 計算は入賞の順位の数だけ深さのある再帰(厳密)。枝の数が上限を超えるときだけ、
 * 固定シードのサンプリングに切り替える(同じ入力なら同じ結果)。
 */

export interface IcmResult {
  /** 優勝率(0〜1)。 */
  win: number;
  /** 入賞する確率(0〜1)。入賞の順位が無ければ 0。 */
  itm: number;
  /** 期待賞金(payouts と同じ単位)。 */
  equity: number;
}

/** 厳密計算で辿る枝の数の上限。これを超える組み合わせはサンプリングにする。 */
const EXACT_BRANCH_LIMIT = 2_000_000;
/** サンプリングの回数。 */
const SAMPLES = 20_000;

function branchCount(n: number, depth: number): number {
  let c = 1;
  for (let i = 0; i < depth; i++) c *= Math.max(1, n - i);
  return c;
}

/** 線形合同法の乱数(固定シード)。 */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * @param stacks 生存しているプレイヤーのスタック(0以下のプレイヤーは順位を取れない)
 * @param payouts 1位から順の賞金(長さ = 入賞人数)
 */
export function computeIcm(stacks: readonly number[], payouts: readonly number[]): IcmResult[] {
  const n = stacks.length;
  const s = stacks.map((x) => Math.max(0, x));
  const total = s.reduce((a, b) => a + b, 0);
  const out: IcmResult[] = s.map((x) => ({ win: total > 0 ? x / total : 0, itm: 0, equity: 0 }));
  if (n === 0 || total <= 0) return out;
  const places = Math.min(payouts.length, n);
  if (places === 0) return out;

  // place[i][k] = プレイヤー i が k 位(0始まり)を取る確率。
  const place: number[][] = s.map(() => new Array<number>(places).fill(0));

  if (branchCount(n, places) <= EXACT_BRANCH_LIMIT) {
    const used = new Array<boolean>(n).fill(false);
    const walk = (depth: number, remaining: number, prob: number) => {
      if (depth === places || remaining <= 0) return;
      for (let i = 0; i < n; i++) {
        if (used[i] || s[i]! <= 0) continue;
        const p = prob * (s[i]! / remaining);
        place[i]![depth]! += p;
        used[i] = true;
        walk(depth + 1, remaining - s[i]!, p);
        used[i] = false;
      }
    };
    walk(0, total, 1);
  } else {
    const rand = rng(n * 7919 + places * 104729 + Math.round(total));
    for (let t = 0; t < SAMPLES; t++) {
      const used = new Array<boolean>(n).fill(false);
      let remaining = total;
      for (let depth = 0; depth < places && remaining > 0; depth++) {
        let r = rand() * remaining;
        let pick = -1;
        for (let i = 0; i < n; i++) {
          if (used[i] || s[i]! <= 0) continue;
          r -= s[i]!;
          pick = i;
          if (r <= 0) break;
        }
        if (pick < 0) break;
        used[pick] = true;
        remaining -= s[pick]!;
        place[pick]![depth]! += 1 / SAMPLES;
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const row = place[i]!;
    out[i]!.itm = row.reduce((a, b) => a + b, 0);
    out[i]!.equity = row.reduce((a, p, k) => a + p * (payouts[k] ?? 0), 0);
  }
  return out;
}
