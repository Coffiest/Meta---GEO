"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { PasscodeModal } from "@/components/PasscodeModal";

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

interface AdminUser {
  id: string;
  displayName: string;
  email: string | null;
  createdAt: string;
  subscription: { status: string; currentPeriodEnd: string | null; active: boolean } | null;
  /** GEO戦略DBに入っているこのプレイヤーのハンド数(総数/除外済み)。 */
  geo: { totalHands: number; excludedHands: number };
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function subLabel(sub: AdminUser["subscription"]): { text: string; tone: "active" | "comp" | "none" } {
  if (!sub) return { text: "未加入", tone: "none" };
  if (sub.status === "comp" && sub.active) return { text: `無料付与中(〜${fmtDate(sub.currentPeriodEnd)})`, tone: "comp" };
  if (sub.active) return { text: `加入中(${sub.status})`, tone: "active" };
  return { text: `未加入(${sub.status})`, tone: "none" };
}

/**
 * 管理者画面。ログイン画面/GEO DATABASE画面最下部のバージョン表記→パスコード(2357)から到達する。
 * プレイヤー名/ID/メールで検索し、任意ユーザーへ
 * - 棋譜解析 使い放題プランの無料付与(1週間/1ヶ月プリセット + 任意のN週間/Nヶ月)
 * - GEO戦略DBからのプレイライン削除(全期間 or 期間指定の論理削除)と復元
 * ができる。操作はサーバー側でも同じパスコードを検証する。
 */
import { ReportErrorButton } from "@/components/ReportErrorButton";
import { Icon } from "@/components/Icon";

/** GEO集計テーブルの再構築状況(サーバーの /api/admin/geo-backfill の応答)。 */
interface GeoBackfillStatus {
  totalHands: number;
  missingHands: number;
  running: boolean;
  progress: { total: number; processed: number; rows: number } | null;
  error: string | null;
}

/**
 * ポジション別の集まり具合(サーバーの /api/admin/geo-position-stats の応答)。
 *
 * 「プリフロップがUTGばかりで後ろのポジションが集まらない」の原因を切り分けるための計測。
 * hands(重複なしのハンド数)が人数ごとに揃っていれば母集団は健全で、見え方の問題だと分かる。
 */
interface GeoPositionStats {
  preflop: { position: string; playerCount: number; decisions: number; hands: number }[];
  byStreet: { street: string; rows: number }[];
  seats: { total: number; bot: number; human: number; humanAway: number; humanExcluded: number };
  handsWithoutDecisions: number;
  totalHands: number;
}

/** 人数ごとに、その卓で成立しうるポジションを前(早い)から順に並べたもの。 */
const POSITIONS_BY_PLAYER_COUNT: Record<number, string[]> = {
  2: ["BTN(SB)", "BB"],
  3: ["UTG", "BTN", "SB", "BB"],
  4: ["UTG", "BTN", "SB", "BB"],
  5: ["UTG", "CO", "BTN", "SB", "BB"],
  6: ["UTG", "HJ", "CO", "BTN", "SB", "BB"],
};

export default function AdminPage() {
  const [passcode, setPasscode] = useState<string | null>(null);
  const [gateNeeded, setGateNeeded] = useState(false);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** 任意期間入力の対象ユーザーID(開いているカスタム入力行)。 */
  const [customFor, setCustomFor] = useState<string | null>(null);
  const [customAmount, setCustomAmount] = useState("2");
  const [customUnit, setCustomUnit] = useState<"week" | "month">("week");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  /** GEOデータの期間指定削除フォームを開いているユーザーID。 */
  // GEO集計テーブル(GeoDecision)の再構築。全履歴を舐める重い処理なので、進捗をポーリングで見る。
  const [geoBackfill, setGeoBackfill] = useState<GeoBackfillStatus | null>(null);
  const [geoBackfillBusy, setGeoBackfillBusy] = useState(false);
  // ポジション別の集まり具合。重い集計ではないが、開いたときだけ取りに行く。
  const [posStats, setPosStats] = useState<GeoPositionStats | null>(null);
  const [posStatsOpen, setPosStatsOpen] = useState(false);

  const [geoRangeFor, setGeoRangeFor] = useState<string | null>(null);
  const [geoFrom, setGeoFrom] = useState("");
  const [geoTo, setGeoTo] = useState("");

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("adminPasscode");
      if (stored) setPasscode(stored);
      else setGateNeeded(true);
    } catch {
      setGateNeeded(true);
    }
  }, []);

  const search = useCallback(
    async (q: string, code: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${SERVER_URL}/api/admin/users?q=${encodeURIComponent(q)}`, {
          headers: { "x-admin-passcode": code },
        });
        if (res.status === 401) {
          try {
            sessionStorage.removeItem("adminPasscode");
          } catch {}
          setPasscode(null);
          setGateNeeded(true);
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { users: AdminUser[] };
        setUsers(data.users);
      } catch {
        setError("サーバーに接続できませんでした。時間をおいて再度お試しください。");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /** 再構築の状況を取得する(実行中は定期的に呼び直す)。 */
  const loadGeoBackfill = useCallback(
    async (code: string) => {
      try {
        const res = await fetch(`${SERVER_URL}/api/admin/geo-backfill`, { headers: { "x-admin-passcode": code } });
        if (!res.ok) return;
        setGeoBackfill((await res.json()) as GeoBackfillStatus);
      } catch {
        /* 一時的な通信断。次のポーリングで取り直す。 */
      }
    },
    [],
  );

  /** ポジション別の集まり具合を取得する。 */
  const loadPosStats = useCallback(async (code: string) => {
    try {
      const res = await fetch(`${SERVER_URL}/api/admin/geo-position-stats`, {
        headers: { "x-admin-passcode": code },
      });
      if (!res.ok) return;
      setPosStats((await res.json()) as GeoPositionStats);
    } catch {
      /* 一時的な通信断。開き直せば取り直す。 */
    }
  }, []);

  useEffect(() => {
    if (!passcode) return;
    const timer = setTimeout(() => void search(query, passcode), 300);
    return () => clearTimeout(timer);
  }, [query, passcode, search]);

  // ポジション別の内訳は、パネルを開いたときにだけ取りに行く。
  useEffect(() => {
    if (!passcode || !posStatsOpen || posStats) return;
    void loadPosStats(passcode);
  }, [passcode, posStatsOpen, posStats, loadPosStats]);

  // GEO集計テーブルの状況。実行中だけ3秒ごとに追いかけ、終わったらポーリングを止める。
  useEffect(() => {
    if (!passcode) return;
    void loadGeoBackfill(passcode);
    if (!geoBackfill?.running) return;
    const timer = setInterval(() => void loadGeoBackfill(passcode), 3000);
    return () => clearInterval(timer);
  }, [passcode, geoBackfill?.running, loadGeoBackfill]);

  async function grant(userId: string, unit: "week" | "month", amount: number) {
    if (!passcode) return;
    setBusyUserId(userId);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/admin/grant`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-passcode": passcode },
        body: JSON.stringify({ userId, unit, amount }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { currentPeriodEnd: string };
      setNotice(`無料付与しました(〜${fmtDate(data.currentPeriodEnd)})`);
      setCustomFor(null);
      await search(query, passcode);
    } catch {
      setError("付与に失敗しました。");
    } finally {
      setBusyUserId(null);
    }
  }

  /** GEOプレイラインの除外(論理削除)。from/to未指定なら全期間。 */
  async function startGeoBackfill() {
    if (!passcode || geoBackfillBusy) return;
    setGeoBackfillBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/admin/geo-backfill`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-passcode": passcode },
        body: JSON.stringify({ onlyMissing: true }),
      });
      const data = (await res.json()) as GeoBackfillStatus & { alreadyRunning?: boolean };
      setGeoBackfill(data);
      setNotice(data.alreadyRunning ? "再構築は既に実行中です。" : "GEO集計テーブルの再構築を開始しました。");
    } catch {
      setError("再構築の開始に失敗しました。");
    } finally {
      setGeoBackfillBusy(false);
    }
  }

  async function geoDelete(userId: string, from?: string, to?: string) {
    if (!passcode) return;
    const rangeText = from || to ? `期間 ${from || "最初"} 〜 ${to || "現在"} の` : "全期間の";
    if (!window.confirm(`このプレイヤーの${rangeText}プレイラインをGEOデータベースから削除(除外)します。よろしいですか？`)) return;
    setBusyUserId(userId);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/admin/geo-delete`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-passcode": passcode },
        body: JSON.stringify({
          userId,
          ...(from ? { from: new Date(from).toISOString() } : {}),
          ...(to ? { to: new Date(`${to}T23:59:59`).toISOString() } : {}),
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { count: number };
      setNotice(`${data.count}ハンド分のプレイラインをGEO集計から削除(除外)しました`);
      setGeoRangeFor(null);
      await search(query, passcode);
    } catch {
      setError("GEOデータの削除に失敗しました。");
    } finally {
      setBusyUserId(null);
    }
  }

  /** GEOプレイラインの除外を全解除(復元)。 */
  async function geoRestore(userId: string) {
    if (!passcode) return;
    setBusyUserId(userId);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/admin/geo-restore`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-passcode": passcode },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { count: number };
      setNotice(`${data.count}ハンド分の除外を解除(復元)しました`);
      await search(query, passcode);
    } catch {
      setError("復元に失敗しました。");
    } finally {
      setBusyUserId(null);
    }
  }

  async function revoke(userId: string) {
    if (!passcode) return;
    setBusyUserId(userId);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/admin/revoke`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-passcode": passcode },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setNotice("無料付与を取り消しました");
      await search(query, passcode);
    } catch {
      setError("取り消しに失敗しました。");
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* PC(lg)では幅を広げ、プレイヤーカードを2カラムに並べる(モバイルは従来の1カラム)。 */}
      <div className="mx-auto max-w-md px-4 pb-24 lg:max-w-5xl lg:px-8">
        <header className="flex items-center justify-between pt-[calc(env(safe-area-inset-top)+16px)] pb-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gold-600">Admin</p>
            <h1 className="text-xl font-black tracking-tight text-ink-950">プレイヤー管理</h1>
          </div>
          <Link href="/" className="text-[12px] font-bold text-ink-600 underline underline-offset-2">
            アプリへ戻る
          </Link>
        </header>

        {passcode && (
          <>
            {/* GEO集計テーブル(GeoDecision)の再構築。既存ハンドを展開し終えるまでGEOは旧経路のまま。 */}
            <div className="mb-4 rounded-xl border border-ink-300 p-3.5">
              <div className="flex items-start gap-2.5">
                <Icon name="db" className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-black text-ink-950">GEO集計テーブルの再構築</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-600">
                    過去のハンドをGEOの高速集計用に展開します。未展開が0件になるまでGEOは従来の集計経路で動きます。
                  </p>
                  {geoBackfill && (
                    <p className="mt-1.5 text-[11px] font-bold tabular-nums text-ink-800">
                      対象 {geoBackfill.totalHands.toLocaleString()} ハンド / 未展開{" "}
                      <span className={geoBackfill.missingHands === 0 ? "text-mint-700" : "text-crimson-500"}>
                        {geoBackfill.missingHands.toLocaleString()}
                      </span>{" "}
                      ハンド
                      {geoBackfill.running && geoBackfill.progress && (
                        <>
                          {" — 実行中 "}
                          {geoBackfill.progress.processed.toLocaleString()}/
                          {geoBackfill.progress.total.toLocaleString()}
                        </>
                      )}
                    </p>
                  )}
                  {geoBackfill?.error && (
                    <p className="mt-1 text-[11px] font-bold text-crimson-500">前回の実行が失敗しました: {geoBackfill.error}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void startGeoBackfill()}
                  disabled={geoBackfillBusy || geoBackfill?.running}
                  className="shrink-0 rounded-lg bg-ink-950 px-3 py-2 text-[12px] font-black text-white transition-transform active:scale-[0.97] disabled:opacity-40"
                >
                  {geoBackfill?.running ? "実行中…" : "再構築"}
                </button>
              </div>
            </div>

            {/* ポジション別の集まり具合。「UTGばかり集まる」の原因切り分け用。 */}
            <div className="mb-4 rounded-xl border border-ink-300 p-3.5">
              <div className="flex items-start gap-2.5">
                <Icon name="bar-chart" className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-black text-ink-950">ポジション別の集まり具合</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-600">
                    プリフロップの意思決定を、卓の人数×ポジションで数えます。人数ごとに横並びの数字が
                    おおむね揃っていれば母集団は健全です。特定のポジションだけ極端に少なければ、
                    席の割り当てかボタン回転を疑います。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPosStatsOpen((v) => !v);
                    if (posStatsOpen && passcode) setPosStats(null);
                  }}
                  className="shrink-0 rounded-lg bg-ink-950 px-3 py-2 text-[12px] font-black text-white transition-transform active:scale-[0.97]"
                >
                  {posStatsOpen ? "閉じる" : "内訳を見る"}
                </button>
              </div>

              {posStatsOpen && !posStats && <p className="mt-2.5 text-[11px] text-ink-600">読み込み中…</p>}

              {posStatsOpen && posStats && (
                <div className="mt-3 space-y-3">
                  {[6, 5, 4, 3, 2].map((pc) => {
                    const order = POSITIONS_BY_PLAYER_COUNT[pc] ?? [];
                    const rows = posStats.preflop.filter((r) => r.playerCount === pc);
                    if (rows.length === 0) return null;
                    // 表に載らないポジション名(想定外の値)も落とさず末尾に出す。
                    const extra = rows.map((r) => r.position).filter((p) => !order.includes(p));
                    const columns = [...order, ...new Set(extra)];
                    const max = Math.max(...rows.map((r) => r.hands), 1);
                    return (
                      <div key={pc}>
                        <p className="mb-1 text-[11px] font-black text-ink-800">{pc}人卓</p>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[380px] border-collapse text-[11px] tabular-nums">
                            <thead>
                              <tr className="text-ink-500">
                                {columns.map((p) => (
                                  <th key={p} className="border-b border-ink-200 px-1.5 py-1 text-left font-bold">
                                    {p}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                {columns.map((p) => {
                                  const row = rows.find((r) => r.position === p);
                                  const hands = row?.hands ?? 0;
                                  // 最大の1/4を下回るポジションは、偏りの候補として色を変える。
                                  const weak = hands < max / 4;
                                  return (
                                    <td
                                      key={p}
                                      className={`border-b border-ink-100 px-1.5 py-1 font-bold ${
                                        weak ? "text-crimson-500" : "text-ink-900"
                                      }`}
                                    >
                                      {hands.toLocaleString()}
                                    </td>
                                  );
                                })}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}

                  <div className="rounded-lg bg-ink-100 p-2.5 text-[11px] leading-relaxed text-ink-700">
                    <p className="font-bold text-ink-900">母数の内訳</p>
                    <p className="mt-0.5">
                      席 {posStats.seats.total.toLocaleString()}（うち自動 {posStats.seats.bot.toLocaleString()} /
                      実プレイヤー {posStats.seats.human.toLocaleString()}）
                    </p>
                    <p>
                      集計から外れた実プレイヤー席: 離席 {posStats.seats.humanAway.toLocaleString()} / 除外{" "}
                      {posStats.seats.humanExcluded.toLocaleString()}
                    </p>
                    <p>
                      ハンド {posStats.totalHands.toLocaleString()}（うち意思決定が1件も無い{" "}
                      {posStats.handsWithoutDecisions.toLocaleString()}）
                    </p>
                    <p className="mt-0.5">
                      ストリート別:{" "}
                      {posStats.byStreet.map((s) => `${s.street} ${s.rows.toLocaleString()}`).join(" / ")}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 検索 */}
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="プレイヤー名・ID・メールアドレスで検索"
                className="w-full rounded-xl border border-ink-300 py-3 pl-10 pr-3.5 text-sm text-ink-950 placeholder:text-ink-400 focus:border-ink-950 focus:outline-none"
              />
            </div>

            {notice && (
              <div className="mt-3 rounded-xl bg-mint-500/10 px-3.5 py-2.5 text-[12px] font-bold text-mint-700 ring-1 ring-mint-500/30">
                {notice}
              </div>
            )}
            {error && (
              <div className="mt-3 rounded-xl bg-crimson-500/10 px-3.5 py-2.5 ring-1 ring-crimson-500/30">
                <p className="text-[12px] font-bold text-crimson-500">{error}</p>
                <ReportErrorButton scope="admin" message={error} className="mt-2" />
              </div>
            )}

            {/* 結果リスト */}
            <div className="mt-4 space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
              {loading && users.length === 0 ? (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-ink-200 bg-ink-50 p-8 text-sm text-ink-500">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-950 border-t-transparent" />
                  読み込み中…
                </div>
              ) : users.length === 0 ? (
                <p className="rounded-2xl border border-ink-200 bg-ink-50 p-8 text-center text-sm text-ink-500">
                  該当するプレイヤーがいません。
                </p>
              ) : (
                users.map((u) => {
                  const label = subLabel(u.subscription);
                  const busy = busyUserId === u.id;
                  return (
                    <div key={u.id} className="rounded-2xl border border-ink-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-black tracking-tight text-ink-950">{u.displayName}</p>
                          <p className="truncate text-[11px] text-ink-500">{u.email ?? "メール未登録"}</p>
                          <p className="mt-0.5 truncate text-[9px] text-ink-400">ID: {u.id}</p>
                          <p className="mt-0.5 text-[10px] text-ink-400">登録日 {fmtDate(u.createdAt)}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${
                            label.tone === "active"
                              ? "bg-ink-950 text-gold-500"
                              : label.tone === "comp"
                              ? "bg-gold-500 text-ink-950"
                              : "bg-ink-100 text-ink-500"
                          }`}
                        >
                          {label.text}
                        </span>
                      </div>

                      {/* 付与アクション */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => void grant(u.id, "week", 1)}
                          disabled={busy}
                          className="rounded-full border border-ink-950 px-3.5 py-1.5 text-[11px] font-black text-ink-950 transition-colors active:bg-ink-50 disabled:opacity-40"
                        >
                          1週間 無料
                        </button>
                        <button
                          onClick={() => void grant(u.id, "month", 1)}
                          disabled={busy}
                          className="rounded-full border border-ink-950 px-3.5 py-1.5 text-[11px] font-black text-ink-950 transition-colors active:bg-ink-50 disabled:opacity-40"
                        >
                          1ヶ月 無料
                        </button>
                        <button
                          onClick={() => setCustomFor(customFor === u.id ? null : u.id)}
                          disabled={busy}
                          className={`rounded-full px-3.5 py-1.5 text-[11px] font-black transition-colors disabled:opacity-40 ${
                            customFor === u.id ? "bg-ink-950 text-white" : "border border-ink-300 text-ink-600 active:bg-ink-50"
                          }`}
                        >
                          期間を指定
                        </button>
                        {u.subscription?.status === "comp" && u.subscription.active && (
                          <button
                            onClick={() => void revoke(u.id)}
                            disabled={busy}
                            className="rounded-full border border-crimson-500/40 px-3.5 py-1.5 text-[11px] font-black text-crimson-500 transition-colors active:bg-crimson-500/5 disabled:opacity-40"
                          >
                            付与を取り消す
                          </button>
                        )}
                        {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-950 border-t-transparent" />}
                      </div>

                      {/* 任意期間の入力(N週間/Nヶ月) */}
                      <AnimatePresence>
                        {customFor === u.id && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-3 flex items-center gap-2 rounded-xl bg-ink-50 p-2.5">
                              <input
                                value={customAmount}
                                onChange={(e) => setCustomAmount(e.target.value.replace(/[^0-9]/g, ""))}
                                inputMode="numeric"
                                className="w-16 rounded-lg border border-ink-300 px-2.5 py-2 text-center text-sm font-bold text-ink-950 focus:border-ink-950 focus:outline-none"
                              />
                              <div className="flex overflow-hidden rounded-lg border border-ink-300 text-[11px] font-black">
                                {(["week", "month"] as const).map((unitKey) => (
                                  <button
                                    key={unitKey}
                                    onClick={() => setCustomUnit(unitKey)}
                                    className={`px-3 py-2 ${customUnit === unitKey ? "bg-ink-950 text-white" : "bg-white text-ink-500"}`}
                                  >
                                    {unitKey === "week" ? "週間" : "ヶ月"}
                                  </button>
                                ))}
                              </div>
                              <button
                                onClick={() => {
                                  const n = Number(customAmount);
                                  if (n > 0) void grant(u.id, customUnit, n);
                                }}
                                disabled={busy || !customAmount || Number(customAmount) <= 0}
                                className="ml-auto rounded-full bg-gold-500 px-4 py-2 text-[11px] font-black text-ink-950 active:opacity-90 disabled:opacity-40"
                              >
                                無料付与
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* GEOプレイラインデータの管理(論理削除/復元) */}
                      <div className="mt-3 border-t border-ink-100 pt-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-400">GEOデータ</p>
                          <p className="text-[11px] font-bold text-ink-700 tabular-nums">
                            {u.geo.totalHands}ハンド
                            {u.geo.excludedHands > 0 && (
                              <span className="ml-1 text-crimson-500">(除外 {u.geo.excludedHands})</span>
                            )}
                          </p>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => void geoDelete(u.id)}
                            disabled={busy || u.geo.totalHands === u.geo.excludedHands}
                            className="rounded-full border border-crimson-500/40 px-3.5 py-1.5 text-[11px] font-black text-crimson-500 transition-colors active:bg-crimson-500/5 disabled:opacity-40"
                          >
                            全部削除
                          </button>
                          <button
                            onClick={() => setGeoRangeFor(geoRangeFor === u.id ? null : u.id)}
                            disabled={busy}
                            className={`rounded-full px-3.5 py-1.5 text-[11px] font-black transition-colors disabled:opacity-40 ${
                              geoRangeFor === u.id ? "bg-ink-950 text-white" : "border border-ink-300 text-ink-600 active:bg-ink-50"
                            }`}
                          >
                            期間を指定して削除
                          </button>
                          {u.geo.excludedHands > 0 && (
                            <button
                              onClick={() => void geoRestore(u.id)}
                              disabled={busy}
                              className="rounded-full border border-ink-950 px-3.5 py-1.5 text-[11px] font-black text-ink-950 transition-colors active:bg-ink-50 disabled:opacity-40"
                            >
                              除外を全解除
                            </button>
                          )}
                        </div>

                        <AnimatePresence>
                          {geoRangeFor === u.id && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-3 space-y-2 rounded-xl bg-ink-50 p-2.5">
                                <div className="flex items-center gap-2">
                                  <label className="w-8 text-[10px] font-bold text-ink-500">から</label>
                                  <input
                                    type="date"
                                    value={geoFrom}
                                    onChange={(e) => setGeoFrom(e.target.value)}
                                    className="flex-1 rounded-lg border border-ink-300 px-2.5 py-2 text-[12px] font-bold text-ink-950 focus:border-ink-950 focus:outline-none"
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <label className="w-8 text-[10px] font-bold text-ink-500">まで</label>
                                  <input
                                    type="date"
                                    value={geoTo}
                                    onChange={(e) => setGeoTo(e.target.value)}
                                    className="flex-1 rounded-lg border border-ink-300 px-2.5 py-2 text-[12px] font-bold text-ink-950 focus:border-ink-950 focus:outline-none"
                                  />
                                </div>
                                <p className="text-[10px] leading-relaxed text-ink-400">
                                  片方だけの指定も可能(「から」のみ=それ以降すべて、「まで」のみ=それ以前すべて)。
                                </p>
                                <button
                                  onClick={() => void geoDelete(u.id, geoFrom || undefined, geoTo || undefined)}
                                  disabled={busy || (!geoFrom && !geoTo)}
                                  className="w-full rounded-full bg-crimson-500 px-4 py-2 text-[11px] font-black text-white active:opacity-90 disabled:opacity-40"
                                >
                                  この期間のプレイラインを削除
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {gateNeeded && (
          <PasscodeModal
            expected="2357"
            title="管理者パスコード"
            onSuccess={(code) => {
              try {
                sessionStorage.setItem("adminPasscode", code);
              } catch {}
              setPasscode(code);
              setGateNeeded(false);
            }}
            onClose={() => {
              window.location.href = "/";
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
