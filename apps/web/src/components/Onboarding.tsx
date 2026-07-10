"use client";

import { useRef, useState } from "react";
import { Avatar } from "./Avatar";

const MAX_AVATAR_DIMENSION = 256;
const AVATAR_JPEG_QUALITY = 0.75;

/** カメラロールから選んだ画像を正方形に切り抜いてリサイズし、data URI(JPEG)にする。 */
function fileToAvatarDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = MAX_AVATAR_DIMENSION;
        canvas.height = MAX_AVATAR_DIMENSION;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("画像の処理に失敗しました"));
          return;
        }
        ctx.drawImage(img, sx, sy, size, size, 0, 0, MAX_AVATAR_DIMENSION, MAX_AVATAR_DIMENSION);
        resolve(canvas.toDataURL("image/jpeg", AVATAR_JPEG_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * 初回オンボーディング / プロフィール編集画面。名前は必須、アイコンはカメラロールから
 * 選ぶ任意項目(未設定なら頭文字アバターになる)。この画面を通過しない限りロビーは
 * 描画されないため、名前設定のスキップは構造的に不可能。
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
  onSubmit: (params: { displayName: string; avatarKey: string | null }) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [avatarKey, setAvatarKey] = useState<string | null>(initialAvatarKey);
  const [processing, setProcessing] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canSubmit = name.trim().length > 0 && !saving && !processing;

  const handlePickFile = async (file: File | undefined) => {
    if (!file) return;
    setPickError(null);
    setProcessing(true);
    try {
      setAvatarKey(await fileToAvatarDataUri(file));
    } catch {
      setPickError("画像を設定できませんでした。別の画像でお試しください。");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 gap-7 bg-white">
      <div className="text-center space-y-1.5">
        <div className="text-[11px] tracking-[0.3em] text-ink-500 font-semibold">
          POKER <span className="text-gold-600">ART</span>
        </div>
        <h1 className="text-xl font-semibold text-ink-950">{title}</h1>
        <p className="text-xs text-ink-700">テーブルで表示される名前を入力してください(アイコンは任意です)</p>
      </div>

      <div className="w-full max-w-xs space-y-5">
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="relative active:scale-95 transition-transform"
            aria-label="アイコン画像を選択"
          >
            <Avatar avatarKey={avatarKey} displayName={name} size={84} />
            <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-ink-950 ring-2 ring-white flex items-center justify-center text-white text-xs">
              📷
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void handlePickFile(e.target.files?.[0])}
          />
          <div className="flex items-center gap-3 text-xs">
            <button onClick={() => fileInputRef.current?.click()} className="text-ink-950 font-semibold underline decoration-dashed underline-offset-2">
              {processing ? "処理中…" : avatarKey ? "写真を変更" : "写真を選ぶ(任意)"}
            </button>
            {avatarKey && (
              <button onClick={() => setAvatarKey(null)} className="text-ink-600">
                削除
              </button>
            )}
          </div>
          {pickError && <p className="text-xs text-crimson-500">{pickError}</p>}
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="プレイヤー名(16文字まで)"
          maxLength={16}
          className="w-full rounded-xl bg-white border border-ink-300 px-4 py-3 text-sm text-ink-950 placeholder:text-ink-500 focus:outline-none focus:border-ink-950"
        />

        {error && <p className="text-xs text-crimson-500 px-1">{error}</p>}

        <button
          onClick={() => canSubmit && onSubmit({ displayName: name.trim(), avatarKey })}
          disabled={!canSubmit}
          className="w-full rounded-xl bg-ink-950 text-white font-semibold py-3 active:scale-[0.98] transition-transform disabled:opacity-40"
        >
          {saving ? "保存中…" : submitLabel}
        </button>

        {onCancel && (
          <button onClick={onCancel} className="w-full text-xs text-ink-700 py-1">
            キャンセル
          </button>
        )}
      </div>
    </div>
  );
}
