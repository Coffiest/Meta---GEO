"use client";

/**
 * 効果音(chess.com のような短く控えめな音。オーナー指示 2026-11-14)。
 * 音の素材ファイルは使わず、Web Audio でその場で合成する(他社の音源は使わない。容量もゼロ)。
 * 設定は端末ごと(localStorage "sfx" = "off" で消音。既定は鳴らす)。
 * iOS は最初のタップまで音を出せないので、最初の pointerdown で AudioContext を起こす。
 */
export type SfxKind = "move" | "chip" | "fold" | "turn" | "win" | "end";

let ctx: AudioContext | null = null;
let unlocked = false;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

if (typeof window !== "undefined") {
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    void audio()?.resume();
  };
  window.addEventListener("pointerdown", unlock, { once: true, capture: true });
}

export function sfxEnabled(): boolean {
  try {
    return localStorage.getItem("sfx") !== "off";
  } catch {
    return true;
  }
}

export function setSfxEnabled(on: boolean): void {
  try {
    localStorage.setItem("sfx", on ? "on" : "off");
  } catch {
    /* 保存できなくても鳴らす/鳴らさないはこの場で効く */
  }
}

/** 短い音を1つ。周波数を落としながら減衰させる。 */
function tone(c: AudioContext, at: number, freq: number, endFreq: number, dur: number, gain: number, type: OscillatorType = "sine") {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  o.frequency.exponentialRampToValueAtTime(endFreq, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

/** 木を軽く叩いたような雑音の粒(駒を置く音・チップの音)。 */
function knock(c: AudioContext, at: number, center: number, dur: number, gain: number) {
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = center;
  bp.Q.value = 3;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(c.destination);
  src.start(at);
}

export function playSfx(kind: SfxKind): void {
  if (!sfxEnabled()) return;
  const c = audio();
  if (!c || c.state === "suspended") return;
  const t = c.currentTime + 0.005;
  switch (kind) {
    case "move": // カードが開く・置かれる: 低めの「コトッ」
      knock(c, t, 900, 0.07, 0.9);
      tone(c, t, 220, 140, 0.08, 0.12);
      break;
    case "chip": // ベット・コール: 硬い「カチャッ」を2つ
      knock(c, t, 3200, 0.04, 0.6);
      knock(c, t + 0.045, 2600, 0.05, 0.45);
      break;
    case "fold": // フォールド: 小さく下がる音
      knock(c, t, 600, 0.09, 0.35);
      break;
    case "turn": // 自分の番: 2音の合図
      tone(c, t, 660, 660, 0.12, 0.12);
      tone(c, t + 0.13, 880, 880, 0.16, 0.12);
      break;
    case "win": // ポットを取った: 上がる3音
      tone(c, t, 523, 523, 0.14, 0.1, "triangle");
      tone(c, t + 0.1, 659, 659, 0.14, 0.1, "triangle");
      tone(c, t + 0.2, 784, 784, 0.24, 0.12, "triangle");
      break;
    case "end": // トーナメントが終わった
      tone(c, t, 392, 392, 0.3, 0.12, "triangle");
      tone(c, t + 0.18, 523, 523, 0.45, 0.12, "triangle");
      break;
  }
}
