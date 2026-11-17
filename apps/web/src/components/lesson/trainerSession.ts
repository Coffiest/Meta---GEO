import type { TrainerSettings } from "./TrainerTab";

/**
 * 特訓の進み具合を端末に残す。iOS はアプリを裏に回すと画面を作り直すことがあり、
 * 戻ると特訓が終わっていた(オーナー指摘)。開いたときに残っていれば続きから始める。
 */
export type TrainerSession = {
  settings: TrainerSettings;
  hand: unknown;
  handsPlayed: number;
  n: number;
  scoreSum: number;
  evLoss: number;
  savedAt: number;
};

const KEY = "pokerart.trainer.session.v1";
const TTL_MS = 12 * 60 * 60 * 1000;

export function loadTrainerSession(): TrainerSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as TrainerSession;
    if (!s || typeof s.savedAt !== "number" || Date.now() - s.savedAt > TTL_MS) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveTrainerSession(s: Omit<TrainerSession, "savedAt">): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, savedAt: Date.now() }));
  } catch {
    // 保存できなくても続ける
  }
}

export function clearTrainerSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 何もしない
  }
}
