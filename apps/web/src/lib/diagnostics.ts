"use client";

/**
 * クライアント側の異常をユーザーに見える形で拾い上げる仕組み。
 *
 * 「プレイ中に端末が熱くなる」「動かなくなる」といった不具合は、原因が
 * 画面に何も出ないまま起きるため報告が難しい。ここで拾った内容は
 * DiagnosticsToaster がトーストとして表示する。
 *
 * ここに出すのは「読んだ人が次に何をすればいいか分かるもの」だけにする。
 * 以前は window の error / unhandledrejection を拾って
 * 「画面の処理でエラーが発生しました。」という赤いトーストを出していたが、これはやめた:
 *   - 文面から利用者が取れる行動が無い(スタックを見せられても困る)。
 *   - この仕組みの出力を読んでいるのは画面のトーストだけで、送信も保存もしていない。
 *     つまり利用者を驚かせるだけで、こちらの原因調査には何も残らなかった。
 *   - window の error は同一ページで走る第三者スクリプト(AdSense等)の例外も拾うため、
 *     アプリ自体は正常でも赤いトーストが出てしまっていた(利用者から報告のあった事象)。
 * 捕捉していない例外はブラウザのコンソールには従来どおり出るので、調査手段は失われない。
 * 利用者が対処できる異常には、それぞれ専用のUIが既にある(接続断の再同期バナーと
 * /diagnostics、GEO取得失敗の再試行カード、下の高負荷警告)。
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
 * 「描画が重い」検知を1度だけ仕込む。
 *
 * 重さの検知は longtask(50ms以上メインスレッドを占有したタスク)の合計時間で判定する。
 * 監視ウィンドウの半分以上をlongtaskで使っていれば、端末が発熱する水準の負荷とみなす。
 */
export function installDiagnostics(): () => void {
  if (installed || typeof window === "undefined") return () => {};
  installed = true;

  const cleanups: (() => void)[] = [];

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
      // longtaskに未対応のブラウザ(iOS Safariなど)。この端末では負荷検知だけ諦める。
    }
  }

  return () => {
    for (const c of cleanups) c();
    installed = false;
  };
}
