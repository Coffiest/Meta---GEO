"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { adminHeaders } from "@/lib/adminApi";

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";
/** 開いている間は30秒ごとに取り直す。 */
const REFRESH_MS = 30_000;

interface ActiveUser {
  userId: string;
  displayName: string;
  lastSeenAt: string | null;
  playing: "sng" | "mtt" | null;
}

interface Snapshot {
  activeCount: number;
  playingCount: number;
  last24hCount: number;
  users: ActiveUser[];
}

function ago(iso: string | null): string {
  if (!iso) return "-";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}秒前` : `${Math.floor(s / 60)}分前`;
}

/**
 * 管理者画面の「アクティブユーザー」。最後に見えてから5分以内か、卓で遊んでいる人の一覧と人数。
 * 記録はサーバーのメモリにだけあるので、サーバーの入れ替え直後は少なく出る。
 */
export function ActiveUsersPanel({ passcode, accessToken }: { passcode: string; accessToken: string | null }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/admin/active-users`, { headers: adminHeaders(passcode, accessToken) });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as Snapshot);
      setError(false);
    } catch {
      setError(true);
    }
  }, [passcode, accessToken]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="mb-4 rounded-[20px] bg-surface p-4 shadow-e1">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 text-left">
        <Icon name="user-plus" className="h-4 w-4 shrink-0 text-accent" />
        <span className="flex-1 text-[13px] font-black text-fg">アクティブユーザー</span>
        {data && (
          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-black tabular-nums text-accent">
            {data.activeCount}人
          </span>
        )}
        <Icon name="chevron-down" className={`h-4 w-4 text-fg-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3">
          {data && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "いまアクティブ", value: data.activeCount },
                { label: "卓で対局中", value: data.playingCount },
                { label: "24時間以内", value: data.last24hCount },
              ].map((m) => (
                <div key={m.label} className="rounded-lg bg-surface-2 px-2.5 py-2">
                  <p className="text-[9.5px] font-bold text-fg-3">{m.label}</p>
                  <p className="text-[18px] font-black tabular-nums text-fg">{m.value}</p>
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center justify-between text-[10px] text-fg-3">
            <span>5分以内に操作した人と、卓で遊んでいる人。30秒ごとに更新。</span>
            <button type="button" onClick={() => void load()} className="pressable text-fg-3" aria-label="再読み込み">
              <Icon name="refresh" className="h-4 w-4" />
            </button>
          </div>
          {error && <p className="mt-2 text-[11px] text-crimson-300">読み込めませんでした。</p>}
          {data && data.users.length === 0 && <p className="py-3 text-center text-[11px] text-fg-3">いまアクティブな人はいません。</p>}
          <ul className="mt-2 list-rows">
            {data?.users.map((u) => (
              <li key={u.userId} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-fg">{u.displayName}</span>
                <span className="shrink-0 text-[10.5px] font-bold text-fg-2">
                  {u.playing ? (u.playing === "mtt" ? "MTT 対局中" : "SNG 対局中") : "ロビー"}
                </span>
                <span className="w-14 shrink-0 text-right text-[10px] tabular-nums text-fg-3">{ago(u.lastSeenAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
