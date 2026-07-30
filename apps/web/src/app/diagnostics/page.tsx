"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { APP_VERSION } from "@/lib/version";

/**
 * 動作が重い・固まるときに「どこが原因か」をその場で数値で見るための診断ページ。
 *
 * 見るべき順番:
 *  1. イベントループ遅延(loop) — ここが数百ms以上なら、その瞬間サーバーは固まっている。
 *     原因はCPU飽和(VMが小さい)か、同期処理でループを塞いでいるか。
 *  2. メモリ(rss) — VM上限(512MB)に近いならGCで固まる。増強が必要。
 *  3. DB応答(db) — ここだけ遅いならDB側の詰まり。
 *  4. 遅いリクエスト一覧 — 特定のAPIだけ遅いなら、そのAPIの処理が原因。
 *  5. この端末からの実測レイテンシ — サーバーは速いのにここが遅いなら経路/端末側。
 */

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

interface Snapshot {
  uptimeSec: number;
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
  eventLoop: { meanMs: number; maxMs: number; p99Ms: number; peakSinceLogMs: number };
  db: { pingMs: number | null };
  counters: { requests: number; slowRequests: number; errors: number };
  slowRequests: { path: string; method: string; status: number; durationMs: number; at: string }[];
  errors: { scope: string; message: string; at: string }[];
  runtime: { node: string; cpus: number; region: string | null };
  sockets: number;
}

interface Probe {
  label: string;
  path: string;
  ms: number | null;
  status: number | string;
}

/** 実測するエンドポイント。認証不要のものだけを並べ、素の応答速度を測る。 */
const PROBES: { label: string; path: string }[] = [
  { label: "ヘルスチェック", path: "/health" },
  { label: "ライブ状況", path: "/api/lobby/live" },
  { label: "リーダーボード", path: "/api/lobby/leaderboards" },
];

function Row({ label, value, warn = false, hint }: { label: string; value: string; warn?: boolean; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink-200 py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[12px] font-bold text-ink-700">{label}</p>
        {hint && <p className="mt-0.5 text-[11px] leading-snug text-ink-500">{hint}</p>}
      </div>
      <p className={`shrink-0 text-[15px] font-black tabular-nums ${warn ? "text-crimson-500" : "text-ink-950"}`}>{value}</p>
    </div>
  );
}

export default function DiagnosticsPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchMs, setFetchMs] = useState<number | null>(null);
  const [probes, setProbes] = useState<Probe[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const started = performance.now();
    try {
      const res = await fetch(`${SERVER_URL}/api/diagnostics`, { cache: "no-store" });
      setFetchMs(Math.round(performance.now() - started));
      if (!res.ok) {
        setFetchError(`サーバーが ${res.status} ${res.statusText} を返しました`);
        setSnapshot(null);
      } else {
        setSnapshot((await res.json()) as Snapshot);
      }
    } catch (err) {
      setFetchMs(Math.round(performance.now() - started));
      setFetchError(
        `サーバーに接続できません: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}（接続先 ${SERVER_URL}）`,
      );
      setSnapshot(null);
    } finally {
      setLoading(false);
    }

    // この端末からの実測レイテンシ。サーバー内部の数値と突き合わせて経路の遅さを切り分ける。
    const results: Probe[] = [];
    for (const probe of PROBES) {
      const t0 = performance.now();
      try {
        const res = await fetch(`${SERVER_URL}${probe.path}`, { cache: "no-store" });
        results.push({ ...probe, ms: Math.round(performance.now() - t0), status: res.status });
      } catch (err) {
        results.push({
          ...probe,
          ms: Math.round(performance.now() - t0),
          status: err instanceof Error ? err.name : "失敗",
        });
      }
    }
    setProbes(results);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loopWarn = (snapshot?.eventLoop.p99Ms ?? 0) > 200 || (snapshot?.eventLoop.peakSinceLogMs ?? 0) > 500;
  const memWarn = (snapshot?.memory.rssMb ?? 0) > 400;
  const dbWarn = snapshot?.db.pingMs === null || (snapshot?.db.pingMs ?? 0) > 300;

  return (
    <div className="min-h-screen bg-ink-50 text-ink-950">
      <div className="mx-auto w-full max-w-2xl px-5 pb-16 pt-[calc(env(safe-area-inset-top)+24px)]">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-gold-500" />
          <span className="text-[13px] font-extrabold uppercase tracking-[0.22em]">Poker ART</span>
        </div>
        <h1 className="mt-5 text-[30px] font-black leading-tight tracking-tight">
          動作診断<span className="text-gold-500">.</span>
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-600">
          「重い・固まる」の原因を切り分けるための実測値です。上から順に見て、赤い数値がある箇所が原因です。
        </p>

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="rounded-xl bg-ink-950 px-4 py-2.5 text-[13px] font-black text-white disabled:opacity-50"
          >
            {loading ? "測定中…" : "再測定"}
          </button>
          <Link href="/" className="rounded-xl border border-ink-950 bg-white px-4 py-2.5 text-[13px] font-black">
            アプリへ戻る
          </Link>
        </div>

        {fetchError && (
          <div className="mt-4 rounded-2xl border border-crimson-500 bg-crimson-500/10 p-4">
            <p className="text-[13px] font-black text-crimson-500">サーバーの診断値が取得できません</p>
            <p className="mt-1 break-words text-[12px] leading-relaxed text-ink-700">{fetchError}</p>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
              これ自体が原因の可能性があります（サーバーが落ちている / 起動中 / ネットワーク遮断）。
              下の「この端末からの実測」も合わせて確認してください。
            </p>
          </div>
        )}

        {snapshot && (
          <>
            <section className="mt-5 rounded-2xl border border-ink-200 bg-white p-4">
              <h2 className="text-[11px] font-black uppercase tracking-[0.22em] text-ink-400">サーバーの状態</h2>
              <div className="mt-2">
                <Row
                  label="イベントループ遅延 (p99)"
                  value={`${snapshot.eventLoop.p99Ms} ms`}
                  warn={loopWarn}
                  hint="数百msを超えるとその瞬間サーバーは固まっています。CPU不足か同期処理の詰まり。"
                />
                <Row label="イベントループ遅延 (直近ピーク)" value={`${snapshot.eventLoop.peakSinceLogMs} ms`} warn={loopWarn} />
                <Row
                  label="メモリ (RSS)"
                  value={`${snapshot.memory.rssMb} MB`}
                  warn={memWarn}
                  hint="VMの上限に近いとGCで固まります。上限512MBなら400MB超で危険域。"
                />
                <Row label="ヒープ使用" value={`${snapshot.memory.heapUsedMb} / ${snapshot.memory.heapTotalMb} MB`} />
                <Row
                  label="DB応答"
                  value={snapshot.db.pingMs === null ? "失敗" : `${snapshot.db.pingMs} ms`}
                  warn={dbWarn}
                  hint="ここだけ遅い場合はDB側の詰まり（接続枯渇・クエリ重い）。"
                />
                <Row label="CPUコア数" value={`${snapshot.runtime.cpus}`} hint="1ならVMは最小構成。増強の余地があります。" />
                <Row label="同時接続ソケット" value={`${snapshot.sockets}`} />
                <Row label="稼働時間" value={`${Math.floor(snapshot.uptimeSec / 60)} 分`} hint="短いなら再起動を繰り返している可能性。" />
                <Row
                  label="リクエスト / 遅い / エラー"
                  value={`${snapshot.counters.requests} / ${snapshot.counters.slowRequests} / ${snapshot.counters.errors}`}
                  warn={snapshot.counters.errors > 0}
                />
                <Row label="リージョン / Node" value={`${snapshot.runtime.region ?? "-"} / ${snapshot.runtime.node}`} />
              </div>
            </section>

            <section className="mt-4 rounded-2xl border border-ink-200 bg-white p-4">
              <h2 className="text-[11px] font-black uppercase tracking-[0.22em] text-ink-400">遅いリクエスト（1秒超）</h2>
              {snapshot.slowRequests.length === 0 ? (
                <p className="mt-2 text-[12px] text-ink-500">記録なし。APIの個別の重さは原因ではありません。</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {snapshot.slowRequests.map((r, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3 text-[12px]">
                      <span className="min-w-0 truncate font-mono text-ink-700">
                        {r.method} {r.path} <span className="text-ink-400">({r.status})</span>
                      </span>
                      <span className="shrink-0 font-black tabular-nums text-crimson-500">{r.durationMs} ms</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-4 rounded-2xl border border-ink-200 bg-white p-4">
              <h2 className="text-[11px] font-black uppercase tracking-[0.22em] text-ink-400">直近のエラー</h2>
              {snapshot.errors.length === 0 ? (
                <p className="mt-2 text-[12px] text-ink-500">記録なし。</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {snapshot.errors.map((e, i) => (
                    <li key={i} className="rounded-xl bg-ink-50 p-2.5">
                      <p className="text-[11px] font-black text-ink-700">{e.scope}</p>
                      <p className="mt-0.5 break-words font-mono text-[11px] leading-snug text-crimson-500">{e.message}</p>
                      <p className="mt-0.5 text-[10px] text-ink-400">{e.at}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        <section className="mt-4 rounded-2xl border border-ink-200 bg-white p-4">
          <h2 className="text-[11px] font-black uppercase tracking-[0.22em] text-ink-400">この端末からの実測</h2>
          <div className="mt-2">
            {fetchMs !== null && <Row label="診断API（往復）" value={`${fetchMs} ms`} warn={fetchMs > 1500} />}
            {probes.map((p) => (
              <Row
                key={p.path}
                label={`${p.label}`}
                value={p.ms === null ? "-" : `${p.ms} ms（${p.status}）`}
                warn={typeof p.ms === "number" && p.ms > 1500}
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
            サーバー内部の数値が正常なのにここが遅い場合は、経路（回線・プロキシ）か端末側が原因です。
          </p>
        </section>

        <p className="mt-6 text-center text-[11px] tracking-wide text-ink-400">
          Poker ART v{APP_VERSION} ・ 接続先 {SERVER_URL}
        </p>
      </div>
    </div>
  );
}
