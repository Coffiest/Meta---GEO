"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { adminHeaders } from "@/lib/adminApi";

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

interface Partner {
  id: string;
  name: string;
  contact: string | null;
  note: string | null;
  code: string;
  userId: string | null;
  active: boolean;
  createdAt: string;
}

const ERROR_TEXT: Record<string, string> = {
  name_required: "名前を入れてください。",
  invalid_code: "コードは英数字4〜20文字にしてください。",
  code_taken: "そのコードはすでに使われています。",
  user_not_found: "そのユーザーIDのアカウントが見つかりません。",
  subscriptions_unavailable: "Stripe に接続できません(サーバーにキーが未設定)。",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

const INPUT =
  "w-full rounded-lg border border-line px-2.5 py-2 text-[12px] text-fg placeholder:text-fg-3 focus:border-line-strong focus:outline-none";

/**
 * 管理者画面の「インフルエンサーのコード」。1人に1つ、決済画面で入れると初回30%OFFになるコードを発行する
 * (Stripe のプロモーションコード。有料会員になったことが無い人だけ)。誰に発行したかを台帳に残し、停止もできる。
 * 仕様は docs/HANDOFF_influencer_partner.md。
 */
export function PartnerPanel({ passcode, accessToken }: { passcode: string; accessToken: string | null }) {
  const [open, setOpen] = useState(false);
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [form, setForm] = useState({ name: "", contact: "", code: "", userId: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/admin/partners`, { headers: adminHeaders(passcode, accessToken) });
      if (!res.ok) throw new Error(String(res.status));
      setPartners(((await res.json()) as { partners: Partner[] }).partners);
    } catch {
      setMessage({ text: "一覧を読み込めませんでした。", ok: false });
    }
  }, [passcode, accessToken]);

  useEffect(() => {
    if (open && !partners) void load();
  }, [open, partners, load]);

  async function issue() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/admin/partners`, {
        method: "POST",
        headers: { ...adminHeaders(passcode, accessToken), "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = (await res.json().catch(() => ({}))) as { partner?: Partner; error?: string };
      if (!res.ok || !body.partner) {
        setMessage({ text: ERROR_TEXT[body.error ?? ""] ?? `発行できませんでした(${body.error ?? res.status})。`, ok: false });
        return;
      }
      setPartners((list) => [body.partner!, ...(list ?? [])]);
      setForm({ name: "", contact: "", code: "", userId: "", note: "" });
      setMessage({ text: `${body.partner.name} さんのコード ${body.partner.code} を発行しました。`, ok: true });
    } catch {
      setMessage({ text: "サーバーに接続できませんでした。", ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(p: Partner) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/admin/partners/active`, {
        method: "POST",
        headers: { ...adminHeaders(passcode, accessToken), "content-type": "application/json" },
        body: JSON.stringify({ id: p.id, active: !p.active }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setPartners((list) => (list ?? []).map((x) => (x.id === p.id ? { ...x, active: !p.active } : x)));
    } catch {
      setMessage({ text: "切り替えられませんでした。", ok: false });
    } finally {
      setBusy(false);
    }
  }

  function copy(code: string) {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500);
    });
  }

  const activeCount = partners?.filter((p) => p.active).length ?? 0;

  return (
    <div className="mb-4 rounded-xl border border-line p-3.5">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 text-left">
        <Icon name="ticket" className="h-4 w-4 shrink-0 text-accent" />
        <span className="flex-1 text-[13px] font-black text-fg">インフルエンサーのコード</span>
        {partners && (
          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-black tabular-nums text-accent">
            {activeCount}件
          </span>
        )}
        <Icon name="chevron-down" className={`h-4 w-4 text-fg-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3">
          <p className="text-[11px] leading-relaxed text-fg-3">
            決済画面で入れると初回の支払いが30%OFFになるコード。有料会員になったことが無い人だけが使えます。コードを省くと自動で作ります。
          </p>

          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="名前(必須)"
              className={INPUT}
            />
            <input
              value={form.contact}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
              placeholder="連絡先(@アカウントなど)"
              className={INPUT}
            />
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
              placeholder="コード(例 HIKARU30)"
              maxLength={20}
              className={`${INPUT} font-bold tracking-wider`}
            />
            <input
              value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value.trim() })}
              placeholder="本人のユーザーID(任意)"
              className={INPUT}
            />
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="メモ(任意)"
              className={`${INPUT} col-span-2`}
            />
          </div>
          <button
            type="button"
            onClick={() => void issue()}
            disabled={busy || !form.name.trim()}
            className="pressable mt-2 w-full rounded-lg bg-n-4 px-3 py-2.5 text-[12px] font-black text-fg disabled:opacity-40"
          >
            {busy ? "処理中…" : "コードを発行"}
          </button>
          {message && (
            <p className={`mt-2 text-[11px] font-bold ${message.ok ? "text-accent" : "text-crimson-300"}`}>{message.text}</p>
          )}

          <div className="mt-3">
            {partners?.length === 0 && <p className="text-[11px] text-fg-3">まだ発行していません。</p>}
            {partners?.map((p) => (
              <div key={p.id} className="flex items-center gap-2.5 border-t border-line py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-black text-fg">
                    {p.name}
                    {p.contact && <span className="ml-1.5 font-bold text-fg-3">{p.contact}</span>}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-fg-3">
                    <span className={`font-black tracking-wider ${p.active ? "text-fg" : "text-fg-3 line-through"}`}>{p.code}</span>
                    <span>・ {fmtDate(p.createdAt)}</span>
                    {p.userId && <span>・ 本人のアカウントあり</span>}
                  </p>
                  {p.note && <p className="mt-0.5 truncate text-[10.5px] text-fg-3">{p.note}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => copy(p.code)}
                  className="pressable shrink-0 rounded-lg p-2 text-fg-3"
                  aria-label="コードをコピー"
                >
                  <Icon name={copied === p.code ? "check" : "copy"} className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void toggle(p)}
                  disabled={busy}
                  className={`pressable shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-black disabled:opacity-40 ${
                    p.active ? "bg-surface-2 text-fg-2" : "bg-accent/15 text-accent"
                  }`}
                >
                  {p.active ? "停止" : "再開"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
