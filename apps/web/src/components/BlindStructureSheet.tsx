"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BLIND_STRUCTURE } from "@meta-geo/engine/src/blindStructure.js";
import type { LevelInfo, TournamentInfo } from "@/lib/socket";

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/** levelEndsAtまでの残り時間を1秒ごとに更新して mm:ss で返す。 */
function useClock(endsAt: number | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  if (endsAt === null) return "--:--";
  return formatClock(endsAt - now);
}

/**
 * トーナメントクロック画面。プレイ画面左上のタイマーボタンから開く。
 * 大きなカウントダウン + BLIND/ANTE + PLAYERS(残り/総数) + AVERAGE を表示し、
 * プライズ(ペイアウト)とブラインド表はタップで開閉する。RRPokerのクロック画面を参考にした
 * 白地・黒枠線のSwissデザイン。
 */
export function BlindStructureSheet({
  currentLevel,
  level,
  levelEndsAt,
  tournamentInfo,
  gameLabel,
  onClose,
}: {
  currentLevel?: number;
  level?: LevelInfo | null;
  levelEndsAt?: number | null;
  tournamentInfo?: TournamentInfo | null;
  gameLabel?: string;
  onClose: () => void;
}) {
  const [view, setView] = useState<"clock" | "prize" | "structure">("clock");
  const clock = useClock(levelEndsAt ?? null);
  const lv = level?.level ?? currentLevel ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-t-2xl border border-ink-950 bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+20px)]"
      >
        {/* ヘッダー: タイトル + LEVEL + 閉じる */}
        <div className="mb-3 flex items-start justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-black tracking-tight text-ink-950">{gameLabel ?? "トーナメント"}</h2>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-600">LEVEL {lv}</p>
          </div>
          <button onClick={onClose} className="shrink-0 text-[12px] font-semibold text-ink-500">
            閉じる
          </button>
        </div>

        {/* 大きなカウントダウン */}
        <div className="text-center">
          <span className="block font-black tabular-nums leading-none text-gold-600" style={{ fontSize: "clamp(64px, 22vw, 104px)" }}>
            {clock}
          </span>
        </div>
        <div className="my-4 h-px bg-ink-200" />

        {/* BLIND / ANTE */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-ink-400">Blind</p>
            <p className="text-[26px] font-black tabular-nums leading-none text-ink-950">
              {level ? `${level.smallBlind.toLocaleString()}/${level.bigBlind.toLocaleString()}` : "—"}
            </p>
          </div>
          <div className="border-l border-ink-200 pl-4 text-right">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-ink-400">ANTE</p>
            <p className="text-[26px] font-black tabular-nums leading-none text-ink-950">
              {level && level.bbAnte > 0 ? level.bbAnte.toLocaleString() : "—"}
            </p>
          </div>
        </div>

        {/* NEXT BREAK(このストラクチャーにブレイクは無い) */}
        <div className="mt-4 flex items-center gap-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-400 leading-tight">
            Next
            <br />
            Break
          </p>
          <p className="text-[15px] font-bold text-ink-400">なし</p>
        </div>

        {/* PLAYERS / AVERAGE */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-ink-950 px-3 py-2.5 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-400">Players</p>
            <p className="text-[22px] font-black tabular-nums leading-tight text-ink-950">
              {tournamentInfo ? `${tournamentInfo.remaining} / ${tournamentInfo.total}` : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-ink-950 px-3 py-2.5 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-400">Average</p>
            <p className="text-[22px] font-black tabular-nums leading-tight text-ink-950">
              {tournamentInfo ? tournamentInfo.averageStack.toLocaleString() : "—"}
            </p>
          </div>
        </div>

        {/* プライズ / ブラインド表 の切替ボタン */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setView((v) => (v === "prize" ? "clock" : "prize"))}
            className={`flex-1 rounded-full border py-2.5 text-[12px] font-black transition-colors ${
              view === "prize" ? "border-ink-950 bg-ink-950 text-white" : "border-ink-950 bg-white text-ink-950"
            }`}
          >
            プライズ
          </button>
          <button
            onClick={() => setView((v) => (v === "structure" ? "clock" : "structure"))}
            className={`flex-1 rounded-full border py-2.5 text-[12px] font-black transition-colors ${
              view === "structure" ? "border-ink-950 bg-ink-950 text-white" : "border-ink-950 bg-white text-ink-950"
            }`}
          >
            ブラインド表
          </button>
        </div>

        <AnimatePresence mode="wait">
          {view === "prize" && (
            <motion.div
              key="prize"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4">
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.28em] text-ink-400">Prize Pool</p>
                {tournamentInfo && tournamentInfo.prizePool.length > 0 ? (
                  <ul className="space-y-1.5">
                    {tournamentInfo.prizePool.map((p) => (
                      <li key={p.place} className="flex items-center justify-between rounded-xl border border-ink-200 px-3 py-2">
                        <span className="text-[13px] font-black text-ink-950">{p.place}位</span>
                        <span className="text-[14px] font-black tabular-nums text-gold-700">{p.amount.toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-4 text-center text-sm text-ink-400">プライズ情報がありません。</p>
                )}
              </div>
            </motion.div>
          )}

          {view === "structure" && (
            <motion.div
              key="structure"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4">
                <table className="w-full text-xs tabular-nums">
                  <thead>
                    <tr className="text-ink-400 text-[10px]">
                      <th className="text-left py-1.5 font-bold">Lv</th>
                      <th className="text-right py-1.5 font-bold">SB</th>
                      <th className="text-right py-1.5 font-bold">BB</th>
                      <th className="text-right py-1.5 font-bold">ANTE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BLIND_STRUCTURE.map((row) => (
                      <tr
                        key={row.level}
                        className={`border-t border-ink-100 ${row.level === lv ? "text-gold-700 font-black" : "text-ink-700"}`}
                      >
                        <td className="py-1.5">{row.level === lv ? `▶ ${row.level}` : row.level}</td>
                        <td className="text-right py-1.5">{row.smallBlind.toLocaleString()}</td>
                        <td className="text-right py-1.5">{row.bigBlind.toLocaleString()}</td>
                        <td className="text-right py-1.5">{row.bbAnte.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-[11px] text-ink-400">
                  最終レベル以降は優勝者が決まるまで同じ比率でブラインドが上がり続けます。
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
