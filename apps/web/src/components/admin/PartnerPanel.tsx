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
  /** 本人の明細ページの鍵(/partner/<鍵>)。 */
  statementToken: string;
  userId: string | null;
  active: boolean;
  createdAt: string;
  /** 報酬の残高(円)。accruing = 今月分(来月末に払う)/ payable = 締めた月の未払い(¥3,000 以上で今月末に払う)。 */
  balance: { referrals: number; accruing: number; payable: number; paidTotal: number };
}

const MIN_PAYOUT = 3000;

/** Stripe の Webhook に返金・チャージバックの通知が選ばれているか(サーバーが起動時に確かめて、足りなければ足す)。 */
type WebhookStatus =
  | { state: "unknown" }
  | { state: "ok"; added: string[] }
  | { state: "no_endpoint" }
  | { state: "error"; message: string };

function webhookText(w: WebhookStatus): { text: string; ok: boolean } {
  if (w.state === "ok") return { text: "Stripe の通知(入金・返金・チャージバック): 準備OK", ok: true };
  if (w.state === "no_endpoint") return { text: "Stripe に Webhook の送信先が見つかりません。返金の差し引きが動きません。", ok: false };
  if (w.state === "error") return { text: `Stripe の通知の確認に失敗しました: ${w.message}`, ok: false };
  return { text: "Stripe の通知: 確認中(サーバーの起動直後)", ok: false };
}

/** 最初の DM(コードを渡す前)。docs/influencer-dm.md の A と揃える。【】は送る前に相手に合わせて書き換える。 */
function firstDmText(origin: string): string {
  return [
    "はじめまして。福岡の九州工業大学で、学生向けのポーカーサークル「RR」の代表をしている、なおゆきと申します(サークルのアカウントから失礼します)。",
    "【〇〇の投稿/動画】いつも拝見しています。",
    "",
    "大学生の自分が作ったポーカーの学習アプリ「Poker ART」を、実際に使ってみて、面白いと思ったところを自由に紹介していただけないかと思い、ご連絡しました。",
    "",
    "【お渡しできるもの】",
    "・最上位のプラチナプランを3ヶ月無料",
    "・あなた専用の紹介コード",
    "",
    "【報酬の仕組み】",
    "① フォロワーさんが有料プランの決済画面でそのコードを入力すると、初月の支払いが30%OFFになります(Poker ART の有料会員になったことが無い方が対象)",
    "② そのコードで加入した方1人ごとに、月額の支払い(割引後に実際に支払われた額・税込)の、最初の3回分は80%、4回目以降はその方が続ける限りずっと20%が報酬になります",
    "  例: ゴールド(月¥1,380)なら 最初の3ヶ月で ¥772 + ¥1,104 + ¥1,104 = 約¥2,980、そのあと毎月¥276(1年続けば1人で約¥5,460)",
    "③ 月末締め・翌月末に銀行振込。1件ずつの明細を、あなた専用のページでいつでも確認できます",
    "",
    "ここに書いたのはスタートの形なので、紹介の形式や条件はご相談に合わせて調整できます。「こういう形なら」というものがあれば、気軽に教えてください。",
    "",
    `条件の詳細: ${origin}/partner-terms`,
    `アプリ: ${origin}`,
  ].join("\n");
}

/** 引き受けてもらえたあとに送る文面(コードと、本人専用の明細ページ)。docs/influencer-dm.md の D と揃える。 */
function codeDmText(origin: string, p: { code: string; statementToken: string }): string {
  return [
    "ありがとうございます!専用のコードをお送りします。",
    "",
    `コード: ${p.code}`,
    "(フォロワーさんがアプリの料金画面で「さあプレミアム会員に」ボタンのすぐ上のクーポンコード欄に入力して加入すると、初月の支払いが30%OFFになります)",
    "",
    "報酬の明細(あなた専用のページです。他の方には共有しないでください):",
    `${origin}/partner/${p.statementToken}`,
    `条件: ${origin}/partner-terms`,
    "",
    "お願いが2つだけあります。",
    "・投稿には「#PR」など、広告であることが分かる表示を必ず入れてください(ステマ規制のため)",
    "・アプリに登録したアカウントの表示名を教えてください。プラチナプランをこちらで付与します",
    "",
    "ほかは自由です。率直な感想をそのまま書いていただいて大丈夫です。",
  ].join("\n");
}

function yen(n: number): string {
  return `¥${n.toLocaleString()}`;
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
  const [webhook, setWebhook] = useState<WebhookStatus | null>(null);
  const [form, setForm] = useState({ name: "", contact: "", code: "", userId: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  /** 振込済みは1回目のタップで確認の状態にし、2回目で実行する(ホーム画面アプリでは window.confirm が出ないことがあるため)。 */
  const [confirmPaid, setConfirmPaid] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/admin/partners`, { headers: adminHeaders(passcode, accessToken) });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { partners: Partner[]; webhook?: WebhookStatus };
      setPartners(body.partners);
      setWebhook(body.webhook ?? null);
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
      const fresh: Partner = { ...body.partner, balance: { referrals: 0, accruing: 0, payable: 0, paidTotal: 0 } };
      setPartners((list) => [fresh, ...(list ?? [])]);
      setForm({ name: "", contact: "", code: "", userId: "", note: "" });
      setMessage({ text: `${body.partner.name} さんのコード ${body.partner.code} を発行しました(コピー済み)。`, ok: true });
      copy(body.partner.code);
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

  async function markPaid(p: Partner) {
    if (confirmPaid !== p.id) {
      setConfirmPaid(p.id);
      return;
    }
    setConfirmPaid(null);
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/admin/partners/paid`, {
        method: "POST",
        headers: { ...adminHeaders(passcode, accessToken), "content-type": "application/json" },
        body: JSON.stringify({ id: p.id }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; amount?: number };
      if (!body.ok) {
        setMessage({ text: `${p.name} さんの未払いが ${yen(body.amount ?? 0)} で、最低額に届いていません。`, ok: false });
        return;
      }
      setMessage({ text: `${p.name} さんへの ${yen(body.amount ?? 0)} を振込済みにしました。`, ok: true });
      await load();
    } catch {
      setMessage({ text: "サーバーに接続できませんでした。", ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function downloadCsv(p: Partner) {
    try {
      const res = await fetch(`${SERVER_URL}/api/admin/partners/ledger.csv?id=${encodeURIComponent(p.id)}`, {
        headers: adminHeaders(passcode, accessToken),
      });
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `partner_${p.code}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setMessage({ text: "CSV を取得できませんでした。", ok: false });
    }
  }

  /** 文字列をコピーし、key のボタンだけを「コピーしました」にする(既定の key は文字列そのもの)。 */
  function copy(text: string, key: string = text) {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    });
  }

  const activeCount = partners?.filter((p) => p.active).length ?? 0;
  const dueTotal = (partners ?? []).reduce((sum, p) => sum + (p.balance.payable >= MIN_PAYOUT ? p.balance.payable : 0), 0);

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
          <button
            type="button"
            onClick={() => copy(firstDmText(window.location.origin), "first-dm")}
            className="pressable mb-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-surface-2 px-3 py-2 text-[12px] font-bold text-fg-2"
          >
            <Icon name={copied === "first-dm" ? "check" : "send"} className="h-3.5 w-3.5" />
            {copied === "first-dm" ? "コピーしました" : "最初の DM の文面をコピー"}
          </button>
          {webhook && (
            <p className={`mb-2 flex items-center gap-1.5 text-[11px] font-bold ${webhookText(webhook).ok ? "text-accent" : "text-crimson-300"}`}>
              <Icon name={webhookText(webhook).ok ? "check" : "warning"} className="h-3.5 w-3.5 shrink-0" />
              {webhookText(webhook).text}
            </p>
          )}
          <p className="text-[11px] leading-relaxed text-fg-3">
            料金の画面のクーポンコード欄(または決済画面)で入れると初回の支払いが30%OFFになるコード。有料会員になったことが無い人だけが使えます。コードを省くと自動で作ります。コードを押すとコピーできます。
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

          {partners && partners.length > 0 && (
            <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2.5">
              <p className="text-[10px] font-bold text-fg-3">今月末に振り込む合計(締めた月の未払い・¥3,000以上の人)</p>
              <p className="text-[18px] font-black tabular-nums text-fg">{yen(dueTotal)}</p>
            </div>
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
                  {/* コードそのものを押すとコピーできる(インフルエンサーに渡す招待コード)。 */}
                  <button
                    type="button"
                    onClick={() => copy(p.code)}
                    aria-label={`コード ${p.code} をコピー`}
                    className="pressable mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5"
                  >
                    <span className={`text-[13px] font-black tracking-[0.12em] ${p.active ? "text-fg" : "text-fg-3 line-through"}`}>
                      {p.code}
                    </span>
                    <Icon name={copied === p.code ? "check" : "copy"} className={`h-3.5 w-3.5 ${copied === p.code ? "text-accent" : "text-fg-3"}`} />
                    <span className={`text-[10.5px] font-bold ${copied === p.code ? "text-accent" : "text-fg-3"}`}>
                      {copied === p.code ? "コピーしました" : "コピー"}
                    </span>
                  </button>
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-fg-3">
                    <span>{fmtDate(p.createdAt)}</span>
                    {p.userId && <span>・ 本人のアカウントあり</span>}
                  </p>
                  {p.note && <p className="mt-0.5 truncate text-[10.5px] text-fg-3">{p.note}</p>}
                  <p className="mt-1 text-[11px] tabular-nums text-fg-2">
                    加入 {p.balance.referrals}人 ・ 今月分 {yen(p.balance.accruing)} ・ 未払い{" "}
                    <span className={p.balance.payable >= MIN_PAYOUT ? "font-black text-accent" : ""}>{yen(p.balance.payable)}</span>{" "}
                    ・ 支払済 {yen(p.balance.paidTotal)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {p.balance.payable >= MIN_PAYOUT && (
                      <button
                        type="button"
                        onClick={() => void markPaid(p)}
                        disabled={busy}
                        className="pressable rounded-lg bg-accent/15 px-2.5 py-1 text-[11px] font-black text-accent ring-1 ring-accent disabled:opacity-40"
                      >
                        {confirmPaid === p.id ? `${yen(p.balance.payable)} を振込済みにする` : "振込済みにする"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => copy(codeDmText(window.location.origin, p), `code-dm:${p.id}`)}
                      className="pressable rounded-lg bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-fg-2"
                    >
                      {copied === `code-dm:${p.id}` ? "コピーしました" : "コードを渡す文面"}
                    </button>
                    <button
                      type="button"
                      onClick={() => copy(`${window.location.origin}/partner/${p.statementToken}`, `statement:${p.id}`)}
                      className="pressable rounded-lg bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-fg-2"
                    >
                      {copied === `statement:${p.id}` ? "コピーしました" : "明細URL"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadCsv(p)}
                      className="pressable rounded-lg bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-fg-2"
                    >
                      台帳CSV
                    </button>
                  </div>
                </div>
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
