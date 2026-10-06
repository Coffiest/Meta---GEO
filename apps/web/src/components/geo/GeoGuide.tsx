"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { Icon, type IconName } from "../Icon";
import { project, SPRING_MOVE, SPRING_SNAPPY } from "@/lib/motion";
import { bucketColor } from "./colors";

/**
 * GEO DATABASE の説明(全画面のまま。オーナー指示で、できること・考え方を詳しく、ワクワクする演出に作り直した)。
 *
 * - 6枚。各スライドに「見て分かる」動く図を1つずつ置く(レンジ表が塗られていく / GTO と大衆の差 /
 *   ノードを辿る / 条件の絞り込み / 突き方 / 解放)。
 * - 左右のスワイプで送る(指の勢いを投射して判定。`motion.ts` の project)。ボタンでも送れる。
 * - 利用条件(インマネ20回)を満たしていない人にも見せる(`locked`)。最後は「Playへ」で遊びに戻す。
 * - 動きはスライドに入ったときに1回だけ。常時回り続けるアニメーションは置かない。
 * - 初回のみ自動表示(localStorage で既読管理)。以降はメニューの「使い方」から再表示できる。
 */

const SEEN_KEY = "pokerart.geoGuide.v1.seen";

/** すでに使い方チュートリアルを見終えたか(localStorage永続・端末単位)。 */
export function hasGeoGuideBeenSeen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // localStorage不可の環境では出さない側に倒す
  }
}

export function markGeoGuideSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* no-op */
  }
}

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

/** 説明用の BTN のオープン(だいたいの形)。表の塗られ方を見せるためのもので、実データではない。 */
function demoBucket(row: number, col: number): "raise2-5" | "call" | "fold" {
  const hi = 14 - Math.min(row, col);
  const lo = 14 - Math.max(row, col);
  if (row === col) return "raise2-5";
  const suited = col > row;
  if (suited) {
    if (hi === 14 || hi === 13) return "raise2-5";
    if (hi >= 10 && lo >= 5) return "raise2-5";
    if (hi - lo <= 2 && lo >= 4) return "raise2-5";
    if (hi - lo === 3 && lo >= 5) return "call";
    return lo >= 3 && hi >= 9 ? "call" : "fold";
  }
  if (hi === 14 && lo >= 4) return "raise2-5";
  if (hi >= 11 && lo >= 9) return "raise2-5";
  if (hi === 13 && lo >= 8) return "raise2-5";
  if (hi - lo === 1 && lo >= 7) return "call";
  return "fold";
}

/** 13×13 の表が、左上から斜めの波で塗られていく。 */
function RangePaint({ reduce }: { reduce: boolean }) {
  return (
    <div className="relative mx-auto mt-6 w-full max-w-[300px]">
      <div className="pointer-events-none absolute -inset-6 rounded-[32px] bg-accent/10 blur-2xl" />
      <div className="relative grid gap-[2px] rounded-xl bg-canvas/60 p-1.5 ring-1 ring-line" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
        {RANKS.map((_, r) =>
          RANKS.map((__, c) => {
            const label = r === c ? `${RANKS[r]}${RANKS[c]}` : r < c ? `${RANKS[r]}${RANKS[c]}s` : `${RANKS[c]}${RANKS[r]}o`;
            return (
              <motion.div
                key={`${r}-${c}`}
                className="flex aspect-square items-center justify-center rounded-[3px] text-[6px] font-black text-white/85"
                initial={reduce ? false : { opacity: 0, scale: 0.4, backgroundColor: "rgb(50 50 53)" }}
                animate={{ opacity: 1, scale: 1, backgroundColor: bucketColor(demoBucket(r, c)) }}
                transition={{ ...SPRING_SNAPPY, delay: reduce ? 0 : 0.15 + (r + c) * 0.028 }}
              >
                {label.slice(0, 2)}
              </motion.div>
            );
          }),
        )}
      </div>
      <div className="mt-2 flex justify-center gap-3 text-[10px] font-bold text-fg-2">
        <Legend color={bucketColor("raise2-5")} label="Raise" />
        <Legend color={bucketColor("call")} label="Call" />
        <Legend color={bucketColor("fold")} label="Fold" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

/** GTO(理論)と大衆(実測)の差を棒で見せる。差の部分が「リーク」。数字は説明用の例。 */
function GapBars({ reduce }: { reduce: boolean }) {
  const rows = [
    { label: "GTO", sub: "理論値", value: 62, color: "rgb(var(--n-7))" },
    { label: "大衆", sub: "実測値", value: 41, color: "rgb(var(--accent))" },
  ];
  return (
    <div className="mx-auto mt-6 w-full max-w-[320px] rounded-[20px] glass-panel p-4 text-left">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-fg-3">例: BB が BTN のオープンを守る割合</p>
      <div className="mt-3 space-y-3">
        {rows.map((row, i) => (
          <div key={row.label}>
            <div className="flex items-baseline justify-between">
              <span className="text-[12px] font-black text-fg">
                {row.label} <span className="text-[10px] font-bold text-fg-3">{row.sub}</span>
              </span>
              <span className="text-[13px] font-black tabular-nums text-fg">{row.value}%</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: row.color }}
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${row.value}%` }}
                transition={{ ...SPRING_MOVE, delay: reduce ? 0 : 0.25 + i * 0.25 }}
              />
            </div>
          </div>
        ))}
      </div>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING_MOVE, delay: reduce ? 0 : 0.9 }}
        className="mt-3 rounded-xl bg-accent/15 px-3 py-2 ring-1 ring-accent"
      >
        <p className="text-[11px] font-black text-accent">差 21% = 大衆のリーク</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-fg-2">降りすぎている。BTN はもっと広くスチールしていい。</p>
      </motion.div>
    </div>
  );
}

/** プリフロップからフロップまで、ノードを順番に辿る。 */
function NodePath({ reduce }: { reduce: boolean }) {
  const nodes = [
    { pos: "UTG", act: "Fold", bucket: "fold" },
    { pos: "HJ", act: "Fold", bucket: "fold" },
    { pos: "CO", act: "Fold", bucket: "fold" },
    { pos: "BTN", act: "Raise 2.5", bucket: "raise2-5" },
    { pos: "SB", act: "Fold", bucket: "fold" },
    { pos: "BB", act: "Call", bucket: "call" },
  ];
  const board = [
    { r: "K", s: "♠", red: false },
    { r: "7", s: "♥", red: true },
    { r: "2", s: "♦", red: true },
  ];
  return (
    <div className="mx-auto mt-6 w-full max-w-[320px]">
      <div className="grid grid-cols-3 gap-2">
        {nodes.map((n, i) => (
          <motion.div
            key={n.pos}
            initial={reduce ? false : { opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ...SPRING_SNAPPY, delay: reduce ? 0 : 0.15 + i * 0.16 }}
            className="rounded-xl glass-panel px-2 py-2 text-center"
          >
            <p className="text-[10px] font-black text-fg-3">{n.pos}</p>
            <p className="mt-0.5 text-[12px] font-black" style={{ color: bucketColor(n.bucket) }}>
              {n.act}
            </p>
          </motion.div>
        ))}
      </div>
      <motion.div
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduce ? 0 : 1.15 }}
        className="mt-3 flex items-center justify-center gap-2"
      >
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-fg-3">Flop</span>
        {board.map((c, i) => (
          <motion.span
            key={i}
            initial={reduce ? false : { rotateY: 90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            transition={{ ...SPRING_SNAPPY, delay: reduce ? 0 : 1.25 + i * 0.12 }}
            className={`flex h-11 w-8 flex-col items-center justify-center rounded-md bg-white text-[13px] font-black leading-none ${c.red ? "text-crimson-600" : "text-n-0"}`}
          >
            {c.r}
            <span className="text-[11px]">{c.s}</span>
          </motion.span>
        ))}
      </motion.div>
    </div>
  );
}

/** 絞り込みの条件がつぎつぎに選ばれていく。 */
function FilterChips({ reduce }: { reduce: boolean }) {
  const groups = [
    { label: "スタック", options: ["100BB", "30BB", "15BB"], pick: 0 },
    { label: "人数", options: ["6人", "4人", "3人"], pick: 0 },
    { label: "偏差値帯", options: ["全体", "55+", "60+"], pick: 2 },
    { label: "ICM", options: ["序盤", "バブル", "インマネ"], pick: 1 },
  ];
  return (
    <div className="mx-auto mt-6 w-full max-w-[320px] space-y-2.5 text-left">
      {groups.map((g, gi) => (
        <div key={g.label} className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-[10px] font-black text-fg-3">{g.label}</span>
          <div className="flex flex-1 gap-1.5">
            {g.options.map((o, oi) => {
              const on = oi === g.pick;
              return (
                <motion.span
                  key={o}
                  initial={reduce ? false : { backgroundColor: "rgb(var(--n-4))", color: "rgb(var(--n-8))" }}
                  animate={
                    on
                      ? { backgroundColor: "rgb(var(--accent) / 0.15)", color: "rgb(var(--accent))" }
                      : { backgroundColor: "rgb(var(--n-4))", color: "rgb(var(--n-8))" }
                  }
                  transition={{ ...SPRING_SNAPPY, delay: reduce ? 0 : 0.3 + gi * 0.22 }}
                  className={`flex-1 rounded-full py-1.5 text-center text-[11px] font-bold ${on ? "ring-1 ring-accent" : ""}`}
                >
                  {o}
                </motion.span>
              );
            })}
          </div>
        </div>
      ))}
      <motion.p
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduce ? 0 : 1.3 }}
        className="pt-1 text-center text-[11px] font-bold text-accent"
      >
        「偏差値60以上がバブルで、100BB の6人卓をどう打つか」まで絞れる
      </motion.p>
    </div>
  );
}

/** 大衆の偏りの突き方。 */
function ExploitCards({ reduce }: { reduce: boolean }) {
  const cards: { icon: IconName; when: string; then: string }[] = [
    { icon: "arrow-right", when: "大衆が降りすぎる", then: "ブラフとスチールを増やす" },
    { icon: "check", when: "大衆がコールしすぎる", then: "バリューを厚く、ブラフを減らす" },
    { icon: "warning", when: "大衆がほとんどレイズしない", then: "レイズされたら素直に降りる" },
  ];
  return (
    <div className="mx-auto mt-6 w-full max-w-[320px] space-y-2 text-left">
      {cards.map((c, i) => (
        <motion.div
          key={c.when}
          initial={reduce ? false : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...SPRING_MOVE, delay: reduce ? 0 : 0.2 + i * 0.18 }}
          className="flex items-center gap-3 rounded-2xl glass-panel px-3.5 py-3"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Icon name={c.icon} className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-bold text-fg-3">{c.when}なら</span>
            <span className="block text-[13px] font-black text-fg">{c.then}</span>
          </span>
        </motion.div>
      ))}
    </div>
  );
}

/** 解放の条件。満たしていない人には進み具合のリング、満たしている人には「解放済み」。 */
function UnlockRing({ reduce, locked }: { reduce: boolean; locked: { itmCount: number; required: number } | null }) {
  const required = locked?.required ?? 20;
  const count = locked ? Math.min(locked.itmCount, required) : required;
  const ratio = required > 0 ? count / required : 1;
  const R = 54;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative mx-auto mt-6 h-[150px] w-[150px]">
      <div className="pointer-events-none absolute inset-0 rounded-full bg-accent/15 blur-2xl" />
      <svg viewBox="0 0 140 140" className="relative h-full w-full -rotate-90">
        <circle cx="70" cy="70" r={R} fill="none" stroke="rgb(var(--n-4))" strokeWidth="10" />
        <motion.circle
          cx="70"
          cy="70"
          r={R}
          fill="none"
          stroke="rgb(var(--accent))"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={C}
          initial={reduce ? false : { strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - ratio) }}
          transition={{ ...SPRING_MOVE, duration: 1.1, delay: reduce ? 0 : 0.2 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {locked ? (
          <>
            <span className="text-[30px] font-black tabular-nums leading-none text-fg">
              {count}
              <span className="text-[14px] text-fg-3">/{required}</span>
            </span>
            <span className="mt-1 text-[10px] font-bold text-fg-3">インマネ回数</span>
          </>
        ) : (
          <>
            <Icon name="check" className="h-9 w-9 text-accent" />
            <span className="mt-1 text-[11px] font-black text-accent">解放済み</span>
          </>
        )}
      </div>
    </div>
  );
}

type Slide = {
  key: string;
  eyebrow: string;
  title: React.ReactNode;
  body: React.ReactNode;
  visual: (p: { reduce: boolean; locked: { itmCount: number; required: number } | null }) => React.ReactNode;
};

const SLIDES: Slide[] = [
  {
    key: "intro",
    eyebrow: "GEO DATABASE",
    title: (
      <>
        みんなの一手が、
        <br />
        あなたの武器になる。
      </>
    ),
    body: (
      <>
        GEO = General Exploit Optimal(大衆エクスプロイト戦略)。このアプリで打たれた
        <b className="text-fg"> 実際のアクションをすべて記録 </b>
        し、169マスのレンジ表にして見せるデータベースです。
      </>
    ),
    visual: ({ reduce }) => <RangePaint reduce={reduce} />,
  },
  {
    key: "gap",
    eyebrow: "GTO vs GEO",
    title: "理論と現実の「差」が、勝ち筋。",
    body: (
      <>
        GTO は「完璧な相手」への正解。GEO は「現実の大衆」が本当にどう打っているか。
        その<b className="text-fg">差 = みんなの共通のミス</b>を見つけて突くのが GEO の考え方です。
      </>
    ),
    visual: ({ reduce }) => <GapBars reduce={reduce} />,
  },
  {
    key: "path",
    eyebrow: "TRACE THE HAND",
    title: "1手ずつ、局面をたどる。",
    body: (
      <>
        ポジションごとのアクションを選んでいくと、プリフロップからフロップ・ターン・リバーまで、
        <b className="text-fg">その局面で大衆が何をしたか</b>が分かります。GTO の頻度と並べて比べることもできます。
      </>
    ),
    visual: ({ reduce }) => <NodePath reduce={reduce} />,
  },
  {
    key: "filter",
    eyebrow: "FILTER",
    title: "見たい状況だけに絞る。",
    body: (
      <>
        スタックの深さ・人数・トナメ偏差値帯・ICM(バブルまでの距離)で絞り込めます。
        <b className="text-fg">強い人だけ</b>の打ち方を見ることも、<b className="text-fg">弱い人の癖</b>を探すこともできます。
      </>
    ),
    visual: ({ reduce }) => <FilterChips reduce={reduce} />,
  },
  {
    key: "exploit",
    eyebrow: "EXPLOIT",
    title: "偏りを見つけたら、こう突く。",
    body: <>データで見つけた偏りは、そのまま次のトーナメントの作戦になります。</>,
    visual: ({ reduce }) => <ExploitCards reduce={reduce} />,
  },
  {
    key: "unlock",
    eyebrow: "UNLOCK",
    title: "インマネ20回で、解放。",
    body: (
      <>
        GEO DATABASE は、トーナメントで<b className="text-fg">20回インマネした人</b>だけが使えます。
        たくさん遊んだ人だけが手にできる、とっておきの武器です。
      </>
    ),
    visual: ({ reduce, locked }) => <UnlockRing reduce={reduce} locked={locked} />,
  },
];

/** スワイプで次へ進む距離の目安(投射した移動量)。 */
const SWIPE_THRESHOLD = 90;

/**
 * GEO DATABASE の説明。最後のスライドで、解放済みなら「使ってみる」(onDone で本体へ)、
 * 未解放なら「Playへ」(ロビーへ戻る)。スキップでも onDone。
 */
export function GeoGuide({
  onDone,
  locked = null,
}: {
  onDone: () => void;
  /** 利用条件を満たしていないときの進み具合。null なら解放済み。 */
  locked?: { itmCount: number; required: number } | null;
}) {
  const [[step, dir], setStep] = useState<[number, 1 | -1]>([0, 1]);
  const reduce = useReducedMotion() ?? false;
  const total = SLIDES.length;
  const isLast = step === total - 1;
  const slide = SLIDES[step]!;

  function finish() {
    markGeoGuideSeen();
    onDone();
  }
  function go(d: 1 | -1) {
    const n = step + d;
    if (n < 0) return;
    if (n >= total) {
      finish();
      return;
    }
    setStep([n, d]);
  }
  function onDragEnd(_: unknown, info: PanInfo) {
    const travel = info.offset.x + project(info.velocity.x, 0.99);
    if (travel < -SWIPE_THRESHOLD && !isLast) go(1);
    else if (travel > SWIPE_THRESHOLD) go(-1);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-canvas"
    >
      {/* オーラ(静止)。スライドごとに少し位置が動く。 */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-accent/[0.13] blur-3xl"
        animate={{ top: `${-8 + step * 4}%`, scale: 1 + (step % 2) * 0.12 }}
        transition={SPRING_MOVE}
      />

      <div className="relative flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+12px)]">
        <div className="flex gap-1.5">
          {SLIDES.map((s, i) => (
            <motion.span
              key={s.key}
              className="h-1.5 rounded-full"
              animate={{ width: i === step ? 22 : 6, backgroundColor: i <= step ? "rgb(var(--accent))" : "rgb(var(--n-4))" }}
              transition={SPRING_SNAPPY}
            />
          ))}
        </div>
        <button onClick={finish} className="pressable text-[12px] font-bold text-fg-3">
          スキップ
        </button>
      </div>

      <motion.div
        className="relative flex flex-1 touch-pan-y items-center justify-center overflow-y-auto px-6"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.18}
        onDragEnd={onDragEnd}
      >
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={slide.key}
            custom={dir}
            initial={{ opacity: 0, x: 40 * dir }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 * dir }}
            transition={SPRING_MOVE}
            className="w-full max-w-[380px] py-6 text-center"
          >
            <p className="font-mono text-[11px] font-black uppercase tracking-[0.3em] text-accent">{`// ${slide.eyebrow}`}</p>
            <h2 className="mt-3 text-balance text-[24px] font-black leading-[1.25] tracking-tight text-fg">{slide.title}</h2>
            <p className="mx-auto mt-3 max-w-[330px] text-[13px] leading-relaxed text-fg-2">{slide.body}</p>
            {slide.visual({ reduce, locked })}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <div className="relative flex items-center gap-2 px-6 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2">
        {step > 0 && (
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="戻る"
            className="pressable flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border border-line text-fg-2"
          >
            <Icon name="chevron-left" className="h-5 w-5" />
          </button>
        )}
        {isLast && locked ? (
          <Link
            href="/"
            onClick={() => markGeoGuideSeen()}
            className="pressable flex h-[52px] flex-1 items-center justify-center gap-1.5 rounded-full bg-accent text-[14px] font-black text-on-accent shadow-glow"
          >
            Playへ
            <Icon name="arrow-right" className="h-4 w-4" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => go(1)}
            className="pressable flex h-[52px] flex-1 items-center justify-center gap-1.5 rounded-full bg-accent text-[14px] font-black text-on-accent shadow-glow"
          >
            {isLast ? "使ってみる" : "次へ"}
            {!isLast && <Icon name="chevron-right" className="h-4 w-4" />}
          </button>
        )}
      </div>
    </motion.div>
  );
}
