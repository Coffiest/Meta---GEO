"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Footer } from "@/components/Footer";
import { APP_VERSION } from "@/lib/version";

/** スクロールで下からふわっと現れるブロック。GEOプロモ全体で共通利用する。 */
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** 背景でゆっくり漂うゴールド/インクの光。装飾のみ(pointer-events無効)。 */
function FloatingOrbs() {
  const orbs = [
    { size: 340, x: "-12%", y: "4%", color: "rgba(242,169,0,0.16)", dur: 15 },
    { size: 300, x: "68%", y: "26%", color: "rgba(10,10,10,0.05)", dur: 19 },
    { size: 260, x: "18%", y: "70%", color: "rgba(242,169,0,0.10)", dur: 17 },
  ];
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {orbs.map((o, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{ width: o.size, height: o.size, left: o.x, top: o.y, background: o.color, filter: "blur(48px)" }}
          animate={{ x: [0, 24, -18, 0], y: [0, -20, 16, 0], scale: [1, 1.08, 0.96, 1] }}
          transition={{ duration: o.dur, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// ---- 実画面モック(GTO Wizard風レンジ表)。GEO DATABASEで見られるものを一目で伝える ----
const RANKS = "AKQJT98765432".split("");
const CELL_RAISE = "#E15361";
const CELL_SMALL = "#E8823C";
const CELL_CALL = "#57A64A";
const CELL_FOLD = "#4C86C6";

/** 大衆の実測レンジ風に、強い手ほどレイズ・弱い手ほどフォールドへ色分けする(モック用のヒューリスティック)。 */
function cellColor(i: number, j: number): string {
  const hi = Math.min(i, j);
  const lo = Math.max(i, j);
  const pair = i === j;
  const suited = i < j;
  const gap = lo - hi;
  let s = (12 - hi) * 2 + (12 - lo);
  if (pair) s += 22;
  if (suited) s += 5;
  if (suited && gap <= 2) s += 4;
  if (s >= 30) return CELL_RAISE;
  if (s >= 25) return CELL_SMALL;
  if (s >= 20) return CELL_CALL;
  return CELL_FOLD;
}

function cellLabel(i: number, j: number): string {
  const a = RANKS[Math.min(i, j)]!;
  const b = RANKS[Math.max(i, j)]!;
  if (i === j) return `${a}${a}`;
  return i < j ? `${a}${b}s` : `${b}${a}o`;
}

/** GEO DATABASEの実画面モック。169マスがふわっと敷き詰められるレンジ表ヒートマップ。 */
function RangeMatrixMock() {
  const cells: { i: number; j: number }[] = [];
  for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) cells.push({ i, j });
  return (
    <div className="overflow-hidden rounded-[22px] border-[1.5px] border-ink-950 bg-white shadow-[0_18px_40px_-20px_rgba(10,10,10,0.5)]">
      <div className="flex items-center justify-between border-b border-ink-200 px-4 py-2.5">
        <span className="text-[12px] font-black tracking-tight text-ink-950">GEO DATABASE</span>
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-gold-600">CO ・ RFI ・ 40bb</span>
      </div>
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-40px" }}
        variants={{ show: { transition: { staggerChildren: 0.004 } } }}
        className="grid gap-[2px] bg-ink-950 p-3"
        style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}
      >
        {cells.map(({ i, j }) => (
          <motion.div
            key={`${i}-${j}`}
            variants={{ hidden: { opacity: 0, scale: 0.3 }, show: { opacity: 1, scale: 1 } }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="flex aspect-square items-center justify-center rounded-[2px] text-[6px] font-bold leading-none text-white/90"
            style={{ backgroundColor: cellColor(i, j) }}
          >
            {cellLabel(i, j)}
          </motion.div>
        ))}
      </motion.div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 px-3 py-2.5 text-[10px] font-bold text-ink-700">
        {[
          ["レイズ", CELL_RAISE],
          ["スモール", CELL_SMALL],
          ["コール", CELL_CALL],
          ["フォールド", CELL_FOLD],
        ].map(([label, color]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: color as string }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 「記録 → 集約 → 可視化」の3ステップ。データがリーク(弱点)の可視化に変わる流れを示す。 */
function FlowStep({ n, title, body, delay }: { n: string; title: string; body: string; delay: number }) {
  return (
    <Reveal delay={delay}>
      <div className="flex gap-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-ink-950 text-[13px] font-black text-ink-950">
          {n}
        </div>
        <div className="min-w-0 pt-0.5">
          <h3 className="text-[15px] font-black tracking-tight text-ink-950">{title}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-600">{body}</p>
        </div>
      </div>
    </Reveal>
  );
}

/**
 * GEO DATABASE の「近日公開」プロモ画面。核となる価値 ――「全プレイヤーの全アクションを記録して
 * いるから、大衆の平均的なリーク(人がよくミスする場所)が見える」―― を主役に据え、実画面(レンジ表)の
 * モックで「何ができるか」を初見でもイメージ・体験できるようにする。略称(G=General / E=Exploit /
 * O=Optimization = 大衆をエクスプロイトする戦略)は控えめに小さく添える。最下部のバージョン表記を
 * タップ→隠しパスコード(2357)で本物のGEO DATABASEへ解錠する。
 */
export function GeoComingSoon({ onUnlock }: { onUnlock: () => void }) {
  const [gateOpen, setGateOpen] = useState(false);
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(false);

  function submitCode(next: string) {
    if (next === "2357") {
      onUnlock();
      return;
    }
    if (next.length >= 4) {
      setWrong(true);
      setTimeout(() => {
        setWrong(false);
        setCode("");
      }, 500);
    }
  }

  function pushDigit(d: string) {
    if (code.length >= 4) return;
    const next = code + d;
    setCode(next);
    if (next.length === 4) submitCode(next);
  }

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-white text-ink-950">
      <FloatingOrbs />

      <div className="relative z-10 mx-auto max-w-md px-6 pb-40 pt-[calc(env(safe-area-inset-top)+36px)]">
        {/* Eyebrow + 小さなGEOワードマーク(略称は主役ではない) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex items-center justify-between"
        >
          <span className="text-[24px] font-black leading-none tracking-tighter text-ink-950">GEO</span>
          <span className="text-[10px] font-black uppercase tracking-[0.34em] text-gold-600">Coming Soon</span>
        </motion.div>

        {/* 主役メッセージ: 全アクションを記録 → 大衆のリークが見える */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 text-[34px] font-black leading-[1.12] tracking-tight text-ink-950"
        >
          全プレイヤーの
          <br />
          全アクションを、
          <br />
          <span className="relative inline-block">
            すべて記録。
            <motion.span
              aria-hidden
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.9, duration: 0.6, ease: "easeOut" }}
              className="absolute -bottom-1 left-0 h-[6px] w-full origin-left rounded-full bg-gold-500"
            />
          </span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1, duration: 0.7 }}
          className="mt-5 text-[16px] font-bold leading-relaxed text-ink-700"
        >
          だから、<span className="text-ink-950">大衆の“リーク”</span>が見える。
          <br />
          人がどこで、どんなミスをしているのか。その平均を、まるごと。
        </motion.p>

        {/* 3ステップ: 記録 → 集約 → 可視化 */}
        <div className="mt-14 space-y-5">
          <Reveal>
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-ink-400">仕組み</p>
          </Reveal>
          <FlowStep
            n="1"
            delay={0}
            title="すべてのハンドを記録"
            body="このアプリで実際にプレイされた全プレイヤー・全ストリートの意思決定を、1アクションも欠かさず記録し続けています。"
          />
          <FlowStep
            n="2"
            delay={0.08}
            title="大衆の戦略へ集約"
            body="膨大な実測データを、ポジション・スタック・状況ごとに集約。“みんなが実際にどう打っているか”の平均像が浮かび上がる。"
          />
          <FlowStep
            n="3"
            delay={0.16}
            title="リーク(弱点)を可視化"
            body="理論値(GTO)とのズレ=大衆の共通のミスが一目でわかる。どこを突けば勝てるのかが、色で見える。"
          />
        </div>

        {/* 実画面モック: 何ができるかを体験させる */}
        <div className="mt-14">
          <Reveal>
            <p className="mb-3 text-[11px] font-black uppercase tracking-[0.28em] text-ink-400">これが実際の画面</p>
            <h2 className="mb-4 text-[22px] font-black leading-snug tracking-tight text-ink-950">
              大衆の実測レンジを、この一枚で。
            </h2>
          </Reveal>
          <Reveal delay={0.05}>
            <RangeMatrixMock />
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-3 text-center text-[12px] leading-relaxed text-ink-500">
              169通りのハンドを、実測のアクション頻度で色分け。ポジション・板面・スタックを切り替えて、
              フロップからリバーまで“大衆の手の内”を丸ごと覗ける。
            </p>
          </Reveal>
        </div>

        {/* なぜ価値があるか */}
        <div className="mt-16">
          <Reveal>
            <div className="overflow-hidden rounded-[24px] border-[1.5px] border-gold-500 bg-white/80 p-6 backdrop-blur-sm">
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-gold-600">Why it matters</p>
              <h2 className="mt-2 text-[22px] font-black leading-snug tracking-tight text-ink-950">
                完璧な相手はいない。だから勝てる。
              </h2>
              <p className="mt-3 text-[13.5px] leading-relaxed text-ink-700">
                ソルバーは「全員が完璧」を前提にします。でも現実の大衆は、必ずどこかで同じミスを繰り返す。
                その<span className="font-bold text-ink-950">平均的なリークを突く</span>ことこそ、最も再現性が高く、最も稼げる戦略。
                GEOは、その“突きどころ”をデータで指し示します。
              </p>
            </div>
          </Reveal>
        </div>

        {/* 略称(控えめに小さく) */}
        <Reveal delay={0.05}>
          <p className="mt-10 text-center text-[11px] leading-relaxed text-ink-400">
            GEO = <span className="font-bold text-ink-500">G</span>eneral{" "}
            <span className="font-bold text-ink-500">E</span>xploit{" "}
            <span className="font-bold text-ink-500">O</span>ptimization
            <br />
            — 大衆(General)をエクスプロイトする戦略。
          </p>
        </Reveal>

        {/* Coming soon badge */}
        <Reveal delay={0.1}>
          <div className="mt-10 flex justify-center">
            <motion.div
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              className="rounded-full bg-ink-950 px-6 py-2.5 text-[13px] font-black tracking-wide text-white"
            >
              近日公開 — お楽しみに。
            </motion.div>
          </div>
        </Reveal>

        {/* Version line (tap → hidden passcode gate) */}
        <div className="mt-16 flex justify-center">
          <button
            onClick={() => setGateOpen(true)}
            className="text-[11px] font-medium tracking-wide text-ink-400 transition-colors active:text-ink-600"
          >
            v{APP_VERSION} ・ 作成者: Coffiest ・ © 2026 Poker ART
          </button>
        </div>
      </div>

      {/* Hidden passcode popup */}
      <AnimatePresence>
        {gateOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setGateOpen(false);
              setCode("");
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-8"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              transition={{ type: "spring", stiffness: 360, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[300px] rounded-[26px] border border-ink-950 bg-white p-6"
            >
              <p className="text-center text-[10px] font-black uppercase tracking-[0.3em] text-ink-400">Access code</p>
              <p className="mt-1 text-center text-[15px] font-black tracking-tight text-ink-950">パスコードを入力</p>

              <motion.div
                animate={wrong ? { x: [0, -10, 10, -8, 8, 0] } : { x: 0 }}
                transition={{ duration: 0.5 }}
                className="mt-5 flex justify-center gap-3"
              >
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`h-3.5 w-3.5 rounded-full border ${
                      wrong ? "border-crimson-500 bg-crimson-500" : code.length > i ? "border-ink-950 bg-ink-950" : "border-ink-400 bg-transparent"
                    }`}
                  />
                ))}
              </motion.div>

              <div className="mt-6 grid grid-cols-3 gap-2.5">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                  <button
                    key={d}
                    onClick={() => pushDigit(d)}
                    className="rounded-2xl border border-ink-950 bg-white py-3 text-[20px] font-black text-ink-950 transition-transform active:scale-90"
                  >
                    {d}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setGateOpen(false);
                    setCode("");
                  }}
                  className="rounded-2xl py-3 text-[12px] font-bold text-ink-500 transition-transform active:scale-90"
                >
                  閉じる
                </button>
                <button
                  onClick={() => pushDigit("0")}
                  className="rounded-2xl border border-ink-950 bg-white py-3 text-[20px] font-black text-ink-950 transition-transform active:scale-90"
                >
                  0
                </button>
                <button
                  onClick={() => setCode((c) => c.slice(0, -1))}
                  aria-label="1文字削除"
                  className="flex items-center justify-center rounded-2xl py-3 text-ink-500 transition-transform active:scale-90"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
                    <path d="M9 5h11v14H9l-6-7 6-7Z" strokeLinejoin="round" />
                    <path d="m13 9 4 6m0-6-4 6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Footer
        activeKey={null}
        centerActive
        items={[
          { key: "home", label: "Home", icon: "home", href: "/" },
          { key: "stats", label: "Stats", icon: "stats", href: "/?tab=stats" },
          { key: "history", label: "History", icon: "layers", href: "/?tab=history" },
          { key: "leaderboard", label: "Leaderboard", icon: "trophy", href: "/?tab=leaderboard" },
        ]}
      />
    </div>
  );
}
