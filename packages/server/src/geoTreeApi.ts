import type { IncomingMessage, ServerResponse } from "node:http";
import {
  getPreflopNode,
  getPostflopNode,
  buildPreflopGtoNode,
  STACK_BUCKETS,
  BUBBLE_STAGES,
  type StackBucket,
  type BubbleStage,
  type LineStep,
} from "@meta-geo/db";

/** プリフロップの行動順(UTGが最初)。GTOのRFIノード判定に使う。 */
const PREFLOP_ORDER = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

/**
 * GTOタブ用ノードを NodeResult 形へ変換する。v1はRFI(全員フォールドで回ってきた最初の開き手)のみ対応。
 * lineに非フォールドが含まれる(=フェイス)場合や、算出ポジションがGTOレンジ未整備の場合は
 * sampleSize=0(UIは「データ未整備」を表示)。
 */
function buildGtoNodeResult(line: LineStep[]) {
  const facedRaise = line.some((s) => s.bucket !== "fold");
  const heroPos = PREFLOP_ORDER[line.length] ?? "";
  if (facedRaise || heroPos === "" || heroPos === "BB") {
    return { node: { position: heroPos || null, sampleSize: 0, options: [], isGto: true }, matrix: { cells: [], totalSamples: 0 } };
  }
  const gto = buildPreflopGtoNode({ heroPos, line });
  if (gto.unsupported) {
    return { node: { position: heroPos, sampleSize: 0, options: [], isGto: true }, matrix: { cells: [], totalSamples: 0 } };
  }
  const total = gto.matrix.totalSamples;
  return {
    node: {
      position: gto.position,
      sampleSize: total,
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
      const line = parseLine(body["line"] ?? []);
      if (line === null) {
        sendJson(res, 400, { error: "invalid line" });
        return true;
      }
      sendJson(res, 200, buildGtoNodeResult(line));
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
