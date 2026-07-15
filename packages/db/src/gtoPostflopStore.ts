import { prisma } from "./client.js";
import {
  gtoPostflopSpotComponents,
  gtoPostflopSpotKey,
  GTO_POSTFLOP_SOLVER_VERSION,
  type GtoPostflopSpotSnapshot,
} from "./gtoPostflop.js";

/**
 * GTOポストフロップ(SRP)スポット解の永続層(GtoSolutionテーブル)への read/write。
 *
 * - キーは gtoPostflopSpotKey(band, opener, defender, board) = solverSpot の spotKey。
 *   スート正規化により suit-isomorphic なボードは同一行に集約され、命中率が上がる。
 * - solution カラムには「全ノード戦略(GtoPostflopSpotSnapshot)」をそのまま格納する。
 * - サンドボックス等でDBへ到達できない場合、read は null / write は無害に握りつぶす
 *   (呼び出し側はオンデマンド計算へフォールバックする)。
 */

/** spotKey で永続スナップショットを読む。存在しない/DB不達なら null。 */
export async function readGtoPostflopSnapshot(spotKey: string): Promise<GtoPostflopSpotSnapshot | null> {
  try {
    const row = await prisma.gtoSolution.findUnique({ where: { spotKey } });
    if (!row) return null;
    const snap = row.solution as unknown as GtoPostflopSpotSnapshot;
    if (!snap || typeof snap !== "object" || !snap.nodes) return null;
    return snap;
  } catch {
    return null;
  }
}

/** スナップショットを spotKey で冪等に upsert する。DB不達なら握りつぶす。 */
export async function writeGtoPostflopSnapshot(
  band: string,
  opener: string,
  defender: string,
  board: string[],
  snapshot: GtoPostflopSpotSnapshot,
): Promise<void> {
  const spotKey = gtoPostflopSpotKey(band, opener, defender, board);
  const c = gtoPostflopSpotComponents(band, opener, defender, board);
  try {
    await prisma.gtoSolution.upsert({
      where: { spotKey },
      create: {
        spotKey,
        street: c.street,
        effStackBucket: c.effStackBucket,
        heroPos: c.heroPos,
        boardCanon: c.boardCanon,
        actionLine: c.actionLine,
        betTree: c.betTree,
        solution: snapshot as unknown as object,
        exploitability: 0,
        solverVersion: GTO_POSTFLOP_SOLVER_VERSION,
      },
      update: { solution: snapshot as unknown as object, solverVersion: GTO_POSTFLOP_SOLVER_VERSION },
    });
  } catch {
    // サンドボックス/DB不達: 永続化はスキップ(メモリキャッシュのみ)。
  }
}
