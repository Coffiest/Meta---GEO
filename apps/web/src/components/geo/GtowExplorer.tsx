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

  // 席の帯(GTO Wizard と同じ): 行動済みの席・手番の席・この先の席を順に並べ、それぞれの選べる行動を出す。
  type Card = { prefix: string; pos: string; stack: number; options: string[]; chosen: string | null; current: boolean };
  const cards: Card[] = [];
  if (data) {
    const codes = pa ? pa.split("-") : [];
    const cardAt = (prefix: string, chosen: string | null, current: boolean): Card | null => {
      const rr = replay(prefix, stack);
      const nd = data.nodes[prefix];
      const idx = nd ? TRAINER_POSITIONS.indexOf(nd.actor) : rr.next;
      if (idx < 0) return null;
      const opts = nd ? [...nd.a].sort((a, b) => order(b.c) - order(a.c)).map((x) => x.c) : chosen ? [chosen] : [];
      return { prefix, pos: TRAINER_POSITIONS[idx]!, stack: rr.stacks[idx] ?? stack, options: opts, chosen, current };
    };
    for (let k = 0; k < codes.length; k++) {
      const c = cardAt(codes.slice(0, k).join("-"), codes[k]!, false);
      if (c) cards.push(c);
    }
    const cur = cardAt(pa, null, true);
    if (cur) {
      cards.push(cur);
      // この先: 手番の人より後ろの席を、前の人が降りた形で見せる(GTO Wizard と同じ)。
      let q = pa;
      const seen = new Set([cur.pos]);
      for (let n = 0; n < 7; n++) {
        q = q ? `${q}-F` : "F";
        const c = cardAt(q, null, false);
        if (!c || seen.has(c.pos)) break;
        seen.add(c.pos);
        cards.push(c);
      }
    }
  }
  const pick = (prefix: string, code: string) => {
    setPa(prefix ? `${prefix}-${code}` : code);
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

      {/* 席の帯。席ごとの板に、席名・残りスタックと選べる行動を並べ、押して手順を進める(GTO Wizard と同じ使い方)。
          選んだ行動は白、手番の席は緑の枠。 */}
      <div className="mb-3 flex items-stretch gap-1 overflow-x-auto rounded-xl bg-[#1b1b1d] p-1">
        <div className="flex shrink-0 flex-col justify-between rounded-lg bg-[#252528] px-2 py-1.5">
          <span className="text-[12px] font-bold text-[#cfcfcf]">MTT {stack}bb</span>
          <span className="text-[11px] text-[#9a9a9a]">ChipEV</span>
          <span className="text-[11px] tabular-nums text-[#9a9a9a]">
            ポット <b className="text-[#e6e6e6]">{fmt(pot)}</b>
          </span>
          <button
            type="button"
            onClick={back}
            disabled={!pa}
            aria-label="1手もどる"
            className="pressable mt-1 flex h-7 items-center justify-center rounded-md bg-[#323236] text-fg disabled:opacity-30"
          >
            <Icon name="chevron-left" className="h-4 w-4" />
          </button>
        </div>
        {cards.map((c, i) => (
          <div
            key={`${c.prefix}|${i}`}
            className={`flex min-w-[96px] shrink-0 flex-col rounded-lg px-2 py-1.5 ${c.current ? "bg-[#252528] ring-2 ring-[#8fe388]" : "bg-[#252528]"}`}
          >
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className={`text-[13px] font-black ${c.current ? "text-[#8fe388]" : "text-[#cfcfcf]"}`}>{c.pos}</span>
              <span className={`text-[12px] font-bold tabular-nums ${c.current ? "text-[#8fe388]" : "text-[#9a9a9a]"}`}>{fmt(c.stack)}</span>
            </div>
            {c.options.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => pick(c.prefix, o)}
                className={`pressable rounded px-0.5 text-left text-[13px] leading-[1.45] tabular-nums ${
                  c.chosen === o ? "font-bold text-white" : c.current ? "text-[#e6e6e6]" : "text-[#8a8a8a]"
                }`}
              >
                {name(o, stack)}
              </button>
            ))}
          </div>
        ))}
      </div>

      {data === undefined ? (
        <div className="h-[320px] rounded-2xl bg-white/[0.04]" />
      ) : !node ? (
        <p className="rounded-2xl bg-surface px-4 py-6 text-center text-[13px] text-fg-2">
          {r.next < 0 ? "このハンドはここで終わり。" : "この局面のデータはまだ取得中。"}
        </p>
      ) : (
        // スマホ: 行動の板 → 表 → 内訳 の縦並び。PC: GTO Wizard と同じく左に表、右に行動の板と内訳。表は画面の高さに収める。
        <div className="grid gap-3 [grid-template-areas:'t'_'m'_'d'] lg:items-start lg:gap-4 lg:[grid-template-areas:'m_t'_'m_d'] lg:grid-cols-[minmax(0,1fr)_minmax(380px,520px)] lg:grid-rows-[auto_1fr]">
          {/* 行動の板(不透明の色の板。左上に行動、左下に頻度、右下にコンボ数)。見るためのもので押せない。行動は上の席の帯で選ぶ。 */}
          <div className="rounded-xl bg-[#1b1b1d] p-1" style={{ gridArea: "t" }}>
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
              {actions.map((a, i) => (
                <div
                  key={a.c}
                  className="flex h-[104px] flex-col justify-between rounded-lg p-2 text-left text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]"
                  style={{ background: colorOf(a.c) }}
                >
                  <span className={`truncate font-bold leading-tight ${actions.length > 3 ? "text-[14px] sm:text-[17px]" : "text-[17px]"}`}>{name(a.c, stack)}</span>
                  <span className="flex items-end justify-between gap-1">
                    <span className={`font-bold leading-none tabular-nums ${actions.length > 3 ? "text-[17px] sm:text-[22px]" : "text-[22px]"}`}>{fmtPct(totals[i] ?? 0)}</span>
                    <span className={`text-right text-[10px] leading-tight tabular-nums opacity-90 ${actions.length > 3 ? "hidden sm:inline" : ""}`}>
                      {(comboTotals[i] ?? 0).toFixed(2)}
                      <br />
                      combos
                    </span>
                  </span>
                </div>
              ))}
            </div>
            {/* 全体の割合の帯 */}
            <div className="mt-1 flex h-4 overflow-hidden rounded-md">
              {actions.map((a, i) => (
                <span key={a.c} style={{ width: `${(totals[i] ?? 0) * 100}%`, background: colorOf(a.c) }} />
              ))}
            </div>
          </div>

          {/* 169 の手の表。マスの中を行動の頻度で塗り分ける。レンジに無い手は薄く。 */}
          <div style={{ gridArea: "m" }} className="lg:rounded-xl lg:bg-[#1b1b1d] lg:p-2">
          <div className="mx-auto grid w-full gap-[2px] lg:max-w-[calc(100dvh-300px)]" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
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
                  <span className="relative text-[clamp(7px,2.2vw,11px)] font-bold text-fg lg:text-[clamp(8px,0.75vw,12px)] [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
                    {handName(h)}
                  </span>
                </button>
              );
            })}
          </div>
          </div>

          {/* 選んだ手の内訳 */}
          <div className="rounded-xl bg-[#1b1b1d] p-3" style={{ gridArea: "d" }}>
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
        </div>
      )}
    </div>
  );
}
