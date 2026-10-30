import { APP_VERSION } from "./version";

const SERVER_URL = process.env["NEXT_PUBLIC_SERVER_URL"] ?? "http://localhost:4000";

export type FeedbackKind = "request" | "bug" | "other" | "shareX";
export const FEEDBACK_MAX_IMAGES = 3;
/** 送る前に縮める目安(サーバーの上限 1.3MB より少し小さく)。 */
const TARGET_BYTES = 1_000_000;
const MAX_SIDE = 1600;

export type FeedbackResult = "ok" | "rate" | "already" | "error";

/**
 * 写真を端末側で縮小して JPEG にする(長辺 1600px、1MB 以下になるまで画質を下げる)。
 * HEIC など読めない形式は null(呼び出し側で黙って外す)。
 */
export async function compressImage(file: File): Promise<{ dataUrl: string; bytes: number } | null> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  let w = Math.max(1, Math.round(bitmap.width * scale));
  let h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  for (let attempt = 0; attempt < 6; attempt++) {
    canvas.width = w;
    canvas.height = h;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    for (const q of [0.85, 0.75, 0.65, 0.55]) {
      const dataUrl = canvas.toDataURL("image/jpeg", q);
      const bytes = Math.floor(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);
      if (bytes <= TARGET_BYTES) {
        bitmap.close();
        return { dataUrl, bytes };
      }
    }
    w = Math.round(w * 0.75);
    h = Math.round(h * 0.75);
  }
  bitmap.close();
  return null;
}

export async function sendFeedback(
  accessToken: string,
  input: { kind: FeedbackKind; body: string; images: string[] },
): Promise<FeedbackResult> {
  try {
    const res = await fetch(`${SERVER_URL}/api/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        kind: input.kind,
        body: input.body,
        appVersion: APP_VERSION,
        images: input.images.map((data) => ({ data })),
      }),
    });
    if (res.status === 429) return "rate";
    if (res.status === 409) return "already";
    return res.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}

/** 「Xでシェアしてゴールド GET」の自分の状態。取れなければ null(ボタンは出したままにする)。 */
export type ShareCampaignStatus = "none" | "pending" | "granted";
export async function fetchShareCampaignStatus(accessToken: string): Promise<ShareCampaignStatus | null> {
  try {
    const res = await fetch(`${SERVER_URL}/api/feedback/share-status`, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const j = (await res.json()) as { status?: ShareCampaignStatus };
    return j.status ?? null;
  } catch {
    return null;
  }
}
