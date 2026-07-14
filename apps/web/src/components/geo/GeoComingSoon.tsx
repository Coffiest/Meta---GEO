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
    { size: 340, x: "-12%", y: "6%", color: "rgba(242,169,0,0.16)", dur: 15 },
    { size: 300, x: "70%", y: "22%", color: "rgba(10,10,10,0.05)", dur: 19 },
    { size: 260, x: "22%", y: "64%", color: "rgba(242,169,0,0.10)", dur: 17 },
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

const ACRONYM: { letter: string; en: string; jp: string }[] = [
  { letter: "G", en: "Game-theory", jp: "ゲーム理論" },
  { letter: "E", en: "Exploitative", jp: "エクスプロイト(相手の傾向を突く)" },
  { letter: "O", en: "Optimization", jp: "最適化" },
];

function FeatureCard({ title, body, delay, icon }: { title: string; body: string; delay: number; icon: React.ReactNode }) {
  return (
    <Reveal delay={delay}>
      <div className="rounded-[22px] border border-ink-950 bg-white/80 p-5 backdrop-blur-sm">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-ink-950 text-ink-950">{icon}</div>
        <h3 className="text-[17px] font-black tracking-tight text-ink-950">{title}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-600">{body}</p>
      </div>
    </Reveal>
  );
}

/**
 * GEO DATABASE の「近日公開」プロモ画面。GEOとは何か・何の略か・何ができるか・なぜ価値があるかを
 * 誰にでも伝わるように説明する。最下部のバージョン表記をタップすると隠しパスコード入力が開き、
 * 正しいコード(2357)を入れると本物のGEO DATABASEへ解錠する(onUnlock)。
 * みんなの銀行風スイス + Apple風モダン、アニメーション多め。
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

      <div className="relative z-10 mx-auto max-w-md px-6 pb-40 pt-[calc(env(safe-area-inset-top)+40px)]">
        {/* Eyebrow */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center text-[11px] font-black uppercase tracking-[0.42em] text-gold-600"
        >
          Coming Soon ・ 近日公開
        </motion.p>

        {/* Hero wordmark: GEO */}
        <div className="mt-5 flex items-end justify-center">
          {["G", "E", "O"].map((ch, i) => (
            <motion.span
              key={ch}
              initial={{ opacity: 0, y: 40, rotate: -12 }}
              animate={{ opacity: 1, y: 0, rotate: i === 1 ? -8 : 0 }}
              transition={{ type: "spring", stiffness: 220, damping: 18, delay: 0.15 + i * 0.12 }}
              className="font-black leading-[0.8] tracking-tighter text-ink-950"
              style={{ fontSize: 128 }}
            >
              {ch}
            </motion.span>
          ))}
        </div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.7 }}
          className="mt-2 text-center text-[19px] font-black tracking-tight text-ink-950"
        >
          GTOの、その先へ。
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.7 }}
          className="mx-auto mt-2 max-w-[19rem] text-center text-[13px] leading-relaxed text-ink-600"
        >
          GTOの先を行く、実戦データ駆動の戦略データベース。まもなく解禁します。
        </motion.p>

        {/* Acronym reveal */}
        <div className="mt-14">
          <Reveal>
            <p className="mb-4 text-center text-[11px] font-black uppercase tracking-[0.32em] text-ink-400">GEO とは</p>
          </Reveal>
          <div className="space-y-2.5">
            {ACRONYM.map((a, i) => (
              <Reveal key={a.letter} delay={i * 0.08}>
                <div className="flex items-center gap-4 rounded-2xl border border-ink-950 bg-white/80 px-4 py-3 backdrop-blur-sm">
                  <span className="w-8 shrink-0 text-center text-[32px] font-black leading-none text-gold-600">{a.letter}</span>
                  <div className="min-w-0">
                    <p className="text-[15px] font-black tracking-tight text-ink-950">{a.en}</p>
                    <p className="text-[12px] text-ink-600">{a.jp}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.24}>
            <p className="mt-4 text-center text-[13px] font-bold text-ink-800">
              = ゲーム理論エクスプロイト最適化
            </p>
          </Reveal>
        </div>

        {/* What is GEO */}
        <div className="mt-16">
          <Reveal>
            <div className="rounded-[24px] border-[1.5px] border-ink-950 bg-white/80 p-6 backdrop-blur-sm">
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-gold-600">What is GEO?</p>
              <h2 className="mt-2 text-[22px] font-black leading-snug tracking-tight text-ink-950">
                “理論値”ではなく、“実戦の真実”。
              </h2>
              <p className="mt-3 text-[13.5px] leading-relaxed text-ink-700">
                GTO(ゲーム理論的最適)は「誰が相手でも負けない」守りの理論。GEOは、実際にプレイされた
                <span className="font-bold text-ink-950">全ハンドの実測データ</span>
                から、相手の傾向を突いて<span className="font-bold text-ink-950">勝ちを最大化</span>する次の一手を導く、まったく新しい戦略データベースです。
              </p>
            </div>
          </Reveal>
        </div>

        {/* What you can do */}
        <div className="mt-16">
          <Reveal>
            <p className="mb-4 text-[11px] font-black uppercase tracking-[0.28em] text-ink-400">ここでできること</p>
          </Reveal>
          <div className="space-y-3">
            <FeatureCard
              delay={0}
              title="アクションツリーを辿る"
              body="ポジション・スタック・バブル状況ごとに、実戦のレンジと頻度をGTO Wizard風のヒートマップで可視化。全プリフロップ〜リバーの実測ラインをそのまま追える。"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
                  <path d="M12 4v6m0 0-4 4m4-4 4 4M4 20h4m8 0h4" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="3.5" r="1.4" />
                </svg>
              }
            />
            <FeatureCard
              delay={0.08}
              title="トナメ偏差値でフィルタ"
              body="実力帯(トナメ偏差値)でプレイヤーを絞り込み、上級者だけの意思決定を抽出して学べる。誰の戦略を参考にするかを自分で選べる。"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
                  <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
                </svg>
              }
            />
            <FeatureCard
              delay={0.16}
              title="板面まで厳密一致で検索"
              body="正確なボード(フロップ/ターン/リバー)を指定して、その局面で実際にどう打たれたかをピンポイントで確認。机上の空論ではない、現場の答え。"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="m16 16 4 4" strokeLinecap="round" />
                </svg>
              }
            />
          </div>
        </div>

        {/* Why it matters */}
        <div className="mt-16">
          <Reveal>
            <div className="overflow-hidden rounded-[24px] border-[1.5px] border-gold-500 bg-white/80 p-6 backdrop-blur-sm">
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-gold-600">Why it matters</p>
              <h2 className="mt-2 text-[21px] font-black leading-snug tracking-tight text-ink-950">
                相手の“クセ”こそ、勝ちの源泉。
              </h2>
              <p className="mt-3 text-[13.5px] leading-relaxed text-ink-700">
                ソルバーの理論値は「みんなが完璧」を前提にしています。でも実戦の相手は完璧じゃない。GEOは
                <span className="font-bold text-ink-950">“人が実際にどう打ったか”</span>
                を映すから、相手のリアルな偏り=エクスプロイトのチャンスが見える。GTOを覚えた、その先の一歩です。
              </p>
            </div>
          </Reveal>
        </div>

        {/* Coming soon badge */}
        <Reveal delay={0.1}>
          <div className="mt-16 flex flex-col items-center">
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
        <div className="mt-20 flex justify-center">
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
