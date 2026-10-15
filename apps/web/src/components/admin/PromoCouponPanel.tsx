"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/Icon";
import { adminHeaders } from "@/lib/adminApi";
import { SPRING_SNAPPY } from "@/lib/motion";

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

type Plan = "silver" | "gold" | "platinum";
type Kind = "percent" | "trial";

interface PromoCoupon {
  id: string;
  code: string;
  note: string | null;
  plan: Plan | null;
  kind: Kind;
  percentOff: number | null;
  durationMonths: number | null;
  trialDays: number | null;
  expiresAt: string | null;
  maxRedemptions: number | null;
  active: boolean;
  redeemed: number;
  createdAt: string;
  summary: string;
  expired: boolean;
}

interface FormState {
  kind: Kind;
  plan: Plan | "";
  percentOff: string;
  durationMonths: string;
  trialDays: string;
  code: string;
  expiresOn: string;
  maxRedemptions: string;
  note: string;
}

const EMPTY_FORM: FormState = {
  kind: "percent",
  plan: "",
  percentOff: "30",
  durationMonths: "1",
  trialDays: "7",
  code: "",
  expiresOn: "",
  maxRedemptions: "",
  note: "",
};

/** よく使う形をワンタップで入れる(オーナーの例)。 */
const TEMPLATES: { label: string; form: Partial<FormState> }[] = [
  { label: "シルバー 3日間無料", form: { kind: "trial", plan: "silver", trialDays: "3" } },
  { label: "プラチナ 1週間無料", form: { kind: "trial", plan: "platinum", trialDays: "7" } },
  { label: "プラチナ 初月30%OFF", form: { kind: "percent", plan: "platinum", percentOff: "30", durationMonths: "1" } },
  { label: "プラチナ 最初の3ヶ月50%OFF", form: { kind: "percent", plan: "platinum", percentOff: "50", durationMonths: "3" } },
  { label: "初月無料", form: { kind: "percent", plan: "", percentOff: "100", durationMonths: "1" } },
];

const PLAN_LABEL: Record<Plan | "", string> = { "": "全プラン", silver: "シルバー", gold: "ゴールド", platinum: "プラチナ" };

const ERROR_TEXT: Record<string, string> = {
  code_taken: "そのコードは使われています(インフルエンサーのコードとも重ねられません)。",
  invalid_code: "コードは英数字4〜20文字にしてください。",
  invalid_percent: "割引率は1〜100%で入れてください。",
  invalid_months: "期間は1〜36ヶ月で入れてください。",
  invalid_days: "無料の日数は1〜365日で入れてください。",
  invalid_max: "人数の上限は1以上で入れてください(無制限なら空欄)。",
  invalid_expiry: "有効期限は今日より後の日付にしてください。",
  subscriptions_unavailable: "決済(Stripe)の準備ができていないため発行できません。",
  still_active: "有効なコードは消せません。先に失効させてください。",
  has_redemptions: "このコードで加入した人がいるため消せません(記録として失効のまま残します)。",
};

/** 画面の説明文(サーバーの describePromoCoupon と同じ言い方)。 */
function describe(f: FormState): string {
  const plan = PLAN_LABEL[f.plan];
  if (f.kind === "trial") return `${plan} ${f.trialDays || "?"}日間無料`;
  const months = f.durationMonths === "1" ? "初月" : `最初の${f.durationMonths || "?"}ヶ月`;
  return f.percentOff === "100" ? `${plan} ${months}無料` : `${plan} ${months} ${f.percentOff || "?"}%OFF`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** 2つ以上の選択肢から1つを選ぶ、iOS のセグメントのような切り替え。選んだ塗りは滑って移る。 */
function Segmented<T extends string>({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-[10px] bg-surface-2 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={`pressable relative flex-1 rounded-[8px] px-2 py-1.5 text-[12px] font-bold ${active ? "text-fg" : "text-fg-3"}`}
          >
            {active && (
              <motion.span layoutId={`seg-${id}`} transition={SPRING_SNAPPY} className="absolute inset-0 rounded-[8px] bg-n-4 shadow-e1" />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** 数値のプリセット(ワンタップ)+自由入力。 */
function NumberChips({
  value,
  presets,
  suffix,
  onChange,
}: {
  value: string;
  presets: number[];
  suffix: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {presets.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(String(n))}
          className={`pressable rounded-full px-3 py-1.5 text-[12px] font-bold tabular-nums ${
            value === String(n) ? "bg-accent/15 text-accent ring-1 ring-accent" : "bg-surface-2 text-fg-2"
          }`}
        >
          {n}
          {suffix}
        </button>
      ))}
      <div className="flex items-center gap-1">
        <input
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
          className="input-inset w-14 rounded-lg px-2 py-1.5 text-center text-[13px] font-bold tabular-nums text-fg focus:outline-none"
        />
        <span className="text-[12px] text-fg-3">{suffix}</span>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5">
      <p className="mb-1.5 text-[11px] font-bold text-fg-2">{label}</p>
      {children}
      {hint && <p className="mt-1 text-[10.5px] leading-relaxed text-fg-3">{hint}</p>}
    </div>
  );
}

/**
 * 管理者画面の「クーポン」。どのプランを・どの期間・何%OFF(または何日無料)にするかを決めてコードを発行し、
 * 失効・削除もできる(オーナー指示 2026-10-15)。コードは料金のシートの「クーポンコード」欄で使う。
 */
export function PromoCouponPanel({ passcode, accessToken }: { passcode: string; accessToken: string | null }) {
  const [coupons, setCoupons] = useState<PromoCoupon[] | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/admin/promo-coupons`, { headers: adminHeaders(passcode, accessToken) });
      if (!res.ok) throw new Error(String(res.status));
      setCoupons(((await res.json()) as { coupons: PromoCoupon[] }).coupons);
    } catch {
      setMessage({ text: "クーポンの一覧を読み込めませんでした。", ok: false });
    }
  }, [passcode, accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  function copy(text: string) {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(text);
      window.setTimeout(() => setCopied((c) => (c === text ? null : c)), 1500);
    });
  }

  async function post(path: string, body: unknown): Promise<{ ok: boolean; body: Record<string, unknown>; status: number }> {
    const res = await fetch(`${SERVER_URL}${path}`, {
      method: "POST",
      headers: { ...adminHeaders(passcode, accessToken), "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  }

  async function issue() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await post("/api/admin/promo-coupons", {
        kind: form.kind,
        plan: form.plan || null,
        percentOff: form.kind === "percent" ? Number(form.percentOff) : undefined,
        durationMonths: form.kind === "percent" ? Number(form.durationMonths) : undefined,
        trialDays: form.kind === "trial" ? Number(form.trialDays) : undefined,
        code: form.code,
        // 日付はその日の終わり(日本時間)まで使える。
        expiresAt: form.expiresOn ? `${form.expiresOn}T23:59:59+09:00` : "",
        maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : undefined,
        note: form.note,
      });
      const created = r.body["coupon"] as PromoCoupon | undefined;
      if (!r.ok || !created) {
        const err = String(r.body["error"] ?? r.status);
        setMessage({ text: ERROR_TEXT[err] ?? `発行できませんでした(${err})。`, ok: false });
        return;
      }
      setCoupons((list) => [created, ...(list ?? [])]);
      setForm(EMPTY_FORM);
      copy(created.code);
      setMessage({ text: `「${created.summary}」のコード ${created.code} を発行しました(コピー済み)。`, ok: true });
    } catch {
      setMessage({ text: "サーバーに接続できませんでした。", ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(c: PromoCoupon) {
    setBusy(true);
    setMessage(null);
    try {
      const r = await post("/api/admin/promo-coupons/active", { id: c.id, active: !c.active });
      if (!r.ok) throw new Error(String(r.status));
      setCoupons((list) => (list ?? []).map((x) => (x.id === c.id ? { ...x, active: !c.active } : x)));
    } catch {
      setMessage({ text: "切り替えられませんでした。", ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: PromoCoupon) {
    if (confirmDelete !== c.id) {
      setConfirmDelete(c.id);
      return;
    }
    setConfirmDelete(null);
    setBusy(true);
    setMessage(null);
    try {
      const r = await post("/api/admin/promo-coupons/delete", { id: c.id });
      if (!r.ok) {
        const err = String(r.body["error"] ?? r.status);
        setMessage({ text: ERROR_TEXT[err] ?? `削除できませんでした(${err})。`, ok: false });
        return;
      }
      setCoupons((list) => (list ?? []).filter((x) => x.id !== c.id));
    } catch {
      setMessage({ text: "サーバーに接続できませんでした。", ok: false });
    } finally {
      setBusy(false);
    }
  }

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <section className="space-y-6">
      {/* 発行 */}
      <div className="rounded-[20px] bg-surface p-4 shadow-e1">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[17px] font-black text-fg">クーポンを発行</h2>
          <p className="text-[11px] text-fg-3">料金のシートのコード欄で使えます</p>
        </div>

        {/* よく使う形 */}
        <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 no-scrollbar">
          {TEMPLATES.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => set(t.form)}
              className="pressable shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-[12px] font-bold text-fg-2"
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-2 divide-y divide-line">
          <Field label="種類">
            <Segmented
              id="kind"
              value={form.kind}
              options={[
                { value: "percent", label: "割引(○%OFF)" },
                { value: "trial", label: "無料体験(○日間)" },
              ]}
              onChange={(kind) => set({ kind })}
            />
          </Field>
          <Field label="プラン">
            <Segmented
              id="plan"
              value={form.plan}
              options={(["", "silver", "gold", "platinum"] as const).map((p) => ({ value: p, label: PLAN_LABEL[p] }))}
              onChange={(plan) => set({ plan })}
            />
          </Field>
          <AnimatePresence mode="popLayout" initial={false}>
            {form.kind === "percent" ? (
              <motion.div key="percent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={SPRING_SNAPPY} className="divide-y divide-line">
                <Field label="割引率" hint="100% にすると、その期間は無料になります。">
                  <NumberChips value={form.percentOff} presets={[10, 30, 50, 100]} suffix="%" onChange={(percentOff) => set({ percentOff })} />
                </Field>
                <Field label="割引が続く期間(最初の支払いから)">
                  <NumberChips value={form.durationMonths} presets={[1, 3, 6, 12]} suffix="ヶ月" onChange={(durationMonths) => set({ durationMonths })} />
                </Field>
              </motion.div>
            ) : (
              <motion.div key="trial" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={SPRING_SNAPPY}>
                <Field label="無料の日数" hint="期間が終わると、そのプランの月額が自動で始まります(それまでに解約すれば請求されません)。">
                  <NumberChips value={form.trialDays} presets={[3, 7, 14, 30]} suffix="日" onChange={(trialDays) => set({ trialDays })} />
                </Field>
              </motion.div>
            )}
          </AnimatePresence>
          <Field label="コード" hint="空欄なら自動で作ります(英数字4〜20文字)。">
            <input
              value={form.code}
              onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) })}
              placeholder="例 SPRING50"
              autoCapitalize="characters"
              className="input-inset w-full rounded-lg px-3 py-2 font-mono text-[14px] font-bold tracking-[0.06em] text-fg placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-fg-3 focus:outline-none"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="有効期限(任意)">
              <input
                type="date"
                value={form.expiresOn}
                onChange={(e) => set({ expiresOn: e.target.value })}
                className="input-inset w-full rounded-lg px-2.5 py-2 text-[13px] text-fg focus:outline-none"
              />
            </Field>
            <Field label="使える人数(任意)">
              <input
                inputMode="numeric"
                value={form.maxRedemptions}
                onChange={(e) => set({ maxRedemptions: e.target.value.replace(/[^0-9]/g, "").slice(0, 6) })}
                placeholder="無制限"
                className="input-inset w-full rounded-lg px-2.5 py-2 text-[13px] tabular-nums text-fg placeholder:text-fg-3 focus:outline-none"
              />
            </Field>
          </div>
          <Field label="メモ(任意・管理用)">
            <input
              value={form.note}
              onChange={(e) => set({ note: e.target.value.slice(0, 200) })}
              placeholder="例 X の春キャンペーン"
              className="input-inset w-full rounded-lg px-3 py-2 text-[13px] text-fg placeholder:text-fg-3 focus:outline-none"
            />
          </Field>
        </div>

        {/* 何を発行するかを、発行の直前に文章で確かめられるように。 */}
        <div className="mt-3 flex items-center gap-3">
          <p className="min-w-0 flex-1 text-[14px] font-black text-fg">{describe(form)}</p>
          <button
            type="button"
            onClick={() => void issue()}
            disabled={busy}
            className="pressable shrink-0 rounded-full bg-accent px-5 py-2.5 text-[13px] font-black text-on-accent shadow-glow disabled:opacity-40"
          >
            {busy ? "発行中…" : "発行する"}
          </button>
        </div>
        <p className="mt-2 text-[10.5px] leading-relaxed text-fg-3">
          1人が同じコードを使えるのは1回だけです。「○ヶ月続けてくれたら初月無料」のような最低契約期間の縛りは付けられません(いつでも解約できる契約のため)。
        </p>
        {message && <p className={`mt-2 text-[12px] font-bold ${message.ok ? "text-accent" : "text-crimson-300"}`}>{message.text}</p>}
      </div>

      {/* 一覧 */}
      <div>
        <div className="mb-1 flex items-baseline justify-between px-1">
          <h2 className="text-[17px] font-black text-fg">発行したクーポン</h2>
          <button type="button" onClick={() => void load()} className="pressable text-[12px] font-bold text-accent">
            更新
          </button>
        </div>
        {!coupons ? (
          <p className="px-1 py-6 text-center text-[12px] text-fg-3">読み込み中…</p>
        ) : coupons.length === 0 ? (
          <p className="px-1 py-6 text-center text-[12px] text-fg-3">まだありません。</p>
        ) : (
          <div className="overflow-hidden rounded-[20px] bg-surface shadow-e1">
            {coupons.map((c) => {
              const usable = c.active && !c.expired && (c.maxRedemptions === null || c.redeemed < c.maxRedemptions);
              const status = !c.active ? "失効" : c.expired ? "期限切れ" : usable ? "有効" : "上限";
              return (
                <div key={c.id} className="list-row px-4 py-3" style={{ ["--row-inset" as string]: "16px" }}>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => copy(c.code)}
                      className="pressable flex min-w-0 items-center gap-1.5 font-mono text-[15px] font-black tracking-[0.04em] text-fg"
                      aria-label={`${c.code} をコピー`}
                    >
                      <span className="truncate">{copied === c.code ? "コピーしました" : c.code}</span>
                      <Icon name={copied === c.code ? "check" : "copy"} className="h-3.5 w-3.5 shrink-0 text-fg-3" />
                    </button>
                    <span
                      className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-black ${
                        usable ? "bg-accent/15 text-accent" : "bg-surface-2 text-fg-3"
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[13px] font-bold text-fg-2">{c.summary}</p>
                  <p className="mt-0.5 text-[11px] tabular-nums text-fg-3">
                    使用 {c.redeemed}
                    {c.maxRedemptions !== null ? ` / ${c.maxRedemptions}` : ""}人 ・ 期限 {c.expiresAt ? fmtDate(c.expiresAt) : "なし"} ・ 発行 {fmtDate(c.createdAt)}
                    {c.note ? ` ・ ${c.note}` : ""}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void toggle(c)}
                      disabled={busy}
                      className="pressable rounded-full bg-surface-2 px-3 py-1.5 text-[12px] font-bold text-fg-2 disabled:opacity-40"
                    >
                      {c.active ? "失効させる" : "再開する"}
                    </button>
                    {!c.active && (
                      <button
                        type="button"
                        onClick={() => void remove(c)}
                        disabled={busy}
                        className={`pressable rounded-full px-3 py-1.5 text-[12px] font-bold disabled:opacity-40 ${
                          confirmDelete === c.id ? "bg-crimson-600 text-white" : "bg-surface-2 text-crimson-300"
                        }`}
                      >
                        {confirmDelete === c.id ? "もう一度押すと削除" : "削除"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
