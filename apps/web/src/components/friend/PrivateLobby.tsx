"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SPRING_SNAPPY } from "@/lib/motion";
import { useI18n } from "@/lib/i18n";
import { Icon } from "../Icon";
import { Avatar } from "../Avatar";
import { PrivateSettingsForm, Sheet } from "./FriendMatch";
import { BLIND_SPEEDS, type PrivateAck, type PrivateClosedReason, type PrivateRoomInfo, type PrivateRoomSettings } from "@/lib/privateRoom";

/**
 * フレンド対戦の待合(スタート前)。卓の画面に参加者を座らせ、アクションバーの場所に
 * ホストだけ「スタート」を出す。高さはアクションバーと同じ 132px(変えると卓が上下に跳ねる)。
 */
export function PrivateLobbyBar({
  room,
  onStart,
  onOpenSettings,
  onLeave,
}: {
  room: PrivateRoomInfo;
  onStart: () => Promise<PrivateAck>;
  onOpenSettings: () => void;
  onLeave: () => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canStart = room.members.length >= 2;
  const speed = BLIND_SPEEDS.find((b) => b.key === room.settings.blind)!;

  return (
    <div className="safe-area-bottom px-3 pb-2 pt-1">
      <div className="mx-auto flex h-[132px] max-w-md flex-col justify-between gap-[5px] px-3 py-2">
        {/* 上の段: 左に人数と設定、右(画面の右下)にルームコード(オーナー指示: 右下にコードとコピー)。
            卓の上に置くと自分の席に重なるので、卓の外のこの段に置く。 */}
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-bold tabular-nums text-fg">
              {t("friend.members", { n: room.members.length, max: room.settings.maxPlayers })}
              <span className="font-semibold text-fg-2"> · {t(`friend.blind.${room.settings.blind}`)}</span>
            </p>
            <p className="mt-0.5 truncate text-[11px] font-semibold text-fg-3" aria-live="polite">
              {error ?? (room.isHost ? (canStart ? t("friend.blind.meta", { min: speed.minutes, bb: speed.bb }) : t("friend.needTwo")) : t("friend.waitHost"))}
            </p>
          </div>
          <RoomCodeChip code={room.code} />
        </div>
        <div className="flex gap-2">
          {room.isHost ? (
            <>
              <button
                type="button"
                onClick={onOpenSettings}
                aria-label={t("friend.settings")}
                className="pressable flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-2xl bg-white/[0.05] text-fg-2 shadow-e1 ring-1 ring-inset ring-white/10"
              >
                <Icon name="settings" className="h-5 w-5" />
              </button>
              <button
                type="button"
                disabled={!canStart || busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  const res = await onStart();
                  setBusy(false);
                  if (!res.ok) setError(res.message);
                }}
                className={`pressable flex h-[50px] flex-1 items-center justify-center rounded-2xl text-[15px] font-black tracking-[0.08em] transition-colors ${
                  canStart ? "bg-accent text-on-accent shadow-glow" : "bg-white/[0.05] text-fg-3 ring-1 ring-inset ring-white/10"
                }`}
              >
                {t("friend.start")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onLeave}
              className="pressable flex h-[50px] flex-1 items-center justify-center rounded-2xl bg-white/[0.05] text-[13px] font-bold text-fg-2 shadow-e1 ring-1 ring-inset ring-white/10"
            >
              {t("friend.leave")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 卓の右下に置くルームコード。押すとコピーする(オーナー指示: 右下に独立したコードとコピーボタン)。 */
export function RoomCodeChip({ code }: { code: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // クリップボードが使えない環境(古いブラウザ・権限なし)では選択して手でコピーしてもらう。
      const el = document.createElement("textarea");
      el.value = code;
      document.body.appendChild(el);
      el.select();
      try {
        document.execCommand("copy");
      } finally {
        el.remove();
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`${t("friend.code")} ${code} ${t("friend.copy")}`}
      className="pressable flex shrink-0 items-center gap-2 rounded-2xl bg-white/[0.05] py-1.5 pl-3 pr-1.5 ring-1 ring-inset ring-white/10"
    >
      <span className="text-left">
        <span className="block text-[9px] font-black tracking-[0.12em] text-fg-3">{t("friend.code")}</span>
        <span className="block text-[18px] font-black leading-none tabular-nums tracking-[0.12em] text-fg">{code}</span>
      </span>
      <span className="relative grid h-8 w-8 place-items-center rounded-xl bg-accent/15 text-accent">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={copied ? "done" : "copy"}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={SPRING_SNAPPY}
            className="grid place-items-center"
          >
            <Icon name={copied ? "check" : "copy"} className="h-4 w-4" />
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="sr-only" aria-live="polite">
        {copied ? t("friend.copied") : ""}
      </span>
    </button>
  );
}

/** ホストが参加者の席を押したとき: その人をルームから外す。 */
export function PrivateMemberSheet({
  member,
  onKick,
  onClose,
}: {
  member: { userId: string; displayName: string; avatarKey: string | null };
  onKick: () => Promise<PrivateAck>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet onClose={onClose} label={member.displayName}>
      <div className="flex items-center gap-3">
        <Avatar avatarKey={member.avatarKey} displayName={member.displayName} size={44} />
        <p className="min-w-0 flex-1 truncate text-[17px] font-black text-fg">{member.displayName}</p>
      </div>
      {error && <p className="mt-3 text-center text-[12px] text-crimson-300">{error}</p>}
      <button
        type="button"
        onClick={async () => {
          const res = await onKick();
          if (res.ok) onClose();
          else setError(res.message);
        }}
        className="pressable mt-5 flex h-12 w-full items-center justify-center rounded-2xl bg-crimson-500/15 text-[14px] font-bold text-crimson-300 ring-1 ring-inset ring-crimson-500/40"
      >
        {t("friend.kick")}
      </button>
      <button type="button" onClick={onClose} className="pressable mt-2 flex h-11 w-full items-center justify-center rounded-2xl text-[13px] font-bold text-fg-2">
        {t("common.close")}
      </button>
    </Sheet>
  );
}

/** ホストがスタート前に設定を変える・ルームを解散する。 */
export function PrivateSettingsSheet({
  settings,
  onSave,
  onDisband,
  onClose,
}: {
  settings: PrivateRoomSettings;
  onSave: (next: PrivateRoomSettings) => Promise<PrivateAck>;
  onDisband: () => Promise<PrivateAck>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(settings);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet onClose={onClose} label={t("friend.settings")}>
      <div className="mb-4 flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-[18px] font-black tracking-tight text-fg">{t("friend.settings")}</h2>
        <button type="button" onClick={onClose} aria-label={t("common.close")} className="pressable grid h-8 w-8 place-items-center rounded-full bg-white/[0.08] text-fg-2">
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
      <PrivateSettingsForm value={draft} onChange={setDraft} />
      {error && <p className="mt-3 text-center text-[12px] text-crimson-300">{error}</p>}
      <button
        type="button"
        onClick={async () => {
          const res = await onSave(draft);
          if (res.ok) onClose();
          else setError(res.message);
        }}
        className="pressable mt-5 flex h-12 w-full items-center justify-center rounded-2xl bg-accent text-[15px] font-black text-on-accent shadow-glow"
      >
        {t("friend.save")}
      </button>
      <button
        type="button"
        onClick={async () => {
          const res = await onDisband();
          if (!res.ok) setError(res.message);
        }}
        className="pressable mt-2 flex h-11 w-full items-center justify-center rounded-2xl text-[13px] font-bold text-crimson-300"
      >
        {t("friend.disband")}
      </button>
    </Sheet>
  );
}

/** ルームから外れた(キック・解散・時間切れ)。ホームへ戻る。 */
export function PrivateClosedNotice({ reason, message, onHome }: { reason: PrivateClosedReason; message?: string; onHome: () => void }) {
  const { t } = useI18n();
  const key = reason === "KICKED" ? "friend.closed.KICKED" : reason === "EXPIRED" ? "friend.closed.EXPIRED" : "friend.closed.DISBANDED";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={SPRING_SNAPPY}
        role="alertdialog"
        className="w-full max-w-[300px] rounded-2xl glass-sheet p-5 text-center shadow-e4"
      >
        <p className="text-[14px] font-bold text-fg">{message ?? t(key)}</p>
        <button
          type="button"
          onClick={onHome}
          className="pressable mt-4 flex h-11 w-full items-center justify-center rounded-xl bg-accent text-[14px] font-black text-on-accent shadow-glow"
        >
          {t("friend.dismiss")}
        </button>
      </motion.div>
    </div>
  );
}

/**
 * 観戦中のバー(アクションバーの場所。高さは同じ 132px)。席の無い人・飛んだ人が卓を見ている間に出す。
 * まだリエントリーできる人にはリエントリーのボタンも出す。
 */
export function PrivateWatchBar({
  canSeeCards,
  canReEntry,
  onReEntry,
  onLeave,
}: {
  canSeeCards: boolean;
  canReEntry: boolean;
  onReEntry: () => void;
  onLeave: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="safe-area-bottom px-3 pb-2 pt-1">
      <div className="mx-auto flex h-[132px] max-w-md flex-col justify-between gap-[5px] px-3 py-2">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span className="flex items-center gap-1.5 text-[13px] font-bold text-fg">
            <Icon name="eye" className="h-4 w-4 text-fg-2" />
            {t("friend.watching")}
          </span>
          <span className="mt-1 text-[11px] font-semibold text-fg-3">{canSeeCards ? t("friend.watchingCards") : t("friend.watchingWait")}</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onLeave}
            className="pressable flex h-[50px] flex-1 items-center justify-center rounded-2xl bg-white/[0.05] text-[13px] font-bold text-fg-2 shadow-e1 ring-1 ring-inset ring-white/10"
          >
            {t("friend.leave")}
          </button>
          {canReEntry && (
            <button
              type="button"
              onClick={onReEntry}
              className="pressable flex h-[50px] flex-1 items-center justify-center gap-1.5 rounded-2xl bg-accent text-[14px] font-black text-on-accent shadow-glow"
            >
              <Icon name="refresh" className="h-4 w-4" />
              {t("friend.reentry.yes")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 最後の1人が残ったときの「リエントリーしますか?」(15秒で優勝が決まる)。 */
export function PrivateReentryPrompt({ endsAt, onYes, onNo }: { endsAt: number; onYes: () => void; onNo: () => void }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={SPRING_SNAPPY}
        role="alertdialog"
        className="w-full max-w-[320px] rounded-2xl glass-sheet p-5 text-center shadow-e4"
      >
        <p className="text-[16px] font-black text-fg">{t("friend.reentry.ask")}</p>
        <p className="mt-1 text-[12px] font-semibold tabular-nums text-fg-2">{t("friend.reentry.left", { n: left })}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onNo} className="pressable h-11 rounded-xl bg-white/[0.06] text-[13px] font-bold text-fg-2 ring-1 ring-inset ring-white/10">
            {t("friend.reentry.no")}
          </button>
          <button type="button" onClick={onYes} className="pressable h-11 rounded-xl bg-accent text-[14px] font-black text-on-accent shadow-glow">
            {t("friend.reentry.yes")}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * 飛んだとき(フレンド対戦)。偏差値や収支は動かないので、順位だけを出し、観戦かリエントリーを選ぶ。
 */
export function PrivateBustedSheet({
  place,
  canReEntry,
  onWatch,
  onReEntry,
}: {
  place: number | null;
  canReEntry: boolean;
  onWatch: () => void;
  onReEntry: () => void;
}) {
  const { t } = useI18n();
  return (
    <Sheet onClose={onWatch} label={t("friend.result.title")}>
      <p className="text-center text-[11px] font-black tracking-[0.14em] text-fg-3">{t("friend.title")}</p>
      <p className="mt-2 text-center text-[22px] font-black tracking-tight text-fg">
        {place === 1 ? t("friend.result.won") : place ? t("friend.result.busted", { n: place }) : t("friend.result.title")}
      </p>
      <div className={`mt-5 grid gap-2 ${canReEntry ? "grid-cols-2" : "grid-cols-1"}`}>
        <button
          type="button"
          onClick={onWatch}
          className="pressable flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-white/[0.06] text-[14px] font-bold text-fg ring-1 ring-inset ring-white/10"
        >
          <Icon name="eye" className="h-4 w-4" />
          {t("friend.watch")}
        </button>
        {canReEntry && (
          <button
            type="button"
            onClick={onReEntry}
            className="pressable flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-accent text-[14px] font-black text-on-accent shadow-glow"
          >
            <Icon name="refresh" className="h-4 w-4" />
            {t("friend.reentry.yes")}
          </button>
        )}
      </div>
    </Sheet>
  );
}

/**
 * 優勝が決まったあとの順位表。ホストは「もう一度」(同じコードの待合へ)か「解散」を選ぶ。
 * ほかの人はホストの選択を待つ(いつでもルームを出られる)。
 */
export function PrivateStandingsSheet({
  room,
  onRematch,
  onDisband,
  onLeave,
}: {
  room: PrivateRoomInfo;
  onRematch: () => Promise<PrivateAck>;
  onDisband: () => Promise<PrivateAck>;
  onLeave: () => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const standings = room.standings ?? [];
  const run = async (fn: () => Promise<PrivateAck>) => {
    setError(null);
    const res = await fn();
    if (!res.ok) setError(res.message);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
      <motion.div
        role="dialog"
        aria-label={t("friend.result.title")}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        transition={SPRING_SNAPPY}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto glass-sheet rounded-t-sheet p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-e4"
      >
        <p className="text-[11px] font-black tracking-[0.14em] text-fg-3">{t("friend.title")}</p>
        <h2 className="mt-1 text-[20px] font-black tracking-tight text-fg">{t("friend.result.title")}</h2>
        <ol className="mt-3">
          {standings.map((s) => (
            <li
              key={`${s.userId}-${s.place}`}
              className={`list-row flex items-center gap-3 py-2.5 ${s.userId === room.youUserId ? "bg-accent/10" : ""}`}
              style={{ ["--row-inset" as string]: "84px" }}
            >
              <span className={`w-9 shrink-0 text-right text-[15px] font-black tabular-nums ${s.place === 1 ? "text-accent" : "text-fg-2"}`}>
                {t("friend.result.place", { n: s.place })}
              </span>
              <Avatar avatarKey={s.avatarKey} displayName={s.displayName} size={32} />
              <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-fg">{s.displayName}</span>
            </li>
          ))}
        </ol>
        {error && <p className="mt-3 text-center text-[12px] text-crimson-300">{error}</p>}
        {room.isHost ? (
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void run(onDisband)}
              className="pressable h-12 rounded-2xl bg-white/[0.06] text-[14px] font-bold text-fg-2 ring-1 ring-inset ring-white/10"
            >
              {t("friend.disband")}
            </button>
            <button
              type="button"
              onClick={() => void run(onRematch)}
              className="pressable flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-accent text-[15px] font-black text-on-accent shadow-glow"
            >
              <Icon name="refresh" className="h-4 w-4" />
              {t("friend.rematch")}
            </button>
          </div>
        ) : (
          <>
            <p className="mt-5 text-center text-[12px] font-semibold text-fg-3">{t("friend.hostChoosing")}</p>
            <button
              type="button"
              onClick={onLeave}
              className="pressable mt-2 flex h-12 w-full items-center justify-center rounded-2xl bg-white/[0.06] text-[14px] font-bold text-fg-2 ring-1 ring-inset ring-white/10"
            >
              {t("friend.leave")}
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
