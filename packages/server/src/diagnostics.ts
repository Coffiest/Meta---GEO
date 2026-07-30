import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";
import { prisma } from "@meta-geo/db";

/**
 * サーバーの重さの原因を「数値で」特定するための計測基盤。
 *
 * 体感の「重い・フリーズする」は、原因がどれなのかを分けないと手が打てない:
 *  - CPU飽和 / 同期ブロック  → イベントループ遅延(loopDelay)が跳ねる
 *  - メモリ不足              → rss がVM上限に張り付き、GCで固まる
 *  - DBの詰まり              → dbPing が伸びる / DB待ちのリクエストだけ遅い
 *  - 特定APIの重さ           → slowRequests にそのパスが並ぶ
 * これらを常時記録し、/api/diagnostics と定期ログの両方から読めるようにする。
 */

/** これを超えたリクエストは「遅い」として記録・警告する。 */
const SLOW_REQUEST_MS = 1000;
/** これを超えるイベントループ遅延は、その瞬間フリーズしているのと同じ。 */
const LOOP_DELAY_WARN_MS = 200;
/** 直近の記録を保持する件数(リングバッファ)。 */
const RECENT_LIMIT = 40;
/** 定期メトリクスログの間隔。 */
const METRICS_LOG_INTERVAL_MS = 60_000;

export interface SlowRequestRecord {
  path: string;
  method: string;
  status: number;
  durationMs: number;
  at: string;
}

export interface ErrorRecord {
  scope: string;
  message: string;
  at: string;
}

let histogram: IntervalHistogram | null = null;
const slowRequests: SlowRequestRecord[] = [];
const errors: ErrorRecord[] = [];
let requestCount = 0;
let slowRequestCount = 0;
let errorCount = 0;
/** 直近に観測したイベントループ遅延の最大値(ログ出力ごとにリセット)。 */
let peakLoopDelayMs = 0;
const startedAt = Date.now();

function push<T>(buffer: T[], record: T): void {
  buffer.push(record);
  if (buffer.length > RECENT_LIMIT) buffer.shift();
}

/** イベントループ遅延の監視と、定期メトリクスログを開始する。 */
export function startDiagnostics(): void {
  histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();

  // 1秒ごとに遅延を覗き、しきい値を超えたらその場で警告する(フリーズの瞬間を捉えるため)。
  setInterval(() => {
    if (!histogram) return;
    const maxMs = histogram.max / 1e6;
    if (maxMs > peakLoopDelayMs) peakLoopDelayMs = maxMs;
    if (maxMs > LOOP_DELAY_WARN_MS) {
      console.warn(
        `[diag] event loop stalled: max=${maxMs.toFixed(0)}ms mean=${(histogram.mean / 1e6).toFixed(1)}ms ` +
          `(CPUが飽和しているか、同期処理でループを塞いでいます)`,
      );
      histogram.reset();
    }
  }, 1000).unref?.();

  setInterval(() => {
    void logMetrics();
  }, METRICS_LOG_INTERVAL_MS).unref?.();
}

/** HTTPリクエスト1件の処理時間を記録する。遅いものは警告ログも出す。 */
export function recordRequest(method: string, path: string, status: number, durationMs: number): void {
  requestCount += 1;
  if (durationMs < SLOW_REQUEST_MS) return;
  slowRequestCount += 1;
  const record: SlowRequestRecord = {
    path,
    method,
    status,
    durationMs: Math.round(durationMs),
    at: new Date().toISOString(),
  };
  push(slowRequests, record);
  console.warn(`[diag] slow request: ${method} ${path} ${status} ${record.durationMs}ms`);
}

/** 想定外のエラーを、原因追跡できる形で記録する。 */
export function recordError(scope: string, error: unknown): void {
  errorCount += 1;
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  push(errors, { scope, message, at: new Date().toISOString() });
  console.error(`[diag] error in ${scope}: ${message}`);
}

/** DBの応答時間(ms)。DBが詰まっているかどうかの直接指標。失敗時はnull。 */
async function measureDbPing(): Promise<number | null> {
  const started = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Math.round(performance.now() - started);
  } catch (err) {
    recordError("dbPing", err);
    return null;
  }
}

export interface DiagnosticsSnapshot {
  uptimeSec: number;
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
  eventLoop: { meanMs: number; maxMs: number; p99Ms: number; peakSinceLogMs: number };
  db: { pingMs: number | null };
  counters: { requests: number; slowRequests: number; errors: number };
  slowRequests: SlowRequestRecord[];
  errors: ErrorRecord[];
  /** 実行環境の情報(VMの増強が効いているかの確認用)。 */
  runtime: { node: string; cpus: number; region: string | null };
}

/** 現在のメトリクスを1つのスナップショットとして返す。 */
export async function getDiagnostics(): Promise<DiagnosticsSnapshot> {
  const mem = process.memoryUsage();
  const toMb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;
  const h = histogram;
  const os = await import("node:os");

  return {
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    memory: { rssMb: toMb(mem.rss), heapUsedMb: toMb(mem.heapUsed), heapTotalMb: toMb(mem.heapTotal) },
    eventLoop: {
      meanMs: h ? Math.round((h.mean / 1e6) * 10) / 10 : 0,
      maxMs: h ? Math.round(h.max / 1e6) : 0,
      p99Ms: h ? Math.round(h.percentile(99) / 1e6) : 0,
      peakSinceLogMs: Math.round(peakLoopDelayMs),
    },
    db: { pingMs: await measureDbPing() },
    counters: { requests: requestCount, slowRequests: slowRequestCount, errors: errorCount },
    slowRequests: [...slowRequests].reverse(),
    errors: [...errors].reverse(),
    runtime: {
      node: process.version,
      cpus: os.cpus().length,
      region: process.env["FLY_REGION"] ?? null,
    },
  };
}

/** 定期ログ。Fly.io のログ(flyctl logs)から時系列で追えるようにする。 */
async function logMetrics(): Promise<void> {
  const snap = await getDiagnostics();
  console.log(
    `[diag] uptime=${snap.uptimeSec}s rss=${snap.memory.rssMb}MB heap=${snap.memory.heapUsedMb}/${snap.memory.heapTotalMb}MB ` +
      `loop(mean=${snap.eventLoop.meanMs}ms p99=${snap.eventLoop.p99Ms}ms peak=${snap.eventLoop.peakSinceLogMs}ms) ` +
      `db=${snap.db.pingMs ?? "fail"}ms req=${snap.counters.requests} slow=${snap.counters.slowRequests} err=${snap.counters.errors} ` +
      `cpus=${snap.runtime.cpus}`,
  );
  peakLoopDelayMs = 0;
}
