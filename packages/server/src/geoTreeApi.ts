import type { IncomingMessage, ServerResponse } from "node:http";
import {
  getPreflopNode,
  getPostflopNode,
  buildPreflopGtoNode,
  buildPushFoldGtoNode,
  buildPreflopNashNode,
  buildPreflopNashCallNode,
  buildPreflopBandNode,
  buildPreflopVsOpenNode,
  prepareGtoPostflopSpot,
  deserializeGtoPostflopSpot,
  gtoPostflopSpotKey,
  readGtoPostflopSnapshot,
  writeGtoPostflopSnapshot,
  type GtoPostflopSpotHandle,
  STACK_BUCKETS,
  BUBBLE_STAGES,
  type StackBucket,
  type BubbleStage,
  type LineStep,
} from "@meta-geo/db";

/** プリフロップの行動順(UTGが最初)。GTOのRFIノード判定に使う。 */
const PREFLOP_ORDER = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

/** スタックバケット → 転記レンジのバンド(GTOタブ)。 */
const BUCKET_TO_BAND: Record<string, string> = {
  "30+": "100",
  "20-30": "20",
  "15-20": "14",
  "10-15": "10",
  "5-10": "7",
  "0-5": "7",
};

/**
 * GTOポストフロップ(SRP)のスポットキャッシュ(2段: メモリ + DB永続層)。
 * key = spotKey(スート正規化込み。suit-isomorphicなボードは同一キーへ集約)。
 *
 * - メモリ命中: 即応答。
 * - DB命中(read-through): 事前計算/過去解を復元しメモリへ載せて即応答。
 * - ミス: バックグラウンドでCFR計算 → メモリ+DB(write-through)へ格納。初回は {solving:true}
 *   を即返しクライアントがポーリングする。
 * - null はサポート外スポットのネガティブキャッシュ(メモリのみ)。
 */
const gtoPostflopCache = new Map<string, GtoPostflopSpotHandle | null>();
const gtoPostflopInFlight = new Set<string>();
const GTO_POSTFLOP_CACHE_MAX = 48;

/** メモリキャッシュへLRU的に格納(最大件数超過で最古を退避)。 */
function setGtoPostflopMemory(key: string, handle: GtoPostflopSpotHandle | null): void {
  if (gtoPostflopCache.size >= GTO_POSTFLOP_CACHE_MAX) {
    const first = gtoPostflopCache.keys().next().value;
    if (first !== undefined) gtoPostflopCache.delete(first);
  }
  gtoPostflopCache.set(key, handle);
}

/**
 * GTOタブ用の開き(オープン/シューブ)ノードを NodeResult 形へ変換する。
 * 6-maxマルチウェイ・プッシュ/フォールドNash(BBアンティ・自社計算)を、全ポジション×全スタックで返す。
 * lineの通りにフォールドで手番を進めると各ポジション(UTG→…→SB)の開きレンジになる。
 * フェイス(非フォールドが含まれる)やBB・データ未整備は sampleSize=0(UIは「データ未整備」)。
 */
function buildGtoNodeResult(line: LineStep[], stackBucket: StackBucket) {
  const heroPos = PREFLOP_ORDER[line.length] ?? "";
  const nonFold = line.filter((s) => s.bucket !== "fold");
  const unsupported = { node: { position: heroPos || null, sampleSize: 0, options: [], isGto: true }, matrix: { cells: [], totalSamples: 0 } };
  if (heroPos === "") return unsupported;

  // 全員フォールドで回ってきた → そのポジションの開き(シューブ)レンジ。
  if (nonFold.length === 0) {
    if (heroPos === "BB") return unsupported; // BBは開かない
    const gto = buildPreflopNashNode({ heroPos, stackBucket });
    return gto.unsupported ? unsupported : toWireNode(gto);
  }

  // ちょうど1人がジャム → それに直面したコール(ディフェンス)レンジ。
  if (nonFold.length === 1 && nonFold[0]!.bucket === "allIn") {
    const gto = buildPreflopNashCallNode({ jammerPos: nonFold[0]!.position, callerPos: heroPos, stackBucket });
    return gto.unsupported ? unsupported : toWireNode(gto);
  }

  return unsupported;
}

/** GtoNodeResult をWire(NodeResult)形へ変換する。 */
function toWireNode(gto: ReturnType<typeof buildPreflopGtoNode>) {
  const total = gto.matrix.totalSamples;
  return {
    node: {
      position: gto.position,
      sampleSize: gto.unsupported ? 0 : total,
      isGto: true,
      options: gto.options.map((o) => ({
        bucket: o.bucket,
        count: Math.round(o.frequency * total),
        frequency: o.frequency,
        geometricRatio: o.geometricRatio,
        evBb: o.evBb,
      })),
    },
    matrix: {
      cells: gto.matrix.cells.map((row) => row.map((c) => ({ label: c.label, count: c.count, byBucket: c.byBucket }))),
      totalSamples: total,
    },
  };
}

/**
 * GEO DATABASE(GTO Wizard型シーケンシャル・アクションツリー)のREST API。
 * `/api/geo-tree/*` 配下を処理する。今回は無制限アクセスとして実装しており、
 * 認証・1日閲覧制限は付けていない(オーナー指示)。将来ここへ制限を追加する場合は、
 * `packages/server/src/auth.ts` の verifyAccessToken と
 * `@meta-geo/db` の checkAndIncrementDailyGeoView を、
 * packages/server/src/lobbyApi.ts の /api/lobby/bankroll-graph 等と同じパターンで
 * このハンドラーの先頭に差し込めばよい。
 */

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": process.env["WEB_ORIGIN"] ?? "*",
  });
  res.end(payload);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function isStackBucket(v: unknown): v is StackBucket {
  return typeof v === "string" && (STACK_BUCKETS as string[]).includes(v);
}

function isBubbleStage(v: unknown): v is BubbleStage {
  return typeof v === "string" && (BUBBLE_STAGES as string[]).includes(v);
}

/** 偏差値レンジ { min, max } をパースする。未指定/不正なら undefined(=フィルタなし)。
 * 全域(20〜80など)の場合もフィルタとして扱ってよいが、実害はないためそのまま渡す。 */
function parseRatingRange(v: unknown): { min: number; max: number } | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const { min, max } = v as Record<string, unknown>;
  if (typeof min !== "number" || typeof max !== "number" || Number.isNaN(min) || Number.isNaN(max)) return undefined;
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

function parseLine(v: unknown): LineStep[] | null {
  if (!Array.isArray(v)) return null;
  const line: LineStep[] = [];
  for (const step of v) {
    if (typeof step !== "object" || step === null) return null;
    const { position, bucket } = step as Record<string, unknown>;
    if (typeof position !== "string" || typeof bucket !== "string") return null;
    line.push({ position, bucket });
  }
  return line;
}

export async function handleGeoTreeApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/geo-tree/")) return false;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": process.env["WEB_ORIGIN"] ?? "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    res.end();
    return true;
  }

  try {
    if (url.pathname === "/api/geo-tree/preflop-node" && req.method === "POST") {
      const body = await readJsonBody(req);
      const stackBucket = body["stackBucket"];
      const bubbleStage = body["bubbleStage"] ?? "normal";
      const line = parseLine(body["line"] ?? []);
      if (!isStackBucket(stackBucket) || !isBubbleStage(bubbleStage) || line === null) {
        sendJson(res, 400, { error: "invalid stackBucket, bubbleStage, or line" });
        return true;
      }
      const ratingRange = parseRatingRange(body["ratingRange"]);
      sendJson(res, 200, await getPreflopNode({ stackBucket, bubbleStage, line, ratingRange }));
      return true;
    }

    if (url.pathname === "/api/geo-tree/gto-node" && req.method === "POST") {
      const body = await readJsonBody(req);
      // variant="full": 通常戦略(fold/open/jam混合, CFR)。lineのフォールドで手番を進める。
      if (body["variant"] === "full") {
        const line = parseLine(body["line"] ?? []);
        const sb = isStackBucket(body["stackBucket"]) ? body["stackBucket"] : "20-30";
        if (line === null) {
          sendJson(res, 400, { error: "invalid line" });
          return true;
        }
        const heroPos = PREFLOP_ORDER[line.length] ?? "";
        const nonFold = line.filter((s) => s.bucket !== "fold");
        const empty = { node: { position: heroPos || null, sampleSize: 0, options: [], isGto: true }, matrix: { cells: [], totalSamples: 0 } };
        if (heroPos === "") {
          sendJson(res, 200, empty);
          return true;
        }
        // 全員フォールドで回ってきた → そのポジションのオープン(バンド)。BBは開かない。
        if (nonFold.length === 0) {
          if (heroPos === "BB") {
            sendJson(res, 200, empty);
            return true;
          }
          const band = BUCKET_TO_BAND[sb] ?? "100";
          const gto = buildPreflopBandNode(band, heroPos);
          sendJson(res, 200, gto.unsupported ? empty : toWireNode(gto));
          return true;
        }

        // ちょうど1人がジャム(オールイン)に直面 → そのポジションの厳密Nashコール(ディフェンス)レンジ。
        if (nonFold.length === 1 && nonFold[0]!.bucket === "allIn") {
          const gto = buildPreflopNashCallNode({ jammerPos: nonFold[0]!.position, callerPos: heroPos, stackBucket: sb });
          sendJson(res, 200, gto.unsupported ? empty : toWireNode(gto));
          return true;
        }

        // ちょうど1人が(非オールインの)オープンレイズ → ディフェンス(fold/call/3bet/allin)ノード。
        // genPreflopVsOpen.ts が転記オープンレンジに対して解いた混合戦略(バンド: 100/20/14bb)。
        if (nonFold.length === 1) {
          const band = BUCKET_TO_BAND[sb] ?? "100";
          const gto = buildPreflopVsOpenNode(band, nonFold[0]!.position, heroPos);
          sendJson(res, 200, gto.unsupported ? empty : toWireNode(gto));
          return true;
        }

        // オープン+コール(スクイーズ)以降 = 未整備(後続ステージ)。
        sendJson(res, 200, empty);
        return true;
      }
      // variant="pushfold": HUプッシュ/フォールドNash(自社計算)。それ以外はRFI(6-maxオープンNash)。
      if (body["variant"] === "pushfold") {
        const stackBucket = body["stackBucket"];
        const side = body["side"] === "call" ? "call" : "jam";
        if (!isStackBucket(stackBucket)) {
          sendJson(res, 400, { error: "invalid stackBucket" });
          return true;
        }
        sendJson(res, 200, toWireNode(buildPushFoldGtoNode({ stackBucket, side })));
        return true;
      }
      const line = parseLine(body["line"] ?? []);
      const stackBucket = isStackBucket(body["stackBucket"]) ? body["stackBucket"] : "10-15";
      if (line === null) {
        sendJson(res, 400, { error: "invalid line" });
        return true;
      }
      sendJson(res, 200, buildGtoNodeResult(line, stackBucket));
      return true;
    }

    // GTOタブのポストフロップ(SRP: オープン→コール)ノード。CFRソルバーでオンデマンド計算+キャッシュ。
    // 初回は {solving:true} を即返し、クライアントがポーリングで再取得する。
    if (url.pathname === "/api/geo-tree/gto-postflop-node" && req.method === "POST") {
      const body = await readJsonBody(req);
      const sb = isStackBucket(body["stackBucket"]) ? body["stackBucket"] : "30+";
      const line = parseLine(body["line"] ?? []);
      const postflopLine = parseLine(body["postflopLine"] ?? []);
      const board = body["board"];
      if (line === null || postflopLine === null || !Array.isArray(board) || !board.every((c) => typeof c === "string")) {
        sendJson(res, 400, { error: "invalid request body" });
        return true;
      }
      const empty = { node: { position: null, sampleSize: 0, options: [], isGto: true }, matrix: { cells: [], totalSamples: 0 } };
      // ライン形状: 非フォールドが「レイズ(非オールイン)→コール」のSRPのみ対応。
      const nonFold = line.filter((s) => s.bucket !== "fold");
      if (nonFold.length !== 2 || nonFold[0]!.bucket === "allIn" || nonFold[0]!.bucket === "call" || nonFold[1]!.bucket !== "call") {
        sendJson(res, 200, empty);
        return true;
      }
      const opener = nonFold[0]!.position;
      const defender = nonFold[1]!.position;
      const band = BUCKET_TO_BAND[sb] ?? "100";
      const boardArr = board as string[];
      const key = gtoPostflopSpotKey(band, opener, defender, boardArr);

      // 1) メモリ命中(ネガティブキャッシュ含む)。
      const cached = gtoPostflopCache.get(key);
      if (cached !== undefined) {
        if (cached === null) {
          sendJson(res, 200, empty);
          return true;
        }
        const gto = cached.nodeFor(postflopLine.map((s) => s.bucket));
        sendJson(res, 200, gto.unsupported ? empty : toWireNode(gto));
        return true;
      }

      // 2) 計算中なら即ポーリング応答(重複DB読みを避ける)。
      if (gtoPostflopInFlight.has(key)) {
        sendJson(res, 200, { ...empty, solving: true });
        return true;
      }

      // 3) DB read-through(事前計算/過去解)。命中したら復元してメモリへ載せ即応答。
      const snap = await readGtoPostflopSnapshot(key);
      if (snap) {
        const handle = deserializeGtoPostflopSpot(snap);
        setGtoPostflopMemory(key, handle);
        const gto = handle.nodeFor(postflopLine.map((s) => s.bucket));
        sendJson(res, 200, gto.unsupported ? empty : toWireNode(gto));
        return true;
      }

      // 4) ミス: バックグラウンドでCFR計算 → メモリ+DB(write-through)。
      gtoPostflopInFlight.add(key);
      void prepareGtoPostflopSpot({ band, openerPos: opener, defenderPos: defender, board: boardArr })
        .then(async (handle) => {
          if (!handle || !handle.snapshot) {
            setGtoPostflopMemory(key, null);
            return;
          }
          const snapshot = handle.snapshot();
          setGtoPostflopMemory(key, deserializeGtoPostflopSpot(snapshot));
          await writeGtoPostflopSnapshot(band, opener, defender, boardArr, snapshot);
        })
        .catch((err) => {
          console.error("[geoTreeApi] gto postflop solve failed:", err);
          setGtoPostflopMemory(key, null);
        })
        .finally(() => gtoPostflopInFlight.delete(key));
      sendJson(res, 200, { ...empty, solving: true });
      return true;
    }

    if (url.pathname === "/api/geo-tree/postflop-node" && req.method === "POST") {
      const body = await readJsonBody(req);
      const stackBucket = body["stackBucket"];
      const bubbleStage = body["bubbleStage"] ?? "normal";
      const preflopLine = parseLine(body["preflopLine"] ?? []);
      const postflopLine = parseLine(body["postflopLine"] ?? []);
      const board = body["board"];
      const street = body["street"];
      if (
        !isStackBucket(stackBucket) ||
        !isBubbleStage(bubbleStage) ||
        preflopLine === null ||
        postflopLine === null ||
        !Array.isArray(board) ||
        !board.every((c) => typeof c === "string") ||
        (street !== "flop" && street !== "turn" && street !== "river")
      ) {
        sendJson(res, 400, { error: "invalid request body" });
        return true;
      }
      const ratingRange = parseRatingRange(body["ratingRange"]);
      sendJson(
        res,
        200,
        await getPostflopNode({ stackBucket, bubbleStage, preflopLine, board: board as string[], street, postflopLine, ratingRange }),
      );
      return true;
    }

    sendJson(res, 404, { error: "not found" });
    return true;
  } catch (err) {
    console.error("[geoTreeApi] request failed:", err);
    sendJson(res, 500, { error: "internal error" });
    return true;
  }
}
