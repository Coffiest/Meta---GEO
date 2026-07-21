"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
function FloatingOrbs({ animate }: { animate: boolean }) {
  const orbs = [
    { size: 340, x: "-12%", y: "4%", color: "rgba(242,169,0,0.14)", dur: 16 },
    { size: 300, x: "68%", y: "28%", color: "rgba(10,10,10,0.045)", dur: 20 },
    { size: 260, x: "16%", y: "72%", color: "rgba(242,169,0,0.09)", dur: 18 },
  ];
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {orbs.map((o, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{ width: o.size, height: o.size, left: o.x, top: o.y, background: o.color, filter: "blur(48px)" }}
          animate={animate ? { x: [0, 24, -18, 0], y: [0, -20, 16, 0], scale: [1, 1.08, 0.96, 1] } : undefined}
          transition={{ duration: o.dur, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

/**
 * GEOの正式名称バッジ。小さく、しかし確実に目に留まるよう、G/E/Oの頭文字を1文字ずつ
 * スプリングで立ち上げ、ゴールドの下線を左から引く。ヒーローの直上(画面最上部)に置く。
 */
function AcronymBadge() {
  const words: { letter: string; rest: string }[] = [
    { letter: "G", rest: "eneral" },
    { letter: "E", rest: "xploit" },
    { letter: "O", rest: "ptimal" },
  ];
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.12, delayChildren: 0.35 } } }}
      className="mt-4 inline-flex flex-col gap-1"
    >
      <div className="flex items-baseline gap-1.5">
        {words.map((w) => (
          <motion.span
            key={w.letter}
            variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
            transition={{ type: "spring", stiffness: 400, damping: 26 }}
            className="text-[12px] font-bold tracking-tight text-ink-700"
          >
            <span className="text-[15px] font-black text-ink-950">{w.letter}</span>
            {w.rest}
          </motion.span>
        ))}
        <motion.span
          variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
          className="ml-1 rounded-full bg-gold-500 px-2 py-0.5 text-[9px] font-black tracking-wide text-ink-950"
        >
          大衆エクスプロイト戦略
        </motion.span>
      </div>
      <motion.span
        aria-hidden
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.75, duration: 0.5, ease: "easeOut" }}
        className="h-[2px] w-full origin-left rounded-full bg-gold-500/60"
      />
    </motion.div>
  );
}

// ---- 実画面モック(GTO Wizard風レンジ表)。GEO DATABASEで見られるものを一目で伝える ----
const RANKS = "AKQJT98765432".split("");
const CELL_RAISE = "#E15361";
const CELL_SMALL = "#E8823C";
const CELL_CALL = "#57A64A";
const CELL_FOLD = "#4C86C6";

/** モックが自動で切り替わる局面プリセット。しきい値を少しずつ変え、レンジの広がりの違いを見せる。 */
const MOCK_SPOTS = [
  { label: "CO ・ RFI ・ 40bb", shift: 0 },
  { label: "BTN ・ RFI ・ 25bb", shift: -3 },
  { label: "UTG ・ RFI ・ 60bb", shift: 3 },
] as const;

/** 大衆の実測レンジ風に、強い手ほどレイズ・弱い手ほどフォールドへ色分けする(モック用のヒューリスティック)。 */
function cellColor(i: number, j: number, shift: number): string {
  const hi = Math.min(i, j);
  const lo = Math.max(i, j);
  const pair = i === j;
  const suited = i < j;
  const gap = lo - hi;
  let s = (12 - hi) * 2 + (12 - lo);
  if (pair) s += 22;
  if (suited) s += 5;
  if (suited && gap <= 2) s += 4;
  const t = 0 + shift;
  if (s >= 30 + t) return CELL_RAISE;
  if (s >= 25 + t) return CELL_SMALL;
  if (s >= 20 + t) return CELL_CALL;
  return CELL_FOLD;
}

function cellLabel(i: number, j: number): string {
  const a = RANKS[Math.min(i, j)]!;
  const b = RANKS[Math.max(i, j)]!;
  if (i === j) return `${a}${a}`;
  return i < j ? `${a}${b}s` : `${b}${a}o`;
}

/**
 * GEO DATABASEの実画面モック。169マスがふわっと敷き詰められるレンジ表ヒートマップ。
 * 数秒ごとに局面(ポジション/スタック)が切り替わり、レンジの形が変わる様子を見せる。
 */
function RangeMatrixMock({ animate }: { animate: boolean }) {
  const [spotIndex, setSpotIndex] = useState(0);
  const spot = MOCK_SPOTS[spotIndex]!;

  useEffect(() => {
    if (!animate) return;
    const timer = setInterval(() => setSpotIndex((i) => (i + 1) % MOCK_SPOTS.length), 4200);
    return () => clearInterval(timer);
  }, [animate]);

  const cells: { i: number; j: number }[] = [];
  for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) cells.push({ i, j });

  return (
    <div className="overflow-hidden rounded-[22px] border-[1.5px] border-ink-950 bg-white shadow-[0_18px_40px_-20px_rgba(10,10,10,0.5)]">
      <div className="flex items-center justify-between border-b border-ink-200 px-4 py-2.5">
        <span className="text-[12px] font-black tracking-tight text-ink-950">GEO DATABASE</span>
        <AnimatePresence mode="popLayout">
          <motion.span
            key={spot.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            className="text-[9px] font-black uppercase tracking-[0.2em] text-gold-600"
          >
            {spot.label}
          </motion.span>
        </AnimatePresence>
      </div>
      <motion.div
        key={spot.label}
        initial="hidden"
        whileInView="show"
        viewport={{ once: false, margin: "-40px" }}
        variants={{ show: { transition: { staggerChildren: 0.003 } } }}
        className="grid gap-[2px] bg-ink-950 p-3"
        style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}
      >
        {cells.map(({ i, j }) => (
          <motion.div
            key={`${i}-${j}`}
            variants={{ hidden: { opacity: 0, scale: 0.3 }, show: { opacity: 1, scale: 1 } }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="flex aspect-square items-center justify-center rounded-[2px] text-[6px] font-bold leading-none text-white/90"
            style={{ backgroundColor: cellColor(i, j, spot.shift) }}
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

/** GTOとGEOの対比表。初心者には「何が違うのか」を、上級者には「なぜ効くのか」を1枚で伝える。 */
function GtoVsGeoCard() {
  const rows: { label: string; gto: string; geo: string }[] = [
    { label: "相手の想定", gto: "全員が完璧", geo: "現実の大衆" },
    { label: "データ源", gto: "理論計算", geo: "実測プレイ" },
    { label: "教えてくれること", gto: "正解の打ち方", geo: "相手のミスの突き方" },
  ];
  return (
    <div className="overflow-hidden rounded-[22px] border-[1.5px] border-ink-950 bg-white">
      <div className="grid grid-cols-[1fr_auto_1fr]">
        <div className="px-4 py-3 text-center">
          <p className="text-[16px] font-black tracking-tight text-ink-400">GTO</p>
          <p className="mt-0.5 text-[9px] font-bold text-ink-400">理論値</p>
        </div>
        <div className="flex items-center">
          <span className="rounded-full border border-ink-300 px-2 py-0.5 text-[9px] font-black text-ink-500">vs</span>
        </div>
        <div className="bg-ink-950 px-4 py-3 text-center">
          <p className="text-[16px] font-black tracking-tight text-gold-500">GEO</p>
          <p className="mt-0.5 text-[9px] font-bold text-white/60">実測値</p>
        </div>
      </div>
      {rows.map((row, i) => (
        <motion.div
          key={row.label}
          initial={{ opacity: 0, x: -12 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ delay: i * 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="grid grid-cols-[1fr_auto_1fr] items-center border-t border-ink-200"
        >
          <p className="px-4 py-3 text-center text-[12px] font-bold text-ink-500">{row.gto}</p>
          <p className="w-[88px] text-center text-[9px] font-black uppercase tracking-wider text-ink-400">{row.label}</p>
          <p className="px-4 py-3 text-center text-[12px] font-black text-ink-950">{row.geo}</p>
        </motion.div>
      ))}
    </div>
  );
}

/** 「記録 → 集約 → 可視化」の3ステップ。データがリーク(弱点)の可視化に変わる流れを示す。 */
function FlowStep({ n, title, body, delay, last = false }: { n: string; title: string; body: string; delay: number; last?: boolean }) {
  return (
    <Reveal delay={delay}>
      <div className="flex gap-3.5">
        <div className="flex flex-col items-center">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-ink-950 text-[13px] font-black text-ink-950">
            {n}
          </div>
          {!last && (
            <motion.div
              initial={{ scaleY: 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={{ once: true }}
              transition={{ delay: delay + 0.2, duration: 0.4, ease: "easeOut" }}
              className="mt-1 w-px flex-1 origin-top bg-ink-300"
            />
          )}
        </div>
        <div className="min-w-0 pb-5 pt-0.5">
          <h3 className="text-[15px] font-black tracking-tight text-ink-950">{title}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-600">{body}</p>
        </div>
      </div>
    </Reveal>
  );
}

/**
 * GEO DATABASE の「近日公開」プロモ画面。初心者には「みんなの打ち方がぜんぶ見える」ことを平易に、
 * 上級者にはGTOとの対比(実測エクスプロイトの再現性)でワクワクを届ける。画面最上部にGEOの正式名称
 * (General Exploit Optimal = 大衆エクスプロイト戦略)を小さく、しかし確実に目に留まる形で掲げる。
 * 最下部のバージョン表記をタップ→隠しパスコード(2357)で本物のGEO DATABASEへ解錠する。
 */
export function GeoComingSoon({ onUnlock }: { onUnlock: () => void }) {
  const [gateOpen, setGateOpen] = useState(false);
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(false);
  const reduceMotion = useReducedMotion();
  const animate = !reduceMotion;

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
      <FloatingOrbs animate={animate} />

      <div className="relative z-10 mx-auto max-w-md px-6 pb-40 pt-[calc(env(safe-area-inset-top)+36px)]">
        {/* ワードマーク + Coming Soon */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex items-center justify-between"
        >
          <span className="text-[24px] font-black leading-none tracking-tighter text-ink-950">GEO</span>
          <span className="text-[10px] font-black uppercase tracking-[0.34em] text-gold-600">Coming Soon</span>
        </motion.div>

        {/* 正式名称バッジ(小さく・目に留まる) */}
        <AcronymBadge />

        {/* 主役メッセージ */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 text-[34px] font-black leading-[1.12] tracking-tight text-ink-950"
        >
          みんなの一手を、
          <br />
          <span className="relative inline-block">
            ぜんぶ記録。
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
          transition={{ delay: 1.05, duration: 0.7 }}
          className="mt-5 text-[15px] font-bold leading-relaxed text-ink-700"
        >
          このアプリでプレイされた<span className="text-ink-950">全プレイヤーの全アクション</span>が、
          自動でデータベースに積み上がっていく。
          <br />
          見えてくるのは、<span className="text-ink-950">大衆の&ldquo;リーク&rdquo;</span>——
          人がどこで、どんなミスをしているのかの平均像。
        </motion.p>

        {/* 稼働インジケータ */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.25, duration: 0.5 }}
          className="mt-5 inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/80 px-3.5 py-1.5 backdrop-blur-sm"
        >
          <span className="relative flex h-2 w-2">
            {animate && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-500 opacity-60" />}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-gold-500" />
          </span>
          <span className="text-[11px] font-bold text-ink-700">いまも全テーブルで記録中</span>
        </motion.div>

        {/* GTO vs GEO: 何が違うか(初心者) / なぜ効くか(上級者) */}
        <div className="mt-14">
          <Reveal>
            <p className="mb-3 text-[11px] font-black uppercase tracking-[0.28em] text-ink-400">GTOとの違い</p>
            <h2 className="mb-4 text-[22px] font-black leading-snug tracking-tight text-ink-950">
              理論値では、勝ちきれない。
            </h2>
          </Reveal>
          <Reveal delay={0.05}>
            <GtoVsGeoCard />
          </Reveal>
        </div>

        {/* 3ステップ: 記録 → 集約 → 可視化 */}
        <div className="mt-14">
          <Reveal>
            <p className="mb-5 text-[11px] font-black uppercase tracking-[0.28em] text-ink-400">仕組み</p>
          </Reveal>
          <FlowStep
            n="1"
            delay={0}
            title="すべてのハンドを記録"
            body="全プレイヤー・全ストリートの意思決定を、1アクションも欠かさず記録し続けています。"
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
            last
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
            <RangeMatrixMock animate={animate} />
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

        {/* Coming soon badge */}
        <Reveal delay={0.1}>
          <div className="mt-10 flex justify-center">
            <motion.div
              animate={animate ? { scale: [1, 1.04, 1] } : undefined}
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
            className="cursor-pointer text-[11px] font-medium tracking-wide text-ink-400 transition-colors active:text-ink-600"
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
                    className="cursor-pointer rounded-2xl border border-ink-950 bg-white py-3 text-[20px] font-black text-ink-950 transition-transform active:scale-90"
                  >
                    {d}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setGateOpen(false);
                    setCode("");
                  }}
                  className="cursor-pointer rounded-2xl py-3 text-[12px] font-bold text-ink-500 transition-transform active:scale-90"
                >
                  閉じる
                </button>
                <button
                  onClick={() => pushDigit("0")}
                  className="cursor-pointer rounded-2xl border border-ink-950 bg-white py-3 text-[20px] font-black text-ink-950 transition-transform active:scale-90"
                >
                  0
                </button>
                <button
                  onClick={() => setCode((c) => c.slice(0, -1))}
                  aria-label="1文字削除"
                  className="flex cursor-pointer items-center justify-center rounded-2xl py-3 text-ink-500 transition-transform active:scale-90"
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
