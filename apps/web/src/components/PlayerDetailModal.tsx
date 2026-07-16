"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
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
 * 黒枠線Swissデザイン、アイコンは全てSVG(絵文字不使用)。 */
export function PlayerDetailModal({
  target,
  accessToken,
  onClose,
  onSaved,
}: {
  target: { userId: string; displayName: string; avatarKey: string | null; isBot?: boolean };
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

  // 自動プレイヤーは通常プレイヤーと区別がつかないよう、userIdシードの決定論的な擬似スタッツを表示する。
  const isBot = Boolean(target.isBot);
  const hasProfile = isBot || Boolean(target.userId);

  useEffect(() => {
    let alive = true;
    // 自動プレイヤー: サーバーへ取りに行かず擬似プロフィールを即表示。メモは best-effort で取得。
    if (isBot) {
      setProfile(syntheticPlayerProfile(target.userId, target.displayName, target.avatarKey));
      setLoading(false);
      if (accessToken && target.userId) {
        void fetchPlayerNote(accessToken, target.userId).then((noteData) => {
          if (!alive) return;
          setColor(noteData.color);
          setNote(noteData.note);
        });
      }
      return () => {
        alive = false;
      };
    }
    if (!accessToken || !hasProfile) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void Promise.all([
      fetchPlayerProfile(accessToken, target.userId),
      fetchPlayerNote(accessToken, target.userId),
    ]).then(([prof, noteData]) => {
      if (!alive) return;
      setProfile(prof);
      setColor(noteData.color);
      setNote(noteData.note);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [accessToken, target.userId, target.displayName, target.avatarKey, isBot, hasProfile]);

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
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50"
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-t-2xl border border-ink-950 bg-white p-4 pb-8"
      >
        {/* ヘッダー: アバター+名前+偏差値 */}
        <div className="mb-4 flex items-center gap-3">
          <Avatar avatarKey={target.avatarKey} displayName={target.displayName} size={48} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-ink-400">Player</p>
            <h2 className="truncate text-lg font-extrabold tracking-tight text-ink-950">{target.displayName}</h2>
          </div>
          <div className="shrink-0 rounded-xl border border-ink-950 px-3 py-1.5 text-center">
            <p className="text-[9px] font-black uppercase tracking-[0.15em] text-ink-400">偏差値</p>
            <p className="text-lg font-black leading-none tabular-nums text-ink-950">
              {loading || !rr ? "–" : rr.rrRating.toFixed(1)}
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 self-start text-[12px] font-semibold text-ink-500">
            閉じる
          </button>
        </div>

        {!hasProfile ? (
          <p className="py-10 text-center text-sm text-ink-500">このプレイヤーの統計は取得できません。</p>
        ) : loading ? (
          <div className="space-y-2 py-8">
            <div className="h-4 w-1/3 animate-pulse rounded bg-ink-100" />
            <div className="h-20 animate-pulse rounded-xl bg-ink-100" />
          </div>
        ) : !profile || !s || !rr ? (
          <p className="py-10 text-center text-sm text-ink-500">スタッツを取得できませんでした。</p>
        ) : (
          <>
            {/* 主要指標 */}
            <div className="grid grid-cols-2 gap-2">
              {!isBot && <Metric label="収支" value={`${s.profit >= 0 ? "+" : ""}${chips(s.profit)}`} accent={s.profit >= 0 ? "up" : s.profit < 0 ? "down" : "flat"} />}
              <Metric label="ROI(還元率)" value={roiPct(s.roi)} />
              <Metric label="インマネ率" value={pct(s.itmRate)} />
              {!isBot && <Metric
                label="全国順位"
                value={rr.nationalRank ? `${rr.nationalRank} / ${rr.totalRankedPlayers}` : "–"}
              />}
            </div>

            {/* プリフロップ傾向 */}
            <p className="mb-2 mt-4 text-[10px] font-black uppercase tracking-[0.22em] text-ink-400">Preflop tendency</p>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="VPIP" value={pct(s.vpipRate)} compact />
              <Metric label="PFR" value={pct(s.pfrRate)} compact />
              <Metric label="3BET" value={pct(s.threeBetRate)} compact />
            </div>
            <p className="mt-2 text-[11px] text-ink-400 tabular-nums">参加トーナメント数: {s.tournamentsPlayed}</p>

            {/* マーキング */}
            <p className="mb-2 mt-5 text-[10px] font-black uppercase tracking-[0.22em] text-ink-400">Marking</p>
            <div className="flex items-center gap-2">
              {PLAYER_NOTE_COLORS.map((c) => {
                const active = color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-label={PLAYER_NOTE_COLOR_LABEL[c]}
                    onClick={() => setColor(active ? null : c)}
                    className={`h-8 w-8 rounded-full transition-transform ${active ? "scale-110 ring-2 ring-ink-950 ring-offset-2" : "ring-1 ring-ink-200"}`}
                    style={{ backgroundColor: PLAYER_NOTE_COLOR_HEX[c] }}
                  />
                );
              })}
              <button
                type="button"
                onClick={() => setColor(null)}
                className={`ml-1 flex h-8 items-center rounded-full border px-3 text-[11px] font-bold ${
                  color === null ? "border-ink-950 text-ink-950" : "border-ink-200 text-ink-400"
                }`}
              >
                なし
              </button>
            </div>

            {/* メモ */}
            <p className="mb-2 mt-5 text-[10px] font-black uppercase tracking-[0.22em] text-ink-400">Note</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="この相手の傾向・読みをメモ(自分だけに表示)"
              className="w-full resize-none rounded-xl border border-ink-950 bg-white p-3 text-sm text-ink-950 outline-none placeholder:text-ink-300 focus:ring-2 focus:ring-ink-950"
            />

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !accessToken}
              className="mt-3 w-full rounded-xl border border-ink-950 bg-ink-950 py-3 text-sm font-black text-white transition-opacity disabled:opacity-50"
            >
              {saving ? "保存中…" : savedTick ? "保存しました" : "メモ・マーキングを保存"}
            </button>
            {!accessToken && (
              <p className="mt-2 text-center text-[11px] text-ink-400">メモの保存にはログインが必要です。</p>
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
  const accentClass = accent === "up" ? "text-mint-700" : accent === "down" ? "text-crimson-600" : "text-ink-950";
  return (
    <div className="rounded-xl border border-ink-200 px-3 py-2.5">
      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-ink-400">{label}</p>
      <p className={`${compact ? "text-base" : "text-lg"} font-black leading-tight tabular-nums ${accentClass}`}>{value}</p>
    </div>
  );
}
