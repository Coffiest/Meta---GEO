"use client";

import { useState } from "react";
import { HUMAN_AVATARS } from "@/lib/avatars";
import { Avatar } from "./Avatar";

/**
 * 初回オンボーディング / プロフィール編集画面。名前とアバターの両方を決めるまで先に進めない
 * (この画面を通過しない限りロビーは描画されないため、スキップは構造的に不可能)。
 */
export function Onboarding({
  title = "プロフィールを設定",
  initialName = "",
  initialAvatarKey = null,
  submitLabel = "はじめる",
  saving = false,
  error = null,
  onSubmit,
  onCancel,
}: {
  title?: string;
  initialName?: string;
  initialAvatarKey?: string | null;
  submitLabel?: string;
  saving?: boolean;
  error?: string | null;
  onSubmit: (params: { displayName: string; avatarKey: string }) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [avatarKey, setAvatarKey] = useState<string | null>(initialAvatarKey);
  const canSubmit = name.trim().length > 0 && avatarKey !== null && !saving;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 gap-7 bg-navy-950">
      <div className="text-center space-y-1.5">
        <div className="text-[11px] tracking-[0.3em] text-mint-500 font-medium">TEN FOUR POKER</div>
        <h1 className="text-xl font-semibold text-navy-50">{title}</h1>
        <p className="text-xs text-navy-400">テーブルで表示される名前とアイコンを選んでください</p>
      </div>

      <div className="w-full max-w-xs space-y-5">
        <div className="flex justify-center">
          <Avatar avatarKey={avatarKey} size={72} />
        </div>

        <div className="grid grid-cols-6 gap-2">
          {HUMAN_AVATARS.map((a) => (
            <button
              key={a.key}
              onClick={() => setAvatarKey(a.key)}
              className={`rounded-full transition-transform active:scale-90 ${
                avatarKey === a.key ? "ring-2 ring-mint-400 scale-105" : "ring-1 ring-navy-700 opacity-80"
              }`}
              aria-label={a.key}
            >
              <Avatar avatarKey={a.key} size={44} />
            </button>
          ))}
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="プレイヤー名(16文字まで)"
          maxLength={16}
          className="w-full rounded-xl bg-navy-900 ring-1 ring-navy-700 px-4 py-3 text-sm text-navy-50 placeholder:text-navy-500 focus:outline-none focus:ring-mint-500"
        />

        {error && <p className="text-xs text-crimson-400 px-1">{error}</p>}

        <button
          onClick={() => canSubmit && avatarKey && onSubmit({ displayName: name.trim(), avatarKey })}
          disabled={!canSubmit}
          className="w-full rounded-xl bg-mint-500 text-white font-semibold py-3 shadow-card active:scale-[0.98] transition-transform disabled:opacity-40"
        >
          {saving ? "保存中…" : submitLabel}
        </button>

        {onCancel && (
          <button onClick={onCancel} className="w-full text-xs text-navy-400 py-1">
            キャンセル
          </button>
        )}
      </div>
    </div>
  );
}
