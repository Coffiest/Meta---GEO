"use client";

/**
 * クライアント側の異常をユーザーに見える形で拾い上げる仕組み。
 *
 * 「プレイ中に端末が熱くなる」「動かなくなる」といった不具合は、原因が
 * 画面に何も出ないまま起きるため報告が難しい。ここで拾った内容は
 * DiagnosticsToaster がトーストとして表示する。
 */

export type DiagnosticKind = "error" | "warn" | "info";

export interface DiagnosticEntry {
  id: number;
  kind: DiagnosticKind;
  /** 画面に出す短い文。技術用語は避け、何が起きたかだけを書く。 */
  message: string;
  /** 詳細(スタックなど)。トーストをタップしたときだけ展開する。 */
  detail?: string;
  at: number;
}

type Listener = (entries: DiagnosticEntry[]) => void;

const MAX_ENTRIES = 4;
/** 同一メッセージの連投を抑える間隔。 */
const DEDUPE_WINDOW_MS = 15_000;

let entries: DiagnosticEntry[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const lastSeenAt = new Map<string, number>();

function notify(): void {
  for (const l of listeners) l(entries);
}

/** 異常を1件記録する。同じ文面が短時間に繰り返された場合は捨てる。 */
export function reportDiagnostic(kind: DiagnosticKind, message: string, detail?: string): void {
  const now = Date.now();
  const seen = lastSeenAt.get(message);
  if (seen !== undefined && now - seen < DEDUPE_WINDOW_MS) return;
  lastSeenAt.set(message, now);
  entries = [...entries, { id: nextId++, kind, message, detail, at: now }].slice(-MAX_ENTRIES);
  notify();
}

export function dismissDiagnostic(id: number): void {
  entries = entries.filter((e) => e.id !== id);
  notify();
}

export function subscribeDiagnostics(listener: Listener): () => void {
  listeners.add(listener);
  listener(entries);
  return () => listeners.delete(listener);
}

let installed = false;

/**
 * グローバルなエラー捕捉と「描画が重い」検知を1度だけ仕込む。
 *
 * 重さの検知は longtask(50ms以上メインスレッドを占有したタスク)の合計時間で判定する。
 * 監視ウィンドウの半分以上をlongtaskで使っていれば、端末が発熱する水準の負荷とみなす。
 */
export function installDiagnostics(): () => void {
  if (installed || typeof window === "undefined") return () => {};
  installed = true;

  const onError = (event: ErrorEvent) => {
    reportDiagnostic("error", "画面の処理でエラーが発生しました。", `${event.message}\n${event.filename}:${event.lineno}`);
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const detail = reason instanceof Error ? `${reason.message}\n${reason.stack ?? ""}` : String(reason);
    reportDiagnostic("error", "通信または内部処理が失敗しました。", detail);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  const cleanups: (() => void)[] = [
    () => window.removeEventListener("error", onError),
    () => window.removeEventListener("unhandledrejection", onRejection),
  ];

  // メインスレッドの占有時間を監視して、発熱水準の負荷を検知する。
  const WINDOW_MS = 10_000;
  const BUSY_RATIO = 0.5;
  if (typeof PerformanceObserver === "function") {
    let busyMs = 0;
    let windowStart = performance.now();
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) busyMs += entry.duration;
        const elapsed = performance.now() - windowStart;
        if (elapsed >= WINDOW_MS) {
          if (busyMs / elapsed >= BUSY_RATIO) {
            reportDiagnostic(
              "warn",
              "端末に負荷がかかっています。発熱する場合は一度アプリを閉じ直してください。",
              `直近${Math.round(elapsed / 1000)}秒のうち${Math.round(busyMs)}msが重い処理でした。`,
            );
          }
          busyMs = 0;
          windowStart = performance.now();
        }
      });
      observer.observe({ entryTypes: ["longtask"] });
      cleanups.push(() => observer.disconnect());
    } catch {
      // longtaskに未対応のブラウザ(iOS Safariなど)。負荷検知だけ諦め、エラー捕捉は継続する。
    }
  }

  return () => {
    for (const c of cleanups) c();
    installed = false;
  };
}
