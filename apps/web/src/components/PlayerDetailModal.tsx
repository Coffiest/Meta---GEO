"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { SPRING_SHEET } from "@/lib/motion";
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

/** 対戦相手をタップしたときに開くプレイヤー詳細モーダル。
 * 公開スタッツ(収支/ROI/インマネ率/VPIP/PFR/3bet/偏差値/全国順位)+ 5色マーキング + 自由メモ。
 * ダークテーマ、アイコンは全てSVG(絵文字不使用)。 */
export function PlayerDetailModal({
  target,
  accessToken,
  onClose,
  onSaved,
}: {
  target: { userId: string; displayName: string; avatarKey: string | null };
  accessToken: string | undefined;
  onClose: () => void;
  /** メモ保存後、テーブル側のマーキング表示を更新するためのコールバック。 */
  onSaved?: (userId: string, color: PlayerNoteColor | null) => void;
}) {
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [color, setColor] = useState<PlayerNoteColor | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);

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
    ])
      .then(([prof, noteData]) => {
        if (!alive) return;
        setProfile(prof ?? syntheticPlayerProfile(target.userId, target.displayName, target.avatarKey));
        setColor(noteData.color);
        setNote(noteData.note);
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

  const s = profile?.stats;
  const rr = profile?.rrRating;
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const roiPct = (v: number) => `${(v * 100).toFixed(0)}%`;
  const chips = (v: number) => v.toLocaleString("ja-JP");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70"
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={SPRING_SHEET}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[88vh] overflow-y-auto glass-sheet rounded-t-sheet p-4 pb-8 shadow-e4"
      >
        {/* ヘッダー: アバター+名前+偏差値 */}
        <div className="mb-4 flex items-center gap-3">
          <Avatar avatarKey={target.avatarKey} displayName={target.displayName} size={48} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-fg-3">Player</p>
            <h2 className="truncate text-lg font-extrabold tracking-tight text-fg">{target.displayName}</h2>
          </div>
          <div className="shrink-0 rounded-xl border border-line-strong px-3 py-1.5 text-center">
            <p className="text-[9px] font-black uppercase tracking-[0.15em] text-fg-3">偏差値</p>
            {/* 偏差値。値が取れない相手でも枠・ラベルは必ず残し、値だけ「--」にする。 */}
            <p className="text-lg font-black leading-none tabular-nums text-fg">
              {loading || !rr || rr.rrRating == null ? "--" : rr.rrRating.toFixed(1)}
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 self-start text-[12px] font-semibold text-fg-2">
            閉じる
          </button>
        </div>

        {!hasProfile ? (
          <p className="py-10 text-center text-sm text-fg-2">このプレイヤーの統計は取得できません。</p>
        ) : loading ? (
          <div className="space-y-2 py-8">
            <div className="h-4 w-1/3 animate-pulse rounded bg-n-2" />
            <div className="h-20 animate-pulse rounded-xl bg-n-2" />
          </div>
        ) : !profile || !s || !rr ? (
          <p className="py-10 text-center text-sm text-fg-2">スタッツを取得できませんでした。</p>
        ) : (
          <>
            {/* 主要指標。どのプレイヤーでも同じ項目・同じ枠を必ず並べる。
                収支・偏差値・全国順位は値が取れない相手があり、その場合も枠は残して「--」にする。 */}
            <div className="grid grid-cols-2 gap-2">
              <Metric
                label="収支"
                value={s.profit == null ? "--" : `${s.profit >= 0 ? "+" : ""}${chips(s.profit)}`}
                accent={s.profit == null ? "flat" : s.profit >= 0 ? "up" : s.profit < 0 ? "down" : "flat"}
              />
              <Metric label="ROI(還元率)" value={roiPct(s.roi)} />
              <Metric label="インマネ率" value={pct(s.itmRate)} />
              <Metric
                label="全国順位"
                value={rr.nationalRank == null ? "--" : `${rr.nationalRank} / ${rr.totalRankedPlayers}`}
              />
            </div>

            {/* プリフロップ傾向 */}
            <p className="mb-2 mt-4 text-[10px] font-black uppercase tracking-[0.22em] text-fg-3">Preflop tendency</p>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="VPIP" value={pct(s.vpipRate)} compact />
              <Metric label="PFR" value={pct(s.pfrRate)} compact />
              <Metric label="3BET" value={pct(s.threeBetRate)} compact />
            </div>
            <p className="mt-2 text-[11px] text-fg-3 tabular-nums">参加トーナメント数: {s.tournamentsPlayed}</p>

            {/* マーキング */}
            <p className="mb-2 mt-5 text-[10px] font-black uppercase tracking-[0.22em] text-fg-3">Marking</p>
            <div className="flex items-center gap-2">
              {PLAYER_NOTE_COLORS.map((c) => {
                const active = color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-label={PLAYER_NOTE_COLOR_LABEL[c]}
                    onClick={() => setColor(active ? null : c)}
                    className={`h-8 w-8 rounded-full transition-transform ${active ? "scale-110 ring-2 ring-line-strong ring-offset-2" : "ring-1 ring-line"}`}
                    style={{ backgroundColor: PLAYER_NOTE_COLOR_HEX[c] }}
                  />
                );
              })}
              <button
                type="button"
                onClick={() => setColor(null)}
                className={`ml-1 flex h-8 items-center rounded-full border px-3 text-[11px] font-bold ${
                  color === null ? "border-line-strong text-fg" : "border-line text-fg-3"
                }`}
              >
                なし
              </button>
            </div>

            {/* メモ */}
            <p className="mb-2 mt-5 text-[10px] font-black uppercase tracking-[0.22em] text-fg-3">Note</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="この相手の傾向・読みをメモ(自分だけに表示)"
              className="w-full resize-none rounded-xl border border-line-strong bg-surface p-3 text-sm text-fg outline-none placeholder:text-fg-faint focus:ring-2 focus:ring-line-strong"
            />

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !accessToken}
              className="pressable mt-3 w-full rounded-xl bg-accent py-3 text-sm font-black text-on-accent shadow-glow disabled:opacity-50"
            >
              {saving ? "保存中…" : savedTick ? "保存しました" : "メモ・マーキングを保存"}
            </button>
            {!accessToken && (
              <p className="mt-2 text-center text-[11px] text-fg-3">メモの保存にはログインが必要です。</p>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

function Metric({
  label,
  value,
  accent = "flat",
  compact = false,
}: {
  label: string;
  value: string;
  accent?: "up" | "down" | "flat";
  compact?: boolean;
}) {
  const accentClass = accent === "up" ? "text-mint-400" : accent === "down" ? "text-crimson-300" : "text-fg";
  return (
    <div className="rounded-xl border border-line px-3 py-2.5">
      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-fg-3">{label}</p>
      <p className={`${compact ? "text-base" : "text-lg"} font-black leading-tight tabular-nums ${accentClass}`}>{value}</p>
    </div>
  );
}
