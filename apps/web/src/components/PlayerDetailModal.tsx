"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { SPRING_SNAPPY } from "@/lib/motion";
import { Icon } from "./Icon";
import { Avatar } from "./Avatar";
import {
  PLAYER_NOTE_COLORS,
  PLAYER_NOTE_COLOR_HEX,
  PLAYER_NOTE_COLOR_LABEL,
  fetchPlayerNote,
  fetchPlayerProfile,
  savePlayerNote,
  syntheticPlayerProfile,
  type PlayerNoteColor,
  type PublicPlayerProfile,
} from "@/lib/playerNotes";
import {
  PLAYER_REPORT_REASONS,
  PLAYER_REPORT_REASON_LABEL,
  fetchBlockedUserIds,
  reportPlayer,
  setPlayerBlocked,
  type PlayerReportReason,
} from "@/lib/playerModeration";
import { LoaderBlock } from "./ui/Loader";

/** 対戦相手をタップしたときに開くプレイヤー詳細モーダル。
 * 公開スタッツ(KKPoker のプレイヤー情報と同じ項目+収支/ROI/偏差値/全国順位)+ 5色マーキング + 自由メモ。
 * ダークテーマ、アイコンは全てSVG(絵文字不使用)。 */
export function PlayerDetailModal({
  target,
  accessToken,
  onClose,
  onSaved,
  onBlockChanged,
}: {
  target: { userId: string; displayName: string; avatarKey: string | null };
  accessToken: string | undefined;
  onClose: () => void;
  /** メモ保存後、テーブル側のマーキング表示を更新するためのコールバック。 */
  onSaved?: (userId: string, color: PlayerNoteColor | null) => void;
  /** ブロック状態が変わったとき、テーブル側のチャット表示フィルタを更新するためのコールバック。 */
  onBlockChanged?: (userId: string, blocked: boolean) => void;
}) {
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [color, setColor] = useState<PlayerNoteColor | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState<PlayerReportReason>("harassment");
  const [reportContext, setReportContext] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const [reportSent, setReportSent] = useState(false);

  const hasProfile = Boolean(target.userId);

  useEffect(() => {
    let alive = true;
    if (!accessToken || !hasProfile) {
      setLoading(false);
      return;
    }
    setLoading(true);
    // 相手が誰であっても同じ経路で取得する(取得方法の違いから相手の種別が分かってはいけない)。
    // サーバーが返せなかった場合だけ、userIdシードの決定論的な擬似スタッツで埋める。
    void Promise.all([
      fetchPlayerProfile(accessToken, target.userId),
      fetchPlayerNote(accessToken, target.userId),
      fetchBlockedUserIds(accessToken),
    ])
      .then(([prof, noteData, blockedIds]) => {
        if (!alive) return;
        setProfile(prof ?? syntheticPlayerProfile(target.userId, target.displayName, target.avatarKey));
        setColor(noteData.color);
        setNote(noteData.note);
        setBlocked(blockedIds.includes(target.userId));
        setLoading(false);
      })
      .catch(() => {
        // 取得失敗でもスピナーのまま固まらせない。相手の種別を悟らせないため、通常プレイヤー同様に
        // 決定論的な擬似スタッツで枠を埋めて表示する(挙動を分岐させない)。
        if (!alive) return;
        setProfile(syntheticPlayerProfile(target.userId, target.displayName, target.avatarKey));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [accessToken, target.userId, target.displayName, target.avatarKey, hasProfile]);

  async function handleSave() {
    if (!accessToken || saving) return;
    setSaving(true);
    const saved = await savePlayerNote(accessToken, target.userId, color, note);
    setColor(saved.color);
    setNote(saved.note);
    setSaving(false);
    setSavedTick(true);
    onSaved?.(target.userId, saved.color);
    window.setTimeout(() => setSavedTick(false), 1400);
  }

  async function handleToggleBlock() {
    if (!accessToken || blockBusy) return;
    setBlockBusy(true);
    const next = !blocked;
    const result = await setPlayerBlocked(accessToken, target.userId, next);
    setBlocked(result);
    setBlockBusy(false);
    onBlockChanged?.(target.userId, result);
  }

  async function handleSendReport() {
    if (!accessToken || reportSending) return;
    setReportSending(true);
    await reportPlayer(accessToken, target.userId, reportReason, reportContext);
    setReportSending(false);
    setReportSent(true);
    setReporting(false);
    setReportContext("");
  }

  const s = profile?.stats;
  const rr = profile?.rrRating;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const chips = (v: number) => v.toLocaleString("ja-JP");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4"
    >
      {/* 卓の上に浮く小さなカード(KKPoker のプレイヤー情報と同じ大きさ)。中央から膨らんで出る。 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.94 }}
        transition={SPRING_SNAPPY}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm max-h-[86vh] overflow-y-auto rounded-[22px] glass-sheet shadow-e4"
      >
        {/* ヘッダー: アバター+名前+閉じる */}
        <div className="flex items-center gap-3 px-4 pb-3 pt-4">
          <Avatar avatarKey={target.avatarKey} displayName={target.displayName} size={44} frame={profile?.frame ?? null} />
          <h2 className="min-w-0 flex-1 truncate text-[17px] font-extrabold tracking-tight text-fg">{target.displayName}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="pressable flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-2"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>

        {!hasProfile ? (
          <p className="py-10 text-center text-sm text-fg-2">このプレイヤーの統計は取得できません。</p>
        ) : loading ? (
          <LoaderBlock size="md" label="スタッツを読み込み中" className="py-10" />
        ) : !profile || !s || !rr ? (
          <p className="py-10 text-center text-sm text-fg-2">スタッツを取得できませんでした。</p>
        ) : (
          <div className="px-4 pb-4">
            {/* スタッツ。どのプレイヤーでも同じ項目・同じ枠を必ず並べる。
                収支・偏差値・全国順位は値が取れない相手があり、その場合も枠は残して「--」にする。 */}
            <div className="overflow-hidden rounded-2xl bg-surface/70">
              <StatRow
                cells={[
                  { label: "ハンド数", value: chips(s.hands) },
                  { label: "VPIP", value: pct(s.vpipRate) },
                  { label: "PFR", value: pct(s.pfrRate) },
                ]}
              />
              <StatRow
                cells={[
                  { label: "3-Bet", value: pct(s.threeBetRate) },
                  { label: "Fold to 3-Bet", value: pct(s.foldTo3BetRate) },
                  { label: "C-Bet", value: pct(s.cbetRate) },
                  { label: "Fold to C-Bet", value: pct(s.foldToCbetRate) },
                ]}
              />
              <StatRow
                cells={[
                  { label: "Steal", value: pct(s.stealRate) },
                  { label: "Check-Raise", value: pct(s.checkRaiseRate) },
                  { label: "WTSD", value: pct(s.wtsdRate) },
                  { label: "W$SD", value: pct(s.wsdRate) },
                ]}
              />
              <StatRow
                cells={[
                  { label: "参加数", value: chips(s.tournamentsPlayed) },
                  { label: "ITM", value: pct(s.itmRate) },
                  { label: "優勝", value: chips(s.titles) },
                ]}
              />
              <StatRow
                cells={[
                  {
                    label: "収支",
                    value: s.profit == null ? "--" : `${s.profit >= 0 ? "+" : ""}${chips(s.profit)}`,
                    tone: s.profit == null ? "flat" : s.profit >= 0 ? "up" : "down",
                  },
                  { label: "ROI", value: pct(s.roi) },
                  { label: "偏差値", value: rr.rrRating == null ? "--" : rr.rrRating.toFixed(1) },
                  { label: "全国順位", value: rr.nationalRank == null ? "--" : `${rr.nationalRank}` },
                ]}
              />
            </div>
            <p className="mt-1.5 text-[10px] text-fg-3">ハンドの数字は直近3,000ハンドまでで集計しています。</p>

            {/* マーキング */}
            <p className="mb-1.5 mt-3 text-[10px] font-black uppercase tracking-[0.22em] text-fg-3">Marking</p>
            <div className="flex items-center gap-2">
              {PLAYER_NOTE_COLORS.map((c) => {
                const active = color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-label={PLAYER_NOTE_COLOR_LABEL[c]}
                    onClick={() => setColor(active ? null : c)}
                    className={`pressable h-8 w-7 rounded-full transition-transform ${active ? "scale-110 ring-2 ring-line-strong ring-offset-2" : "ring-1 ring-line"}`}
                    style={{ backgroundColor: PLAYER_NOTE_COLOR_HEX[c] }}
                  />
                );
              })}
              <button
                type="button"
                onClick={() => setColor(null)}
                className={`pressable ml-1 flex h-7 items-center rounded-full border px-3 text-[11px] font-bold ${
                  color === null ? "border-line-strong text-fg" : "border-line text-fg-3"
                }`}
              >
                なし
              </button>
            </div>

            {/* メモ */}
            <p className="mb-1.5 mt-3 text-[10px] font-black uppercase tracking-[0.22em] text-fg-3">Note</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="この相手の傾向・読みをメモ(自分だけに表示)"
              className="w-full resize-none rounded-xl glass-panel p-3 text-sm text-fg outline-none placeholder:text-fg-faint focus:ring-2 focus:ring-line-strong"
            />

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !accessToken}
              className="pressable mt-2 w-full rounded-xl bg-accent py-2.5 text-sm font-black text-on-accent shadow-glow disabled:opacity-50"
            >
              {saving ? "保存中…" : savedTick ? "保存しました" : "メモ・マーキングを保存"}
            </button>
            {!accessToken && (
              <p className="mt-2 text-center text-[11px] text-fg-3">メモの保存にはログインが必要です。</p>
            )}

            {/* ブロック・通報。全プレイヤーに同一のUIを出す(相手の種別で分岐させない)。 */}
            <p className="mb-1.5 mt-3 text-[10px] font-black uppercase tracking-[0.22em] text-fg-3">Safety</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleBlock}
                disabled={blockBusy || !accessToken}
                className={`pressable flex-1 rounded-xl border py-2.5 text-[12px] font-bold disabled:opacity-50 ${
                  blocked ? "border-line-strong bg-surface-2 text-fg" : "border-line text-fg-2"
                }`}
              >
                {blockBusy ? "処理中…" : blocked ? "ブロック解除" : "この相手をブロック"}
              </button>
              {!reporting && (
                <button
                  type="button"
                  onClick={() => {
                    setReporting(true);
                    setReportSent(false);
                  }}
                  disabled={!accessToken}
                  className="pressable flex-1 rounded-xl border border-line py-2.5 text-[12px] font-bold text-fg-2 disabled:opacity-50"
                >
                  通報する
                </button>
              )}
            </div>
            {blocked && (
              <p className="mt-2 text-[11px] text-fg-3">ブロック中は、このプレイヤーの発言が自分の画面に表示されなくなります。</p>
            )}

            {reporting && (
              <div className="mt-3 rounded-xl glass-panel p-3">
                <p className="mb-2 text-[11px] font-bold text-fg">通報の理由を選んでください</p>
                <div className="flex flex-wrap gap-2">
                  {PLAYER_REPORT_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReportReason(r)}
                      className={`pressable rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                        reportReason === r ? "border-line-strong bg-surface-2 text-fg" : "border-line text-fg-3"
                      }`}
                    >
                      {PLAYER_REPORT_REASON_LABEL[r]}
                    </button>
                  ))}
                </div>
                <textarea
                  value={reportContext}
                  onChange={(e) => setReportContext(e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="状況の補足(任意)"
                  className="mt-2 w-full resize-none rounded-lg border border-line bg-transparent p-2 text-sm text-fg outline-none placeholder:text-fg-faint focus:ring-2 focus:ring-line-strong"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setReporting(false)}
                    className="pressable flex-1 rounded-lg border border-line py-2 text-[12px] font-semibold text-fg-2"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={handleSendReport}
                    disabled={reportSending}
                    className="pressable flex-1 rounded-lg bg-accent py-2 text-[12px] font-black text-on-accent disabled:opacity-50"
                  >
                    {reportSending ? "送信中…" : "通報を送信"}
                  </button>
                </div>
              </div>
            )}
            {reportSent && <p className="mt-2 text-[11px] text-fg-3">通報を受け付けました。ご協力ありがとうございます。</p>}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/** スタッツの1行。値を大きく、名前を小さく。セルの間は細い縦線、行の間は細い横線。 */
function StatRow({ cells }: { cells: { label: string; value: string; tone?: "up" | "down" | "flat" }[] }) {
  return (
    <div className={`grid border-b border-line/60 last:border-b-0 ${cells.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
      {cells.map((c) => (
        <div key={c.label} className="flex flex-col items-center justify-center border-r border-line/60 px-1 py-2 last:border-r-0">
          <span
            className={`text-[17px] font-black leading-none tabular-nums tracking-tight ${
              c.tone === "up" ? "text-mint-400" : c.tone === "down" ? "text-crimson-300" : "text-fg"
            }`}
          >
            {c.value}
          </span>
          <span className="mt-1 whitespace-nowrap text-[9px] font-semibold leading-none text-fg-3">{c.label}</span>
        </div>
      ))}
    </div>
  );
}
