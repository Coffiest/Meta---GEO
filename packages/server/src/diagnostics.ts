import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";
import { cpus, loadavg } from "node:os";
import { prisma } from "@meta-geo/db";
import { getAuthStats, type AuthStats } from "./auth.js";

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
/**
 * 直近1分間のイベントループ遅延の最大値(定期ログのたびにリセットする短期指標)。
 *
 * ヒストグラム自体はリセットしない —— 以前は警告を出すたびに reset() していたため、
 * 報告される max は「直前の1秒間の最大」に縮み、実際には十数秒固まっていても
 * 数百ms〜2秒程度に見えてしまい、重さの規模を過小評価していた。
 * 起動からの通算最大は histogram.max(= eventLoop.maxMs)で見る。
 */
let recentPeakLoopDelayMs = 0;
/** 前回警告した時刻。1秒ごとの監視でログが溢れないよう間隔を空ける。 */
let lastLoopWarnAt = 0;
/** CPU使用率の算出に使う前回サンプル。 */
let lastCpuSample = { at: Date.now(), usage: process.cpuUsage() };
let cpuPercent = 0;
const startedAt = Date.now();

/** イベントループ遅延の実測(ヒストグラムに頼らず、いま詰まっているかを直接測る)。 */
function measureLoopDelay(): Promise<number> {
  return new Promise((resolve) => {
    const started = performance.now();
    setTimeout(() => resolve(Math.max(0, performance.now() - started)), 0);
  });
}

function push<T>(buffer: T[], record: T): void {
  buffer.push(record);
  if (buffer.length > RECENT_LIMIT) buffer.shift();
}

/** イベントループ遅延の監視と、定期メトリクスログを開始する。 */
export function startDiagnostics(): void {
  histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();

  // 1秒ごとに遅延を覗き、しきい値を超えたらその場で警告する(フリーズの瞬間を捉えるため)。
  // ヒストグラムはリセットしない。代わりに警告ログの間隔だけを空ける。
  setInterval(() => {
    if (!histogram) return;
    const maxMs = histogram.max / 1e6;
    if (maxMs > recentPeakLoopDelayMs) recentPeakLoopDelayMs = maxMs;
    const now = Date.now();
    if (maxMs > LOOP_DELAY_WARN_MS && now - lastLoopWarnAt > 10_000) {
      lastLoopWarnAt = now;
      console.warn(
        `[diag] event loop stalled: max=${maxMs.toFixed(0)}ms mean=${(histogram.mean / 1e6).toFixed(1)}ms ` +
          `cpu=${cpuPercent}% (CPUが飽和しているか、同期処理でループを塞いでいます)`,
      );
    }
  }, 1000).unref?.();

  // CPU使用率。共有CPUのVMでは、ここが100%付近に張り付いているとスロットリングで固まる。
  setInterval(() => {
    const now = Date.now();
    const usage = process.cpuUsage();
    const elapsedMs = now - lastCpuSample.at;
    if (elapsedMs > 0) {
      const usedMs = (usage.user - lastCpuSample.usage.user + usage.system - lastCpuSample.usage.system) / 1000;
      // コア数で割って「VM全体に対する使用率」にする。
      cpuPercent = Math.round((usedMs / elapsedMs / Math.max(1, cpus().length)) * 100);
    }
    lastCpuSample = { at: now, usage };
  }, 5000).unref?.();

  setInterval(() => {
    void logMetrics();
  }, METRICS_LOG_INTERVAL_MS).unref?.();
}

/** DB接続のキープアライブ間隔。Supabaseのpoolerが待機中の接続を切る前に触りに行く。 */
const DB_KEEPALIVE_INTERVAL_MS = 30_000;

/**
 * DB接続を起動時に張り、その後は定期的に触って温めておく。
 *
 * 接続が冷えていると最初のクエリがTCP+TLS+認証のやり直しを丸ごと負担するため、
 * ホーム画面を開いた最初の1本だけ1〜2秒かかる、という症状になる。
 * 「使う前に温めておく」ことでこの初回コストをユーザーのリクエストから外す。
 */
export function startDatabaseWarmup(): void {
  const ping = async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      // 接続できない状態そのものは記録しておく(起動直後は失敗しうるので警告に留める)。
      recordError("dbKeepalive", err);
    }
  };

  prisma
    .$connect()
    .then(ping)
    .then(() => console.log("[diag] database connection warmed up"))
    .catch((err) => recordError("dbWarmup", err));

  setInterval(() => void ping(), DB_KEEPALIVE_INTERVAL_MS).unref?.();
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

export interface DbPingResult {
  /** DBへの往復にかかった実時間(ms)。失敗時はnull。 */
  pingMs: number | null;
  /** その最中に観測したイベントループ遅延(ms)。 */
  loopDelayDuringPingMs: number;
  /** 実時間からループ遅延を差し引いた、DB自体の推定応答時間(ms)。 */
  estimatedDbMs: number | null;
}

/**
 * DBの応答時間を測る。
 *
 * 注意: `await` を挟んだ実時間はイベントループが詰まっていればその分だけ伸びる。
 * つまり「DB応答が遅い」ように見えても、実体はCPU飽和ということが起こる。
 * 原因を取り違えないよう、同時にループ遅延も測って差し引いた値を返す。
 */
async function measureDbPing(): Promise<DbPingResult> {
  const started = performance.now();
  const loopProbe = measureLoopDelay();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const pingMs = performance.now() - started;
    const loopDelayMs = await loopProbe;
    return {
      pingMs: Math.round(pingMs),
      loopDelayDuringPingMs: Math.round(loopDelayMs),
      estimatedDbMs: Math.max(0, Math.round(pingMs - loopDelayMs)),
    };
  } catch (err) {
    recordError("dbPing", err);
    return { pingMs: null, loopDelayDuringPingMs: Math.round(await loopProbe), estimatedDbMs: null };
  }
}

export interface DiagnosticsSnapshot {
  uptimeSec: number;
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
  eventLoop: { meanMs: number; maxMs: number; p99Ms: number; peakSinceLogMs: number; nowMs: number };
  db: DbPingResult;
  /** 認証トークン検証のコスト。remoteCalls が多く avgRemoteMs が大きいならここが主因。 */
  auth: AuthStats;
  cpu: { percent: number; load1: number };
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
  const db = await measureDbPing();

  return {
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    memory: { rssMb: toMb(mem.rss), heapUsedMb: toMb(mem.heapUsed), heapTotalMb: toMb(mem.heapTotal) },
    eventLoop: {
      meanMs: h ? Math.round((h.mean / 1e6) * 10) / 10 : 0,
      maxMs: h ? Math.round(h.max / 1e6) : 0,
      p99Ms: h ? Math.round(h.percentile(99) / 1e6) : 0,
      peakSinceLogMs: Math.round(recentPeakLoopDelayMs),
      nowMs: db.loopDelayDuringPingMs,
    },
    db,
    auth: getAuthStats(),
    cpu: { percent: cpuPercent, load1: Math.round((loadavg()[0] ?? 0) * 100) / 100 },
    counters: { requests: requestCount, slowRequests: slowRequestCount, errors: errorCount },
    slowRequests: [...slowRequests].reverse(),
    errors: [...errors].reverse(),
    runtime: {
      node: process.version,
      cpus: cpus().length,
      region: process.env["FLY_REGION"] ?? null,
    },
  };
}

/** 定期ログ。Fly.io のログ(flyctl logs)から時系列で追えるようにする。 */
async function logMetrics(): Promise<void> {
  const snap = await getDiagnostics();
  console.log(
    `[diag] uptime=${snap.uptimeSec}s rss=${snap.memory.rssMb}MB heap=${snap.memory.heapUsedMb}/${snap.memory.heapTotalMb}MB ` +
      `loop(mean=${snap.eventLoop.meanMs}ms p99=${snap.eventLoop.p99Ms}ms max=${snap.eventLoop.maxMs}ms peak1m=${snap.eventLoop.peakSinceLogMs}ms) ` +
      `cpu=${snap.cpu.percent}% load1=${snap.cpu.load1} ` +
      `db=${snap.db.pingMs ?? "fail"}ms(実質${snap.db.estimatedDbMs ?? "-"}ms) ` +
      `auth(calls=${snap.auth.calls} hit=${snap.auth.cacheHits} remote=${snap.auth.remoteCalls} avg=${snap.auth.avgRemoteMs ?? "-"}ms) ` +
      `req=${snap.counters.requests} slow=${snap.counters.slowRequests} err=${snap.counters.errors} ` +
      `cpus=${snap.runtime.cpus}`,
  );
  recentPeakLoopDelayMs = 0;
}
