"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SPRING_SHEET } from "@/lib/motion";
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
 * ダークテーマのカード意匠。
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
  const [view, setView] = useState<"clock" | "prize" | "structure" | "ranking">("clock");
  const clock = useClock(levelEndsAt ?? null);
  const lv = level?.level ?? currentLevel ?? 0;
  const regClose = tournamentInfo?.registrationClosesAt ?? null;
  const regCloseClock = useClock(!tournamentInfo?.registrationClosed ? regClose : null);
  const standings = tournamentInfo?.standings ?? [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70"
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={SPRING_SHEET}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[88vh] overflow-y-auto glass-sheet rounded-t-sheet p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-e4"
      >
        {/* ヘッダー: タイトル + LEVEL + 閉じる */}
        <div className="mb-3 flex items-start justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-black tracking-tight text-fg">{gameLabel ?? "トーナメント"}</h2>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-accent">LEVEL {lv}</p>
          </div>
          <button onClick={onClose} className="shrink-0 text-[12px] font-semibold text-fg-2">
            閉じる
          </button>
        </div>

        {/* 大きなカウントダウン */}
        <div className="text-center">
          <span className="block font-black tabular-nums leading-none text-accent" style={{ fontSize: "clamp(64px, 22vw, 104px)" }}>
            {clock}
          </span>
        </div>
        <div className="my-4 h-px bg-n-4" />

        {/* BLIND / ANTE */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-fg-3">Blind</p>
            <p className="text-[26px] font-black tabular-nums leading-none text-fg">
              {level ? `${level.smallBlind.toLocaleString()}/${level.bigBlind.toLocaleString()}` : "—"}
            </p>
          </div>
          <div className="border-l border-line pl-4 text-right">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-fg-3">ANTE</p>
            <p className="text-[26px] font-black tabular-nums leading-none text-fg">
              {level && level.bbAnte > 0 ? level.bbAnte.toLocaleString() : "—"}
            </p>
          </div>
        </div>

        {/* レジクローズまでのカウントダウン(MTT・RC前のみ)。RC後/FTのステータスも出す。 */}
        {regClose && !tournamentInfo?.registrationClosed ? (
          <div className="mt-4 flex items-center gap-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-fg-3 leading-tight">
              Reg
              <br />
              締切
            </p>
            <p className="text-[18px] font-black tabular-nums text-crimson-500">{regCloseClock}</p>
          </div>
        ) : tournamentInfo?.isFinalTable ? (
          <div className="mt-4">
            <span className="rounded-full bg-accent px-3 py-1 text-[11px] font-black tracking-widest text-on-accent">FINAL TABLE</span>
          </div>
        ) : tournamentInfo?.registrationClosed ? (
          <div className="mt-4">
            <span className="text-[12px] font-bold text-fg-3">レジストレーション終了</span>
          </div>
        ) : null}

        {/* PLAYERS / AVERAGE */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-line-strong px-3 py-2.5 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-fg-3">Players</p>
            <p className="text-[22px] font-black tabular-nums leading-tight text-fg">
              {tournamentInfo ? `${tournamentInfo.remaining} / ${tournamentInfo.total}` : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-line-strong px-3 py-2.5 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-fg-3">Average</p>
            <p className="text-[22px] font-black tabular-nums leading-tight text-fg">
              {tournamentInfo ? tournamentInfo.averageStack.toLocaleString() : "—"}
            </p>
          </div>
        </div>

        {/* 順位 / プライズ / ブラインド表 の切替ボタン */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setView((v) => (v === "ranking" ? "clock" : "ranking"))}
            className={`flex-1 rounded-full border py-2.5 text-[12px] font-black transition-colors ${
              view === "ranking" ? "border-line-strong bg-n-4 text-white" : "border-line-strong bg-surface text-fg"
            }`}
          >
            順位
          </button>
          <button
            onClick={() => setView((v) => (v === "prize" ? "clock" : "prize"))}
            className={`flex-1 rounded-full border py-2.5 text-[12px] font-black transition-colors ${
              view === "prize" ? "border-line-strong bg-n-4 text-white" : "border-line-strong bg-surface text-fg"
            }`}
          >
            プライズ
          </button>
          <button
            onClick={() => setView((v) => (v === "structure" ? "clock" : "structure"))}
            className={`flex-1 rounded-full border py-2.5 text-[12px] font-black transition-colors ${
              view === "structure" ? "border-line-strong bg-n-4 text-white" : "border-line-strong bg-surface text-fg"
            }`}
          >
            ブラインド表
          </button>
        </div>

        <AnimatePresence mode="wait">
          {view === "ranking" && (
            <motion.div
              key="ranking"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4">
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.28em] text-fg-3">Live Ranking(BB順)</p>
                {/* 全プレイヤーを同一の見た目で並べる。行の装飾で相手の種別が推測できてはいけない。 */}
                {standings.length > 0 ? (
                  <ul className="space-y-1">
                    {standings.map((s) => (
                      <li
                        key={s.userId}
                        className="flex items-center gap-2 rounded-xl border border-line-strong px-3 py-1.5"
                      >
                        <span className="w-6 shrink-0 text-[12px] font-black tabular-nums text-accent">{s.rank}</span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-fg">{s.displayName}</span>
                        <span className="shrink-0 text-[13px] font-black tabular-nums text-fg">
                          {s.bbStack.toLocaleString()}
                          <span className="text-[9px] text-fg-3">BB</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-4 text-center text-sm text-fg-3">順位情報がありません。</p>
                )}
              </div>
            </motion.div>
          )}

          {view === "prize" && (
            <motion.div
              key="prize"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4">
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.28em] text-fg-3">Prize Pool</p>
                {/* RC後は「何位いくら」、RC前はプライズプール総額のみ(何位いくらは非公開)。 */}
                {tournamentInfo?.registrationClosed && tournamentInfo.prizePool.length > 0 ? (
                  <ul className="space-y-1.5">
                    {tournamentInfo.prizePool.map((p) => (
                      <li key={p.place} className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
                        <span className="text-[13px] font-black text-fg">{p.place}位</span>
                        <span className="text-[14px] font-black tabular-nums text-accent">{p.amount.toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                ) : tournamentInfo?.prizePoolTotal ? (
                  <div className="rounded-2xl border border-line-strong px-4 py-5 text-center">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-fg-3">総額</p>
                    <p className="mt-1 text-[34px] font-black tabular-nums leading-none text-accent">
                      {tournamentInfo.prizePoolTotal.toLocaleString()}
                    </p>
                    <p className="mt-2 text-[11px] text-fg-3">レジクローズ時に順位別ペイアウトが確定します。</p>
                  </div>
                ) : (
                  <p className="py-4 text-center text-sm text-fg-3">プライズ情報がありません。</p>
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
                    <tr className="text-fg-3 text-[10px]">
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
                        className={`border-t border-n-3 ${row.level === lv ? "text-accent font-black" : "text-n-9"}`}
                      >
                        <td className="py-1.5">{row.level === lv ? `▶ ${row.level}` : row.level}</td>
                        <td className="text-right py-1.5">{row.smallBlind.toLocaleString()}</td>
                        <td className="text-right py-1.5">{row.bigBlind.toLocaleString()}</td>
                        <td className="text-right py-1.5">{row.bbAnte.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-[11px] text-fg-3">
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
