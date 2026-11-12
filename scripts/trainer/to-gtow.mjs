// 特訓のデータ(apps/web/public/trainer/<スタック>.json。GTO Wizard の解の数値そのもの)から、
// 棋譜解析・Database・解説の表が読む場面のファイル packages/engine/data/gtow/<スタック>/<場面>.json を作る。
// 8max の解を LJ 以降の6人として使う(UTG・UTG1 がフォールドした場面だけ)。アプリの「UTG」はデータの「LJ」。
// 使い方: node scripts/trainer/to-gtow.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "../..");
const IN = path.join(ROOT, "apps/web/public/trainer");
const OUT = path.join(ROOT, "packages/engine/data/gtow");
const POS = ["UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
const R = "AKQJT98765432";
const label = (i) => {
  const r = Math.floor(i / 13), c = i % 13;
  return r === c ? R[r] + R[c] : r < c ? `${R[r]}${R[c]}s` : `${R[c]}${R[r]}o`;
};

/** 場面名(pa)を、誰が何をしたかの列にする。 */
function replay(pa, stack) {
  const codes = pa ? pa.split("-") : [];
  const bet = [0, 0, 0, 0, 0, 0, 0.5, 1];
  const folded = Array(8).fill(false);
  const acted = Array(8).fill(false);
  const steps = [];
  let i = 0;
  for (const c of codes) {
    steps.push({ pos: POS[i], code: c });
    const top = Math.max(...bet);
    if (c === "F") folded[i] = true;
    else if (c === "C" || c === "X") bet[i] = top;
    else {
      bet[i] = c === "RAI" ? stack : Number(c.slice(1));
      for (let k = 0; k < 8; k++) if (k !== i) acted[k] = false;
    }
    acted[i] = true;
    const t2 = Math.max(...bet);
    let next = -1;
    for (let k = 1; k <= 8; k++) {
      const j = (i + k) % 8;
      if (!folded[j] && (!acted[j] || bet[j] < t2)) { next = j; break; }
    }
    i = next;
  }
  return { steps, actor: i >= 0 ? POS[i] : null };
}

const isR = (c) => c.startsWith("R");
const P = (p) => p; // ファイルの名前は 8max の名前のまま(LJ…BB)

/** gtowSceneOf(packages/db/src/gtowPreflop.ts)と同じ名前の付け方。 */
function sceneOf(steps, me) {
  if (steps.length < 2 || steps[0].code !== "F" || steps[1].code !== "F") return null;
  const rest = steps.slice(2);
  if (rest.some((s) => s.code === "C" || s.code === "X")) return null;
  const raises = rest.filter((s) => isR(s.code));
  const ai = (s) => s.code === "RAI";
  if (raises.length === 0) return me === "BB" ? null : `RFI_${P(me)}`;
  const [r1, r2, r3, r4] = raises;
  if (raises.length === 1 && !ai(r1) && r1.pos !== me) return `vsOpen_${P(me)}_vs_${P(r1.pos)}`;
  if (raises.length === 2 && r1.pos === me && !ai(r2)) return `vs3bet_${P(me)}_vs_${P(r2.pos)}`;
  if (raises.length === 3 && r2.pos === me && r3.pos === r1.pos) return `${ai(r3) ? "vs4betAI" : "vs4bet"}_${P(me)}_vs_${P(r1.pos)}`;
  if (raises.length === 4 && r1.pos === me && r3.pos === me && r4.pos === r2.pos && ai(r4)) return `vs5bet_${P(me)}_vs_${P(r2.pos)}`;
  return null;
}

let written = 0;
for (const f of fs.readdirSync(IN).filter((x) => x.endsWith(".json"))) {
  const data = JSON.parse(fs.readFileSync(path.join(IN, f), "utf8"));
  const stack = data.stack;
  const nodes = data.nodes;
  const seen = new Set();
  for (const [pa, node] of Object.entries(nodes)) {
    const { steps, actor } = replay(pa, stack);
    if (!actor) continue;
    const scene = sceneOf(steps, actor);
    if (!scene || seen.has(scene)) continue;
    seen.add(scene);
    // この場面に来るまでの自分の行動の頻度(手ごと)を掛けて、レンジの重みにする。
    const weight = Array(169).fill(1);
    const codes = pa ? pa.split("-") : [];
    for (let k = 0; k < codes.length; k++) {
      if (steps[k].pos !== actor) continue;
      const prev = nodes[codes.slice(0, k).join("-")];
      const a = prev?.a.find((x) => x.c === codes[k]);
      if (a) for (let h = 0; h < 169; h++) weight[h] *= a.s[h] ?? 0;
    }
    const hands = {};
    for (let h = 0; h < 169; h++) {
      const out = { raise: 0, call: 0, fold: 0, allIn: 0, weight: Math.round(weight[h] * 1000) / 1000 };
      const ev = {};
      let bestRaise = -1;
      for (const x of node.a) {
        const s = x.s[h] ?? 0;
        const e = x.e[h] ?? 0;
        if (x.c === "F") { out.fold += s; ev.fold = e; }
        else if (x.c === "C" || x.c === "X") { out.call += s; ev.call = e; }
        else if (x.c === "RAI") { out.allIn += s; ev.allIn = e; }
        else {
          out.raise += s;
          if (s > bestRaise) { bestRaise = s; ev.raise = e; }
        }
      }
      for (const k of ["raise", "call", "fold", "allIn"]) out[k] = Math.round(out[k] * 1000) / 1000;
      out.ev = ev;
      hands[label(h)] = out;
    }
    const dir = path.join(OUT, String(stack));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${scene}.json`),
      JSON.stringify({
        format: "MTT ChipEV 8max (LJ以降を6人として使用)",
        stack,
        scene,
        source: "GTO Wizard の解の数値(特訓のデータから変換)",
        line: pa,
        hands,
      }),
    );
    written++;
  }
}
console.log("written", written);
