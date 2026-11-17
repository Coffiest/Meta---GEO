"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { PlayingCard } from "@/components/PlayingCard";
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
  const [topTab, setTopTab] = useState("Overview");
  const [filter, setFilter] = useState<HandFilter>("all");
  const [eq, setEq] = useState<number[][] | null>(null);
  useEffect(() => {
    void loadEquity().then(setEq);
  }, []);

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

  // 相手: 手番の人より前に最後にレイズした人(いなければ BB)。その人のこの局面までのレンジ。
  const villainIdx = useMemo(() => {
    const codes = pa ? pa.split("-") : [];
    let v = -1;
    for (let k = 0; k < codes.length; k++) {
      const c = codes[k]!;
      if (c.startsWith("R")) {
        const prev = data?.nodes[codes.slice(0, k).join("-")];
        const idx = prev ? TRAINER_POSITIONS.indexOf(prev.actor) : replay(codes.slice(0, k).join("-"), stack).next;
        if (idx !== actorIdx) v = idx;
      }
    }
    return v >= 0 ? v : actorIdx === 7 ? 6 : 7;
  }, [data, pa, actorIdx, stack]);
  const villainWeight = useMemo(() => {
    const w = Array(169).fill(1);
    if (!data) return w;
    const codes = pa ? pa.split("-") : [];
    for (let k = 0; k < codes.length; k++) {
      const prev = data.nodes[codes.slice(0, k).join("-")];
      if (!prev || TRAINER_POSITIONS.indexOf(prev.actor) !== villainIdx) continue;
      const a = prev.a.find((x) => x.c === codes[k]);
      if (a) for (let h = 0; h < 169; h++) w[h] *= a.s[h] ?? 0;
    }
    return w;
  }, [data, pa, villainIdx]);

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
          <div style={{ gridArea: "t" }}>
          <PanelTabs tabs={["Overview", "Table", "Equity chart"]} active={topTab} onPick={setTopTab} />
          {topTab === "Table" ? (
            <TableView r={r} actorIdx={actorIdx} stack={stack} pot={pot} />
          ) : topTab === "Equity chart" ? (
            <EquityChart
              eq={eq}
              hero={weight}
              villain={villainWeight}
              heroName={TRAINER_POSITIONS[actorIdx] ?? ""}
              villainName={TRAINER_POSITIONS[villainIdx] ?? ""}
            />
          ) : (
          <div className="mb-2 flex gap-1 overflow-x-auto rounded-b-xl rounded-tr-xl bg-[#1b1b1d] p-1">
            {TRAINER_POSITIONS.map((p, i) => (
              <div
                key={p}
                className={`flex min-w-[44px] flex-1 flex-col items-center rounded-md bg-[#252528] px-1 py-1 text-[12px] font-bold leading-tight tabular-nums ${
                  i === actorIdx ? "text-[#8fe388]" : r.folded[i] ? "text-[#6a6a6a]" : "text-[#e6e6e6]"
                }`}
              >
                <span>{p}</span>
                <span>{fmt(r.stacks[i] ?? stack)}</span>
              </div>
            ))}
            <div className="flex shrink-0 flex-col justify-center px-1.5 text-[11px] leading-tight tabular-nums">
              <span className="font-bold text-[#e6e6e6]">{fmt(pot)} BB</span>
              <span className="text-[#9a9a9a]">Pot{toCall > 0 ? ` ${((toCall / (pot + toCall)) * 100).toFixed(0)}%` : ""}</span>
            </div>
          </div>
          )}
          <PanelTabs tabs={["Actions"]} active="Actions" />
          <div className="rounded-b-xl rounded-tr-xl bg-[#1b1b1d] p-1">
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
                  className={`relative aspect-square overflow-hidden rounded-[2px] bg-[#2a2a2d] ${hand === h ? "ring-2 ring-white" : ""}`}
                  style={{ opacity: w < 0.005 || !matchFilter(h, filter) ? 0.25 : 1 }}
                >
                  <span className="absolute inset-0 flex">
                    {actions.map((a) => (
                      <span key={a.c} style={{ width: `${(a.s[h] ?? 0) * 100}%`, background: colorOf(a.c) }} />
                    ))}
                  </span>
                  <span className="absolute left-[6%] top-[4%] text-[clamp(7px,2.2vw,11px)] font-medium text-white lg:text-[clamp(9px,0.9vw,15px)] [text-shadow:0_1px_1px_rgba(0,0,0,0.4)]">
                    {handName(h)}
                  </span>
                </button>
              );
            })}
          </div>
          </div>

          {/* 手札ごとの内訳(GTO Wizard の Hands / Summary)。表の手を押して選ぶ。 */}
          <div style={{ gridArea: "d" }}>
            <HandsPanel
              hand={hand ?? 0}
              actions={actions}
              stack={stack}
              weight={weight[hand ?? 0] ?? 0}
              filter={filter}
              setFilter={setFilter}
              villainWeight={villainWeight}
              villainName={TRAINER_POSITIONS[villainIdx] ?? ""}
              villainNode={villainNodeOf(data, pa, villainIdx)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function PanelTabs({ tabs, active, onPick }: { tabs: string[]; active: string; onPick?: (t: string) => void }) {
  return (
    <div className="flex">
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onPick?.(t)}
          disabled={!onPick && t !== active}
          className={`rounded-t-xl px-4 py-1.5 text-[14px] ${t === active ? "bg-[#1b1b1d] font-bold text-white" : "text-[#9a9a9a] disabled:cursor-default"}`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

const SUITS = ["s", "h", "d", "c"] as const;

/** 手の名前(AA / AKs / AKo)から、スートの組み合わせを全部作る。 */
export function combosOf(label: string): [string, string][] {
  const a = label[0]!;
  const b = label[1]!;
  const out: [string, string][] = [];
  if (label.length === 2) {
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) out.push([a + SUITS[i], b + SUITS[j]]);
  } else if (label[2] === "s") {
    for (const s of SUITS) out.push([a + s, b + s]);
  } else {
    for (const s1 of SUITS) for (const s2 of SUITS) if (s1 !== s2) out.push([a + s1, b + s2]);
  }
  return out;
}

export function CardChip({ c }: { c: string }) {
  // アプリのトランプの絵(PlayingCard)をそのまま使う。
  return <PlayingCard card={c} size="xs" />;
}

function HandsPanel({
  hand,
  actions,
  stack,
  weight,
  filter,
  setFilter,
  villainWeight,
  villainName,
  villainNode,
}: {
  hand: number;
  actions: { c: string; s: number[]; e: number[] }[];
  stack: number;
  weight: number;
  filter: HandFilter;
  setFilter: (f: HandFilter) => void;
  villainWeight: number[];
  villainName: string;
  villainNode: TrainerNode | null;
}) {
  const [tab, setTab] = useState("Hands");
  const label = handName(hand);
  // いちばん多い行動の色でマスを塗る(GTO Wizard と同じ)。
  const top = actions.reduce((b, a) => ((a.s[hand] ?? 0) > (b.s[hand] ?? 0) ? a : b), actions[0]!);
  return (
    <div>
      <PanelTabs tabs={["Hands", "Summary", "Filters", "Blockers"]} active={tab} onPick={setTab} />
      <div className="rounded-b-xl rounded-tr-xl bg-[#1b1b1d] p-1">
        {tab === "Filters" ? (
          <FiltersView filter={filter} setFilter={setFilter} />
        ) : tab === "Blockers" ? (
          <BlockersView hand={hand} villainWeight={villainWeight} villainName={villainName} villainNode={villainNode} stack={stack} />
        ) : tab === "Hands" ? (
          <div className="grid grid-cols-2 gap-[2px] sm:grid-cols-3">
            {combosOf(label).map(([c1, c2]) => (
              <div key={c1 + c2} className="flex min-h-[96px] flex-col justify-between p-1.5" style={{ background: colorOf(top.c), opacity: weight < 0.005 ? 0.35 : 1 }}>
                <div className="flex items-start justify-between">
                  <span className="flex gap-0.5">
                    <CardChip c={c1} />
                    <CardChip c={c2} />
                  </span>
                  <span className="text-[12px] text-white">%</span>
                </div>
                <div className="text-[12px] leading-tight text-white tabular-nums">
                  {actions.map((a) => (
                    <div key={a.c} className="flex justify-between gap-1">
                      <span className="truncate">{name(a.c, stack)}</span>
                      <span>{+((a.s[hand] ?? 0) * 100).toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-2">
            <p className="mb-1.5 text-[14px] font-black text-white">
              {label}
              <span className="ml-2 text-[11px] font-bold text-[#9a9a9a]">レンジ {(weight * 100).toFixed(0)}%</span>
            </p>
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-[13px] tabular-nums">
              <span className="text-[11px] text-[#9a9a9a]">行動</span>
              <span className="text-right text-[11px] text-[#9a9a9a]">頻度</span>
              <span className="text-right text-[11px] text-[#9a9a9a]">EV</span>
              {actions.map((a) => (
                <Fragment key={a.c}>
                  <span className="flex items-center gap-2 text-[#cfcfcf]">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorOf(a.c) }} />
                    {name(a.c, stack)}
                  </span>
                  <span className="text-right text-white">{((a.s[hand] ?? 0) * 100).toFixed(1)}%</span>
                  <span className="text-right text-white">{(a.e[hand] ?? 0).toFixed(2)}</span>
                </Fragment>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Filters ----------
export type HandFilter = "all" | "pairs" | "suited" | "offsuit" | "broadway" | "ax" | "connectors";
const FILTERS: { k: HandFilter; label: string }[] = [
  { k: "all", label: "すべて" },
  { k: "pairs", label: "ペア" },
  { k: "suited", label: "スーテッド" },
  { k: "offsuit", label: "オフスート" },
  { k: "broadway", label: "ブロードウェイ" },
  { k: "ax", label: "Ax" },
  { k: "connectors", label: "コネクター" },
];
export function matchFilter(h: number, f: HandFilter): boolean {
  const r = Math.floor(h / 13);
  const c = h % 13;
  const hi = Math.min(r, c);
  const lo = Math.max(r, c);
  switch (f) {
    case "all":
      return true;
    case "pairs":
      return r === c;
    case "suited":
      return r < c;
    case "offsuit":
      return r > c;
    case "broadway":
      return lo <= 4;
    case "ax":
      return hi === 0 && r !== c;
    case "connectors":
      return lo - hi === 1;
  }
}
export function FiltersView({ filter, setFilter }: { filter: HandFilter; setFilter: (f: HandFilter) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 p-2">
      {FILTERS.map((f) => (
        <button
          key={f.k}
          type="button"
          onClick={() => setFilter(f.k)}
          className={`pressable rounded-md px-3 py-1.5 text-[13px] font-bold ${filter === f.k ? "bg-white text-[#1b1b1d]" : "bg-[#2a2a2d] text-[#cfcfcf]"}`}
        >
          {f.label}
        </button>
      ))}
      <p className="w-full pt-1 text-[11px] text-[#9a9a9a]">当てはまらない手は表で薄く出す。</p>
    </div>
  );
}

// ---------- Table ----------
function TableView({ r, actorIdx, stack, pot }: { r: ReturnType<typeof replay>; actorIdx: number; stack: number; pot: number }) {
  // 楕円の卓に 8 席(下が BB の左、時計回りに UTG…)
  const W = 360;
  const H = 200;
  return (
    <div className="mb-2 rounded-b-xl rounded-tr-xl bg-[#1b1b1d] p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <ellipse cx={W / 2} cy={H / 2} rx={W / 2 - 40} ry={H / 2 - 30} fill="#1f3b33" stroke="#3a3a3d" strokeWidth={6} />
        <text x={W / 2} y={H / 2 + 4} textAnchor="middle" fill="#e6e6e6" fontSize={13} fontWeight={700}>
          Pot {fmt(pot)} BB
        </text>
        {TRAINER_POSITIONS.map((p, i) => {
          const ang = Math.PI / 2 + ((i + 1) / 8) * Math.PI * 2;
          const x = W / 2 + Math.cos(ang) * (W / 2 - 34);
          const y = H / 2 + Math.sin(ang) * (H / 2 - 22);
          const bx = W / 2 + Math.cos(ang) * (W / 2 - 92);
          const by = H / 2 + Math.sin(ang) * (H / 2 - 62);
          const bet = r.bet[i] ?? 0;
          const active = i === actorIdx;
          return (
            <g key={p} opacity={r.folded[i] ? 0.35 : 1}>
              <rect x={x - 30} y={y - 15} width={60} height={30} rx={6} fill="#252528" stroke={active ? "#8fe388" : "none"} strokeWidth={2} />
              <text x={x} y={y - 2} textAnchor="middle" fontSize={11} fontWeight={800} fill={active ? "#8fe388" : "#e6e6e6"}>
                {p}
              </text>
              <text x={x} y={y + 11} textAnchor="middle" fontSize={10} fill="#cfcfcf">
                {fmt(r.stacks[i] ?? stack)}
              </text>
              {bet > 0 && (
                <text x={bx} y={by + 4} textAnchor="middle" fontSize={10} fontWeight={700} fill="#f5d36b">
                  {fmt(bet)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------- Equity chart ----------
let eqPromise: Promise<number[][] | null> | null = null;
export function loadEquity() {
  eqPromise ??= fetch("/trainer/equity169.json")
    .then((r) => (r.ok ? (r.json() as Promise<number[][]>) : null))
    .catch(() => null);
  return eqPromise;
}
export const combosN = (h: number) => (Math.floor(h / 13) === h % 13 ? 6 : Math.floor(h / 13) < h % 13 ? 4 : 12);
/** レンジ a の各手の、レンジ b に対する勝率(0〜1)。カードの重なりは無視する近似。 */
export function rangeEquity(eq: number[][], a: number[], b: number[]) {
  const den = b.reduce((s, w, j) => s + w * combosN(j), 0);
  return a.map((_, i) => (den > 0 ? b.reduce((s, w, j) => s + (eq[i]![j]! / 1000) * w * combosN(j), 0) / den : 0.5));
}
export function curve(eqs: number[], w: number[]) {
  const items = eqs.map((e, i) => ({ e, c: (w[i] ?? 0) * combosN(i) })).filter((x) => x.c > 1e-6);
  items.sort((x, y) => y.e - x.e);
  const tot = items.reduce((s, x) => s + x.c, 0);
  let acc = 0;
  const pts: [number, number][] = [];
  let avg = 0;
  for (const it of items) {
    pts.push([acc / tot, it.e]);
    acc += it.c;
    pts.push([acc / tot, it.e]);
    avg += it.e * it.c;
  }
  return { pts, avg: tot > 0 ? avg / tot : 0, combos: tot };
}
function EquityChart({ eq, hero, villain, heroName, villainName }: { eq: number[][] | null; hero: number[]; villain: number[]; heroName: string; villainName: string }) {
  if (!eq) return <div className="mb-2 h-[200px] rounded-b-xl rounded-tr-xl bg-[#1b1b1d]" />;
  const h = curve(rangeEquity(eq, hero, villain), hero);
  const v = curve(rangeEquity(eq, villain, hero), villain);
  const W = 360;
  const H = 180;
  const path = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${(x * W).toFixed(1)},${((1 - y) * H).toFixed(1)}`).join(" ");
  return (
    <div className="mb-2 rounded-b-xl rounded-tr-xl bg-[#1b1b1d] p-2">
      <div className="mb-1 flex gap-4 text-[12px] tabular-nums">
        <span className="text-[#8fe388]">
          {heroName} 平均 {(h.avg * 100).toFixed(1)}%
        </span>
        <span className="text-[#e6a23c]">
          {villainName} 平均 {(v.avg * 100).toFixed(1)}%
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {[0.25, 0.5, 0.75].map((y) => (
          <line key={y} x1={0} x2={W} y1={(1 - y) * H} y2={(1 - y) * H} stroke="#2f2f33" strokeWidth={1} />
        ))}
        <path d={path(v.pts)} fill="none" stroke="#e6a23c" strokeWidth={2} />
        <path d={path(h.pts)} fill="none" stroke="#8fe388" strokeWidth={2} />
      </svg>
      <p className="mt-1 text-[10px] text-[#9a9a9a]">縦: 勝率 / 横: レンジの中の位置(強い順)。プリフロップのオールイン勝率で、カードの重なりは無視した近似。</p>
    </div>
  );
}

// ---------- Blockers ----------
function villainNodeOf(data: TrainerData | null | undefined, pa: string, villainIdx: number): TrainerNode | null {
  if (!data) return null;
  const codes = pa ? pa.split("-") : [];
  let found: TrainerNode | null = null;
  for (let k = 0; k < codes.length; k++) {
    const n = data.nodes[codes.slice(0, k).join("-")];
    if (n && TRAINER_POSITIONS.indexOf(n.actor) === villainIdx) found = n;
  }
  return found;
}
function cardsOfClass(i: number): number[][] {
  const r = Math.floor(i / 13);
  const c = i % 13;
  const out: number[][] = [];
  if (r === c) for (let s = 0; s < 4; s++) for (let t = s + 1; t < 4; t++) out.push([r * 4 + s, r * 4 + t]);
  else if (r < c) for (let s = 0; s < 4; s++) out.push([r * 4 + s, c * 4 + s]);
  else for (let s = 0; s < 4; s++) for (let t = 0; t < 4; t++) if (s !== t) out.push([c * 4 + s, r * 4 + t]);
  return out;
}
function BlockersView({ hand, villainWeight, villainName, villainNode, stack }: { hand: number; villainWeight: number[]; villainName: string; villainNode: TrainerNode | null; stack: number }) {
  const mine = cardsOfClass(hand);
  // 自分の手(スートの組み合わせの平均)で、相手の各手のコンボがどれだけ残るか。
  const remain = Array.from({ length: 169 }, (_, j) => {
    const theirs = cardsOfClass(j);
    let left = 0;
    for (const m of mine) left += theirs.filter((t) => !t.some((x) => m.includes(x))).length;
    return left / mine.length;
  });
  let before = 0;
  let after = 0;
  for (let j = 0; j < 169; j++) {
    before += (villainWeight[j] ?? 0) * combosN(j);
    after += (villainWeight[j] ?? 0) * remain[j]!;
  }
  // 相手が行動した局面での、行動の割合(全部の手で数える。自分の手のカードを抜くと割合がどう変わるか)。
  const rows = (villainNode?.a ?? []).map((a) => {
    let b = 0;
    let bd = 0;
    let af = 0;
    let ad = 0;
    for (let j = 0; j < 169; j++) {
      b += combosN(j) * (a.s[j] ?? 0);
      bd += combosN(j);
      af += remain[j]! * (a.s[j] ?? 0);
      ad += remain[j]!;
    }
    return { c: a.c, before: bd > 0 ? b / bd : 0, after: ad > 0 ? af / ad : 0 };
  });
  return (
    <div className="p-2 text-[13px] tabular-nums text-[#cfcfcf]">
      <p className="mb-2 text-white">
        <b>{handName(hand)}</b> を持つと、{villainName} のレンジのコンボは {before.toFixed(1)} → {after.toFixed(1)}(
        {before > 0 ? (((before - after) / before) * 100).toFixed(1) : "0"}% 減る)
      </p>
      {rows.length > 0 && (
        <>
          <p className="mb-1 text-[11px] text-[#9a9a9a]">{villainName} の行動の割合(この手を持っていない場合 → 持っている場合)</p>
          {rows.map((x) => (
            <div key={x.c} className="flex items-center gap-2 py-0.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorOf(x.c) }} />
              <span className="flex-1">{name(x.c, stack)}</span>
              <span className="w-16 text-right">{(x.before * 100).toFixed(1)}%</span>
              <span className="w-4 text-center text-[#6a6a6a]">→</span>
              <span className="w-16 text-right text-white">{(x.after * 100).toFixed(1)}%</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
