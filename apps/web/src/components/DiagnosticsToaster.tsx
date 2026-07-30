"use client";

import { useEffect, useState } from "react";
import {
  dismissDiagnostic,
  installDiagnostics,
  subscribeDiagnostics,
  type DiagnosticEntry,
} from "@/lib/diagnostics";

/** 種別ごとのアイコン(絵文字禁止のためSVGストローク)。 */
function KindIcon({ kind }: { kind: DiagnosticEntry["kind"] }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-4 w-4 shrink-0",
  };
  if (kind === "error") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5M12 16.2v.3" />
      </svg>
    );
  }
  if (kind === "warn") {
    return (
      <svg {...common}>
        <path d="M12 3.8 2.8 19.5h18.4L12 3.8Z" />
        <path d="M12 10v4M12 17.2v.3" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.6v.3" />
    </svg>
  );
}

/**
 * クライアントの異常(JSエラー・Promise拒否・メインスレッド過負荷)を、
 * 画面下部の控えめなトーストとしてこまめに表示する。
 * タップで詳細を開閉、もう一度タップで閉じる。
 */
export function DiagnosticsToaster() {
  const [entries, setEntries] = useState<DiagnosticEntry[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    const uninstall = installDiagnostics();
    const unsubscribe = subscribeDiagnostics(setEntries);
    return () => {
      unsubscribe();
      uninstall();
    };
  }, []);

  if (entries.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+12px)] z-[70] flex flex-col items-center gap-1.5 px-3">
      {entries.map((e) => {
        const tone =
          e.kind === "error"
            ? "border-crimson-500 text-crimson-600"
            : e.kind === "warn"
              ? "border-gold-600 text-gold-700"
              : "border-ink-950 text-ink-800";
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => (openId === e.id ? dismissDiagnostic(e.id) : setOpenId(e.id))}
            className={`pointer-events-auto w-full max-w-md rounded-xl border bg-white px-3 py-2 text-left ${tone}`}
          >
            <div className="flex items-center gap-2">
              <KindIcon kind={e.kind} />
              <span className="min-w-0 flex-1 text-[12px] font-bold leading-snug">{e.message}</span>
              <span className="shrink-0 text-[10px] font-semibold text-ink-400">
                {openId === e.id ? "閉じる" : "詳細"}
              </span>
            </div>
            {openId === e.id && e.detail && (
              <p className="mt-1.5 whitespace-pre-wrap break-all text-[10px] font-medium leading-snug text-ink-500">
                {e.detail}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
