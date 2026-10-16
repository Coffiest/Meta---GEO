"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SPRING_MOVE, SPRING_SHEET, SPRING_SNAPPY } from "@/lib/motion";
import { useI18n } from "@/lib/i18n";
import { SegmentedTabs } from "../ui/SegmentedTabs";
import { Icon } from "../Icon";
import {
  BLIND_SPEEDS,
  DEFAULT_PRIVATE_SETTINGS,
  type BlindSpeed,
  type PrivateIntent,
  type PrivateRoomSettings,
} from "@/lib/privateRoom";

/**
 * ホームの「フレンド対戦」ボタン。意匠は Play / High Roller と全く同じ(オーナー指示)。
 * 押すと下からシートが出て、「ルームを作成」「ルームに入室」を選ぶ。
 */
export function FriendMatchButton({ onEnter }: { onEnter: (intent: PrivateIntent) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING_MOVE, delay: 0.2 }}
        className="pressable-lg w-full"
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("friend.title")}
          className="line-fill-btn flex w-full items-center gap-4 px-5 py-4 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[19px] font-black leading-none tracking-[-0.02em]">{t("friend.title")}</span>
            <span className="mt-1.5 block truncate text-[12px] font-bold uppercase tracking-[0.08em] opacity-70">{t("friend.sub")}</span>
          </span>
          <Icon name="arrow-right" className="line-fill-arrow h-5 w-5 shrink-0" />
        </button>
      </motion.div>
      <AnimatePresence>
        {open && (
          <FriendSheet
            onClose={() => setOpen(false)}
            onEnter={(intent) => {
              setOpen(false);
              onEnter(intent);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/** 下から出るシートの外枠(ほかのシートと同じ素材・同じばね)。 */
export function Sheet({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70"
    >
      <motion.div
        role="dialog"
        aria-label={label}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={SPRING_SHEET}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto glass-sheet rounded-t-sheet p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-e4"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function SheetHeader({ title, onBack, onClose }: { title: string; onBack?: () => void; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="mb-4 flex items-center gap-2">
      {onBack ? (
        <button type="button" onClick={onBack} aria-label={t("common.back")} className="pressable -ml-1 grid h-8 w-8 place-items-center rounded-full text-fg-2">
          <Icon name="chevron-left" className="h-5 w-5" />
        </button>
      ) : null}
      <h2 className="min-w-0 flex-1 truncate text-[18px] font-black tracking-tight text-fg">{title}</h2>
      <button type="button" onClick={onClose} aria-label={t("common.close")} className="pressable grid h-8 w-8 place-items-center rounded-full bg-white/[0.08] text-fg-2">
        <Icon name="close" className="h-4 w-4" />
      </button>
    </div>
  );
}

function FriendSheet({ onClose, onEnter }: { onClose: () => void; onEnter: (intent: PrivateIntent) => void }) {
  const { t } = useI18n();
  const [step, setStep] = useState<"choose" | "create" | "join">("choose");
  const [settings, setSettings] = useState<PrivateRoomSettings>(DEFAULT_PRIVATE_SETTINGS);

  return (
    <Sheet onClose={onClose} label={t("friend.title")}>
      {step === "choose" && (
        <>
          <SheetHeader title={t("friend.title")} onClose={onClose} />
          <div className="space-y-2.5">
            <ChoiceRow icon="plus" title={t("friend.create")} desc={t("friend.create.desc")} onClick={() => setStep("create")} />
            <ChoiceRow icon="group" title={t("friend.join")} desc={t("friend.join.desc")} onClick={() => setStep("join")} />
          </div>
          <p className="mt-4 text-center text-[11px] text-fg-3">{t("friend.note")}</p>
        </>
      )}
      {step === "create" && (
        <>
          <SheetHeader title={t("friend.create")} onBack={() => setStep("choose")} onClose={onClose} />
          <PrivateSettingsForm value={settings} onChange={setSettings} />
          <button
            type="button"
            onClick={() => onEnter({ mode: "create", settings })}
            className="pressable mt-5 flex h-12 w-full items-center justify-center rounded-2xl bg-accent text-[15px] font-black text-on-accent shadow-glow"
          >
            {t("friend.makeTable")}
          </button>
          <p className="mt-3 text-center text-[11px] text-fg-3">{t("friend.note")}</p>
        </>
      )}
      {step === "join" && (
        <>
          <SheetHeader title={t("friend.join")} onBack={() => setStep("choose")} onClose={onClose} />
          <JoinForm onJoin={(code) => onEnter({ mode: "join", code })} />
        </>
      )}
    </Sheet>
  );
}

function ChoiceRow({ icon, title, desc, onClick }: { icon: "plus" | "group"; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pressable-lg flex w-full items-center gap-3.5 rounded-2xl bg-white/[0.06] px-4 py-3.5 text-left ring-1 ring-inset ring-white/10"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-fg">{title}</span>
        <span className="mt-0.5 block text-[12px] text-fg-2">{desc}</span>
      </span>
      <Icon name="chevron-right" className="h-4 w-4 shrink-0 text-fg-3" />
    </button>
  );
}

/** 6桁のコードの入力。数字以外は落とし、6桁そろったら入室できる。 */
function JoinForm({ onJoin }: { onJoin: (code: string) => void }) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const ready = code.length === 6;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onJoin(code);
      }}
    >
      <label className="block text-[12px] font-bold text-fg-2" htmlFor="friend-room-code">
        {t("friend.code")}
      </label>
      <input
        ref={inputRef}
        id="friend-room-code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        placeholder="000000"
        className="mt-2 h-14 w-full rounded-2xl bg-white/[0.06] text-center text-[28px] font-black tabular-nums tracking-[0.3em] text-fg ring-1 ring-inset ring-white/10 placeholder:text-fg-faint focus:outline-none focus:ring-accent"
      />
      <button
        type="submit"
        disabled={!ready}
        className={`pressable mt-5 flex h-12 w-full items-center justify-center rounded-2xl text-[15px] font-black transition-colors ${
          ready ? "bg-accent text-on-accent shadow-glow" : "bg-white/[0.06] text-fg-3"
        }`}
      >
        {t("friend.enter")}
      </button>
    </form>
  );
}

/** ルームの設定(作るときと、待合でホストが変えるときの両方で使う)。 */
export function PrivateSettingsForm({ value, onChange }: { value: PrivateRoomSettings; onChange: (next: PrivateRoomSettings) => void }) {
  const { t } = useI18n();
  const set = (patch: Partial<PrivateRoomSettings>) => {
    const next = { ...value, ...patch };
    // 自動で埋める席は「最大人数 − 1」まで(サーバーと同じ範囲)。
    next.autoSeats = Math.min(next.autoSeats, next.maxPlayers - 1);
    onChange(next);
  };
  const speed = BLIND_SPEEDS.find((b) => b.key === value.blind)!;
  const reentryOptions: (number | null)[] = [1, 2, 3, 4, 5, null];
  const reentryIndex = reentryOptions.indexOf(value.reentryLimit);

  return (
    <div className="space-y-4">
      <Row label={t("friend.maxPlayers")}>
        <Stepper
          value={t("friend.players", { n: value.maxPlayers })}
          onMinus={value.maxPlayers > 2 ? () => set({ maxPlayers: value.maxPlayers - 1 }) : undefined}
          onPlus={value.maxPlayers < 6 ? () => set({ maxPlayers: value.maxPlayers + 1 }) : undefined}
        />
      </Row>

      <div>
        <p className="mb-2 text-[13px] font-bold text-fg">{t("friend.blind")}</p>
        <SegmentedTabs<BlindSpeed>
          ariaLabel={t("friend.blind")}
          items={BLIND_SPEEDS.map((b) => ({ key: b.key, label: t(`friend.blind.${b.key}`) }))}
          value={value.blind}
          onChange={(blind) => set({ blind })}
        />
        <p className="mt-1.5 text-center text-[11px] tabular-nums text-fg-3">{t("friend.blind.meta", { min: speed.minutes, bb: speed.bb })}</p>
      </div>

      <ToggleBlock label={t("friend.lateEntry")} on={value.lateEntry} onToggle={(lateEntry) => set({ lateEntry })}>
        <Stepper
          value={t("friend.lateUntil", { n: value.lateEntryUntilLevel })}
          onMinus={value.lateEntryUntilLevel > 1 ? () => set({ lateEntryUntilLevel: value.lateEntryUntilLevel - 1 }) : undefined}
          onPlus={value.lateEntryUntilLevel < 10 ? () => set({ lateEntryUntilLevel: value.lateEntryUntilLevel + 1 }) : undefined}
        />
      </ToggleBlock>

      <ToggleBlock label={t("friend.reentry")} on={value.reentry} onToggle={(reentry) => set({ reentry })}>
        <Stepper
          value={value.reentryLimit === null ? t("friend.unlimited") : t("friend.times", { n: value.reentryLimit })}
          onMinus={reentryIndex > 0 ? () => set({ reentryLimit: reentryOptions[reentryIndex - 1]! }) : undefined}
          onPlus={reentryIndex < reentryOptions.length - 1 ? () => set({ reentryLimit: reentryOptions[reentryIndex + 1] ?? null }) : undefined}
        />
      </ToggleBlock>

      <ToggleBlock
        label={t("friend.autoSeats")}
        on={value.autoSeats > 0}
        onToggle={(on) => set({ autoSeats: on ? Math.max(1, value.maxPlayers - 2) : 0 })}
      >
        <Stepper
          value={t("friend.seats", { n: value.autoSeats })}
          onMinus={value.autoSeats > 1 ? () => set({ autoSeats: value.autoSeats - 1 }) : undefined}
          onPlus={value.autoSeats < value.maxPlayers - 1 ? () => set({ autoSeats: value.autoSeats + 1 }) : undefined}
        />
      </ToggleBlock>

      <Row label={t("friend.chat")}>
        <Switch on={value.chat} onToggle={(chat) => set({ chat })} label={t("friend.chat")} />
      </Row>
      <Row label={t("friend.timeBank")}>
        <Switch on={value.timeBank} onToggle={(timeBank) => set({ timeBank })} label={t("friend.timeBank")} />
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[40px] items-center justify-between gap-3">
      <span className="text-[13px] font-bold text-fg">{label}</span>
      {children}
    </div>
  );
}

/** オン/オフの行。オンのときだけ下に詳細(何レベルまで・何回など)を出す。 */
function ToggleBlock({ label, on, onToggle, children }: { label: string; on: boolean; onToggle: (on: boolean) => void; children: ReactNode }) {
  return (
    <div>
      <Row label={label}>
        <Switch on={on} onToggle={onToggle} label={label} />
      </Row>
      <AnimatePresence initial={false}>
        {on && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING_MOVE}
            className="overflow-hidden"
          >
            <div className="flex justify-end pt-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** iOS と同じ形のスイッチ。オンはアクセント色、つまみはばねで動く。 */
function Switch({ on, onToggle, label }: { on: boolean; onToggle: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onToggle(!on)}
      className={`pressable relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ${on ? "bg-accent" : "bg-white/[0.16]"}`}
    >
      <motion.span
        className="absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-e1"
        animate={{ x: on ? 20 : 0 }}
        transition={SPRING_SNAPPY}
      />
    </button>
  );
}

function Stepper({ value, onMinus, onPlus }: { value: string; onMinus?: () => void; onPlus?: () => void }) {
  const btn = (enabled: boolean) =>
    `pressable grid h-8 w-8 place-items-center rounded-lg ring-1 ring-inset ring-white/10 ${enabled ? "bg-white/[0.08] text-fg" : "bg-white/[0.03] text-fg-faint"}`;
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onMinus} disabled={!onMinus} aria-label="-" className={btn(Boolean(onMinus))}>
        <Icon name="minus" className="h-4 w-4" />
      </button>
      <span className="min-w-[88px] text-center text-[13px] font-bold tabular-nums text-fg">{value}</span>
      <button type="button" onClick={onPlus} disabled={!onPlus} aria-label="+" className={btn(Boolean(onPlus))}>
        <Icon name="plus" className="h-4 w-4" />
      </button>
    </div>
  );
}
