"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { adminHeaders } from "@/lib/adminApi";

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

interface FeedbackItem {
  id: string;
  createdAt: string;
  kind: string;
  body: string;
  appVersion: string | null;
  userAgent: string | null;
  readAt: string | null;
  user: { id: string; displayName: string; email: string | null };
  images: { id: string; mime: string; bytes: number }[];
}

const KIND_LABEL: Record<string, string> = { request: "要望", bug: "不具合", other: "その他", shareX: "Xシェア" };

function fmt(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 写真1枚。パスコードのヘッダーが要るので fetch で取り、Blob の URL で出す。 */
function FeedbackPhoto({ id, passcode, accessToken }: { id: string; passcode: string; accessToken: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [big, setBig] = useState(false);
  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    void fetch(`${SERVER_URL}/api/admin/feedback-image?id=${encodeURIComponent(id)}`, {
      headers: adminHeaders(passcode, accessToken),
    })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (!b || cancelled) return;
        revoked = URL.createObjectURL(b);
        setUrl(revoked);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [id, passcode, accessToken]);
  if (!url) return <div className="h-20 w-20 animate-pulse rounded-lg bg-surface-2" />;
  return (
    <>
      <button type="button" onClick={() => setBig(true)} className="pressable h-20 w-20 overflow-hidden rounded-lg border border-line">
        {/* eslint-disable-next-line @next/next/no-img-element -- Blob の URL */}
        <img src={url} alt="" className="h-full w-full object-cover" />
      </button>
      {big && (
        <button type="button" onClick={() => setBig(false)} className="fixed inset-0 z-[95] flex items-center justify-center bg-black/90 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- Blob の URL */}
          <img src={url} alt="" className="max-h-full max-w-full object-contain" />
        </button>
      )}
    </>
  );
}

/**
 * 管理者画面の「ご意見」。ホームのご意見フォームから届いた要望・不具合・その他を新しい順に並べる。
 * 既読にすると「未読のみ」から消える。
 */
export function FeedbackInbox({ passcode, accessToken }: { passcode: string; accessToken: string | null }) {
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(true);
  const [open, setOpen] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetch(`${SERVER_URL}/api/admin/feedback${unreadOnly ? "?unread=1" : ""}`, {
        headers: adminHeaders(passcode, accessToken),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { items: FeedbackItem[]; unread: number };
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      setError(true);
    }
  }, [passcode, accessToken, unreadOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(id: string, read: boolean) {
    await fetch(`${SERVER_URL}/api/admin/feedback-read`, {
      method: "POST",
      headers: { "content-type": "application/json", ...adminHeaders(passcode, accessToken) },
      body: JSON.stringify({ id, read }),
    }).catch(() => {});
    void load();
  }

  return (
    <div className="mb-4 rounded-[20px] bg-surface p-4 shadow-e1">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 text-left">
        <Icon name="chat" className="h-4 w-4 shrink-0 text-accent" />
        <span className="flex-1 text-[13px] font-black text-fg">ご意見</span>
        {unread > 0 && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-black tabular-nums text-on-accent">未読 {unread}</span>
        )}
        <Icon name="chevron-down" className={`h-4 w-4 text-fg-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3">
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setUnreadOnly(true)}
              className={`pressable rounded-full px-3 py-1 text-[11px] font-bold ${unreadOnly ? "bg-accent/15 text-accent ring-1 ring-accent" : "bg-surface-2 text-fg-2"}`}
            >
              未読のみ
            </button>
            <button
              type="button"
              onClick={() => setUnreadOnly(false)}
              className={`pressable rounded-full px-3 py-1 text-[11px] font-bold ${!unreadOnly ? "bg-accent/15 text-accent ring-1 ring-accent" : "bg-surface-2 text-fg-2"}`}
            >
              すべて
            </button>
            <button type="button" onClick={() => void load()} className="pressable ml-auto text-fg-3" aria-label="再読み込み">
              <Icon name="refresh" className="h-4 w-4" />
            </button>
          </div>

          {error && <p className="text-[11px] text-crimson-300">読み込めませんでした。</p>}
          {items && items.length === 0 && <p className="py-3 text-center text-[11px] text-fg-3">届いているものはありません。</p>}
          <div className="space-y-2.5 lg:grid lg:grid-cols-2 lg:gap-2.5 lg:space-y-0">
            {items?.map((f) => (
              <div key={f.id} className={`rounded-lg border p-3 ${f.readAt ? "border-line opacity-70" : "border-accent/40"}`}>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-black text-fg-2">{KIND_LABEL[f.kind] ?? f.kind}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-fg">{f.user.displayName}</span>
                  <span className="text-[10px] tabular-nums text-fg-3">{fmt(f.createdAt)}</span>
                </div>
                {f.body && <p className="mt-2 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-fg">{f.body}</p>}
                {f.images.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    {f.images.map((img) => (
                      <FeedbackPhoto key={img.id} id={img.id} passcode={passcode} accessToken={accessToken} />
                    ))}
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2 text-[10px] text-fg-3">
                  <span className="min-w-0 flex-1 truncate">
                    v{f.appVersion ?? "?"} · {f.user.email ?? f.user.id.slice(0, 8)}
                  </span>
                  {f.kind === "shareX" && (
                    <GrantGoldButton
                      userId={f.user.id}
                      passcode={passcode}
                      accessToken={accessToken}
                      onDone={() => void markRead(f.id, true)}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => void markRead(f.id, !f.readAt)}
                    className="pressable rounded-full border border-line px-2.5 py-1 font-bold text-fg-2"
                  >
                    {f.readAt ? "未読に戻す" : "既読にする"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 「Xでシェアしてゴールド GET」の申請に、ゴールドプラン1週間を付与する(オーナーが投稿を目で確認してから押す)。
 * 付与は管理者の無料付与(`/api/admin/grant`)と同じ。付与したら既読にする。
 */
function GrantGoldButton({
  userId,
  passcode,
  accessToken,
  onDone,
}: {
  userId: string;
  passcode: string;
  accessToken: string | null;
  onDone: () => void;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  async function grant() {
    if (!window.confirm("この申請者にゴールドプラン1週間を付与しますか?")) return;
    setState("busy");
    try {
      const r = await fetch(`${SERVER_URL}/api/admin/grant`, {
        method: "POST",
        headers: { "content-type": "application/json", ...adminHeaders(passcode, accessToken) },
        body: JSON.stringify({ userId, unit: "week", amount: 1, plan: "gold" }),
      });
      setState(r.ok ? "done" : "error");
      if (r.ok) onDone();
    } catch {
      setState("error");
    }
  }
  return (
    <button
      type="button"
      onClick={() => void grant()}
      disabled={state === "busy" || state === "done"}
      className="pressable rounded-full bg-accent/15 px-2.5 py-1 font-bold text-accent ring-1 ring-accent disabled:opacity-50"
    >
      {state === "done" ? "付与済み" : state === "error" ? "失敗(再試行)" : "ゴールド1週間を付与"}
    </button>
  );
}
