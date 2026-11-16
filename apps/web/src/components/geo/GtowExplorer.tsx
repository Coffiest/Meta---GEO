"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { TRAINER_POSITIONS, TRAINER_STACKS, handName, type TrainerData, type TrainerNode } from "@/lib/trainer";

/**
 * Database の「GTO」タブ。取得した GTO Wizard の解(MTT・ChipEV・8人卓・アンティあり)を、そのまま見る。
 * データは特訓と同じ `public/trainer/<スタック>.json`(端末だけで読む。サーバーと DB は使わない)。
 * 席を順に選んで手順を進め、手番の人の 169 の手ごとの行動の頻度と EV を表で見る。
 */

const COLOR = { F: "#4D7AB3", C: "#7CB570", R: "#DD4D45", RAI: "#722722" } as const;
const colorOf = (code: string) => (code === "F" ? COLOR.F : code === "C" || code === "X" ? COLOR.C : code === "RAI" ? COLOR.RAI : COLOR.R);
const order = (code: string) => (code === "RAI" ? 0 : code.startsWith("R") ? 1 : code === "C" || code === "X" ? 2 : 3);
const name = (code: string, stack: number) =>
  code === "F" ? "Fold" : code === "C" ? "Call" : code === "X" ? "Check" : code === "RAI" ? `Allin ${stack}` : `Raise ${code.slice(1)}`;

const fmt = (v: number) => String(Math.round(v * 1000) / 1000);
const fmtPct = (v: number) => `${+(v * 100).toFixed(1)}%`;

const cache = new Map<number, Promise<TrainerData | null>>();
function load(stack: number) {
  let p = cache.get(stack);
  if (!p) {
    p = fetch(`/trainer/${stack}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<TrainerData>) : null))
      .catch(() => null);
    cache.set(stack, p);
  }
  return p;
}

/** 手順(pa)から、各席の最後の行動と、次に行動する席を出す。 */
function replay(pa: string, stack: number) {
  const codes = pa ? pa.split("-") : [];
  const bet = [0, 0, 0, 0, 0, 0, 0.5, 1];
  const folded = Array(8).fill(false);
  const acted = Array(8).fill(false);
  const last: (string | null)[] = Array(8).fill(null);
  let i = 0;
  for (const c of codes) {
    if (i < 0) break;
    const top = Math.max(...bet);
    if (c === "F") folded[i] = true;
    else if (c === "C" || c === "X") bet[i] = top;
    else {
      bet[i] = c === "RAI" ? stack : Number(c.slice(1));
      for (let k = 0; k < 8; k++) if (k !== i) acted[k] = false;
    }
    acted[i] = true;
    last[i] = c;
    const t2 = Math.max(...bet);
    let next = -1;
    for (let k = 1; k <= 8; k++) {
      const j = (i + k) % 8;
      if (!folded[j] && (!acted[j] || bet[j] < t2)) {
        next = j;
        break;
      }
    }
    i = next;
  }
  return { last, folded, next: i, bet, stacks: bet.map((b) => Math.max(0, stack - b)) };
}

export function GtowExplorer() {
  const [stack, setStack] = useState<number>(100);
  const [data, setData] = useState<TrainerData | null | undefined>(undefined);
  const [pa, setPa] = useState("");
  const [hand, setHand] = useState<number | null>(null);

  useEffect(() => {
    setData(undefined);
    void load(stack).then(setData);
  }, [stack]);

  const node: TrainerNode | null = data?.nodes[pa] ?? null;
  const r = useMemo(() => replay(pa, stack), [pa, stack]);
  const actorIdx = node ? TRAINER_POSITIONS.indexOf(node.actor) : r.next;

  // この局面に来るまでの、手番の人の行動の頻度を掛けた重み(レンジ)。
  const weight = useMemo(() => {
    const w = Array(169).fill(1);
    if (!data || actorIdx < 0) return w;
    const codes = pa ? pa.split("-") : [];
    for (let k = 0; k < codes.length; k++) {
      const prev = data.nodes[codes.slice(0, k).join("-")];
      if (!prev || TRAINER_POSITIONS.indexOf(prev.actor) !== actorIdx) continue;
      const a = prev.a.find((x) => x.c === codes[k]);
      if (a) for (let h = 0; h < 169; h++) w[h] *= a.s[h] ?? 0;
    }
    return w;
  }, [data, pa, actorIdx]);

  const actions = node ? [...node.a].sort((a, b) => order(a.c) - order(b.c)) : [];
  const combos = (h: number) => (Math.floor(h / 13) === h % 13 ? 6 : Math.floor(h / 13) < h % 13 ? 4 : 12);
  const totals = actions.map((a) => {
    let num = 0;
    let den = 0;
    for (let h = 0; h < 169; h++) {
      const c = combos(h) * weight[h];
      num += c * (a.s[h] ?? 0);
      den += c;
    }
    return den > 0 ? num / den : 0;
  });

  const comboTotals = actions.map((a) => {
    let num = 0;
    for (let h = 0; h < 169; h++) num += combos(h) * weight[h] * (a.s[h] ?? 0);
    return num;
  });
  const ante = 0.125 * 8;
  const pot = r.bet.reduce((x, y) => x + y, 0) + ante;
  const toCall = actorIdx >= 0 ? Math.max(0, Math.max(...r.bet) - (r.bet[actorIdx] ?? 0)) : 0;

  const go = (code: string) => {
    setPa(pa ? `${pa}-${code}` : code);
    setHand(null);
  };
  const back = () => {
    const codes = pa ? pa.split("-") : [];
    codes.pop();
    setPa(codes.join("-"));
    setHand(null);
  };

  return (
    <div>
      {/* スタック */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-bold text-fg-3">MTT・8人卓・ChipEV</span>
        {TRAINER_STACKS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setStack(s);
              setPa("");
              setHand(null);
            }}
            className={`pressable rounded-full px-3 py-1.5 text-[12px] font-bold tabular-nums ${
              stack === s ? "bg-accent text-on-accent" : "bg-white/[0.05] text-fg-2"
            }`}
          >
            {s}bb
          </button>
        ))}
      </div>

      {/* 席の帯(GTO Wizard と同じ並び: 不透明の板に席名と残りスタック。手番は緑の文字。右にポットとポットオッズ) */}
      <div className="mb-3 flex items-stretch gap-1 overflow-x-auto rounded-xl bg-[#1b1b1d] p-1">
        <button
          type="button"
          onClick={back}
          disabled={!pa}
          aria-label="1手もどる"
          className="pressable flex w-9 shrink-0 items-center justify-center rounded-lg bg-[#2a2a2d] text-fg disabled:opacity-30"
        >
          <Icon name="chevron-left" className="h-4 w-4" />
        </button>
        {TRAINER_POSITIONS.map((p, i) => {
          const isActor = i === actorIdx;
          const c = r.last[i];
          return (
            <div
              key={p}
              className={`flex min-w-[58px] shrink-0 flex-col items-center justify-center rounded-lg px-2 py-1 ${
                isActor ? "bg-[#2f2f33]" : "bg-[#252528]"
              } ${r.folded[i] ? "opacity-40" : ""}`}
            >
              <span className={`text-[13px] font-black leading-tight ${isActor ? "text-[#8fe388]" : "text-[#e6e6e6]"}`}>{p}</span>
              <span className={`text-[13px] font-bold leading-tight tabular-nums ${isActor ? "text-[#8fe388]" : "text-[#cfcfcf]"}`}>
                {fmt(r.stacks[i] ?? stack)}
              </span>
              {c && !isActor && <span className="text-[10px] leading-tight text-[#9a9a9a]">{name(c, stack)}</span>}
            </div>
          );
        })}
        <div className="ml-auto flex shrink-0 flex-col justify-center px-2 tabular-nums">
          <span className="text-[13px] font-black text-[#e6e6e6]">{fmt(pot)} BB</span>
          {toCall > 0 && (
            <span className="text-[11px] text-[#9a9a9a]">
              ポットオッズ <b className="text-[#cfcfcf]">{((toCall / (pot + toCall)) * 100).toFixed(0)}%</b>
            </span>
          )}
        </div>
      </div>

      {data === undefined ? (
        <div className="h-[320px] rounded-2xl bg-white/[0.04]" />
      ) : !node ? (
        <p className="rounded-2xl bg-surface px-4 py-6 text-center text-[13px] text-fg-2">
          {r.next < 0 ? "このハンドはここで終わり。" : "この局面のデータはまだ取得中。"}
        </p>
      ) : (
        <>
          {/* 行動の板(不透明の色の板。左上に行動、左下に頻度、右下にコンボ数)。押すとその手順へ進む。 */}
          <div className="rounded-xl bg-[#1b1b1d] p-1">
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
              {actions.map((a, i) => (
                <button
                  key={a.c}
                  type="button"
                  onClick={() => go(a.c)}
                  className="pressable flex h-[104px] flex-col justify-between rounded-lg p-2 text-left text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]"
                  style={{ background: colorOf(a.c) }}
                >
                  <span className="truncate text-[17px] font-bold leading-tight">{name(a.c, stack)}</span>
                  <span className="flex items-end justify-between gap-1">
                    <span className="text-[22px] font-bold leading-none tabular-nums">{fmtPct(totals[i] ?? 0)}</span>
                    <span className="text-right text-[10px] leading-tight tabular-nums opacity-90">
                      {(comboTotals[i] ?? 0).toFixed(2)}
                      <br />
                      combos
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {/* 全体の割合の帯 */}
            <div className="mt-1 flex h-4 overflow-hidden rounded-md">
              {actions.map((a, i) => (
                <span key={a.c} style={{ width: `${(totals[i] ?? 0) * 100}%`, background: colorOf(a.c) }} />
              ))}
            </div>
          </div>

          <div className="h-3" />
          {/* 169 の手の表。マスの中を行動の頻度で塗り分ける。レンジに無い手は薄く。 */}
          <div className="grid gap-[2px]" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
            {Array.from({ length: 169 }, (_, h) => {
              const w = weight[h] ?? 0;
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHand(h)}
                  className={`relative aspect-square overflow-hidden rounded-[3px] bg-white/[0.04] ${hand === h ? "ring-2 ring-fg" : ""}`}
                  style={{ opacity: w < 0.005 ? 0.25 : 1 }}
                >
                  <span className="absolute inset-0 flex">
                    {actions.map((a) => (
                      <span key={a.c} style={{ width: `${(a.s[h] ?? 0) * 100}%`, background: colorOf(a.c) }} />
                    ))}
                  </span>
                  <span className="relative text-[clamp(7px,2.2vw,11px)] font-bold text-fg [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
                    {handName(h)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 選んだ手の内訳 */}
          <div className="mt-3 rounded-2xl bg-surface p-3">
            {hand === null ? (
              <p className="text-[12px] text-fg-3">表の手を押すと、行動ごとの頻度と EV(bb)が出る。</p>
            ) : (
              <>
                <p className="mb-1.5 text-[14px] font-black text-fg">
                  {handName(hand)}
                  {(weight[hand] ?? 0) < 0.999 && (
                    <span className="ml-2 text-[11px] font-bold text-fg-3">レンジ {((weight[hand] ?? 0) * 100).toFixed(0)}%</span>
                  )}
                </p>
                {actions.map((a) => (
                  <div key={a.c} className="flex items-center gap-2 py-0.5 text-[13px] tabular-nums">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colorOf(a.c) }} />
                    <span className="flex-1 text-fg-2">{name(a.c, stack)}</span>
                    <span className="w-16 text-right text-fg">{((a.s[hand] ?? 0) * 100).toFixed(1)}%</span>
                    <span className="w-20 text-right text-fg">{(a.e[hand] ?? 0).toFixed(2)}bb</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
