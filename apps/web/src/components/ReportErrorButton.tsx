"use client";

import { useCallback, useState } from "react";
import { APP_VERSION } from "@/lib/version";

/**
 * エラー表示に必ず添える「運営に報告する」ボタン。
 *
 * 画面に出ている文言だけでは運営側が原因を特定できないため、押された時点で
 * 技術詳細(detail)と構造化コンテキスト(context)を一緒に送る。ユーザーには
 * 「押した / 送れた / 送れなかった」の3状態だけを見せ、余計な操作を求めない。
 *
 * 送信自体が失敗する状況(オフライン・サーバー停止)もあり得るので、その場合は
 * 失敗を明示したうえで、内容をクリップボードへコピーする代替手段を出す。
 */

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";
/** 送信の待ち上限。ここでも待たせ続けない。 */
const REPORT_TIMEOUT_MS = 10_000;

export interface ReportErrorButtonProps {
  /** 発生元の画面/機能。例: "geo" | "table" | "login"。集計のキーになる。 */
  scope: string;
  /** 画面に出ていたユーザー向けメッセージ。 */
  message: string;
  /** 技術詳細(1行)。エラー種別・エンドポイント・HTTPステータス・所要msなど。 */
  detail?: string | null;
  /** 追加の構造化コンテキスト(画面固有の状態、通信診断のスナップショット等)。 */
  context?: Record<string, unknown>;
  /** ログイン中なら添える(報告者の紐付け用)。未ログインでも報告はできる。 */
  accessToken?: string | undefined;
  /** 暗い背景(GEO/レビュー画面)向けの配色に切り替える。 */
  tone?: "light" | "dark";
  className?: string;
}

type SendState = "idle" | "sending" | "sent" | "failed";

/** 報告に必ず添える環境情報。どの版・どの画面・どの端末で起きたかを特定するため。 */
function collectEnvironment(): Record<string, unknown> {
  if (typeof window === "undefined") return { appVersion: APP_VERSION };
  return {
    appVersion: APP_VERSION,
    url: window.location.href,
    userAgent: navigator.userAgent,
    language: navigator.language,
    online: navigator.onLine,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    // 端末の時計とタイムゾーン(サーバーログとの突き合わせに使う)。
    clientTime: new Date().toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function ReportErrorButton({
  scope,
  message,
  detail,
  context,
  accessToken,
  tone = "light",
  className = "",
}: ReportErrorButtonProps) {
  const [state, setState] = useState<SendState>("idle");
  const [failReason, setFailReason] = useState<string | null>(null);

  const send = useCallback(async () => {
    if (state === "sending" || state === "sent") return;
    setState("sending");
    setFailReason(null);

    const env = collectEnvironment();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REPORT_TIMEOUT_MS);
    try {
      const res = await fetch(`${SERVER_URL}/api/error-report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          scope,
          message,
          detail: detail ?? null,
          context: { ...context, environment: env },
          appVersion: APP_VERSION,
          url: typeof window === "undefined" ? null : window.location.href,
          userAgent: typeof navigator === "undefined" ? null : navigator.userAgent,
          ...(accessToken ? { accessToken } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        let reason = `HTTP ${res.status}`;
        try {
          const parsed = JSON.parse(body) as { error?: unknown };
          if (typeof parsed.error === "string") reason = parsed.error;
        } catch {
          /* 本文が読めなければステータスだけ出す */
        }
        setFailReason(reason);
        setState("failed");
        return;
      }
      setState("sent");
    } catch (err) {
      setFailReason(
        controller.signal.aborted ? "送信がタイムアウトしました" : err instanceof Error ? err.message : String(err),
      );
      setState("failed");
    } finally {
      clearTimeout(timer);
    }
  }, [accessToken, context, detail, message, scope, state]);

  /** 送信できない環境向けの代替手段。同じ内容をそのまま貼り付けられる形でコピーする。 */
  const copyInstead = useCallback(() => {
    const text = [
      `scope: ${scope}`,
      `message: ${message}`,
      detail ? `detail: ${detail}` : null,
      `context: ${JSON.stringify({ ...context, environment: collectEnvironment() })}`,
    ]
      .filter(Boolean)
      .join("\n");
    void navigator.clipboard?.writeText(text);
  }, [context, detail, message, scope]);

  const dark = tone === "dark";
  const base = "rounded-full px-3.5 py-1.5 text-[11px] font-bold transition-colors active:translate-y-px";
  const idleClass = dark
    ? `${base} border border-navy-600 bg-navy-800 text-navy-100`
    : `${base} border border-ink-950 bg-ink-950 text-white`;
  const quietClass = dark ? `${base} border border-navy-700 text-navy-300` : `${base} border border-ink-300 text-ink-700`;

  if (state === "sent") {
    return (
      <p className={`text-[11px] font-bold ${dark ? "text-mint-300" : "text-mint-600"} ${className}`}>
        報告しました。ありがとうございます。
      </p>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button type="button" onClick={() => void send()} disabled={state === "sending"} className={idleClass}>
        {state === "sending" ? "送信中…" : state === "failed" ? "もう一度報告する" : "運営に報告する"}
      </button>
      {state === "failed" && (
        <>
          <button type="button" onClick={copyInstead} className={quietClass}>
            内容をコピー
          </button>
          <span className={`text-[10px] ${dark ? "text-navy-400" : "text-ink-600"}`}>
            送信できませんでした（{failReason ?? "原因不明"}）
          </span>
        </>
      )}
    </div>
  );
}
