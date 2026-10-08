"use client";

import { createContext, useContext, type ReactNode } from "react";
import { REVIEW_SPEAKER, RAFU_SPEAKER, type ReviewSpeaker } from "@/data/reviewSpeaker";
import { toKansai } from "@/lib/kansai";

/** 解説の話し手と、その口調への変換。自分の決定はバリィ、相手の決定はラフくん(関西弁)。 */
export interface SpeakerVoice {
  speaker: ReviewSpeaker | null;
  /** 画像の縦横比(幅 / 高さ)。 */
  aspect: string;
  say: (text: string) => string;
}

const BALLY: SpeakerVoice = { speaker: REVIEW_SPEAKER, aspect: "331 / 419", say: (t) => t };
const RAFU: SpeakerVoice = { speaker: RAFU_SPEAKER, aspect: "318 / 420", say: toKansai };

const SpeakerContext = createContext<SpeakerVoice>(BALLY);

export function useSpeaker(): SpeakerVoice {
  return useContext(SpeakerContext);
}

/** この中の解説はラフくんが関西弁で話す。 */
export function RafuVoice({ children }: { children: ReactNode }) {
  return <SpeakerContext.Provider value={RAFU}>{children}</SpeakerContext.Provider>;
}
