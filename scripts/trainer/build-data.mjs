// 特訓のデータを作る。取得した生のファイル(場面の配列の JSON。複数可)を読み、
// スタックごとに apps/web/public/trainer/<スタック>.json へまとめる(既存の場面に足す)。
// 使い方: node scripts/trainer/build-data.mjs <生のファイル>...
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), "../../apps/web/public/trainer");
fs.mkdirSync(OUT, { recursive: true });
const POS = { "UTG+1": "UTG1" };
const byStack = new Map();
const load = (stack) => {
  if (!byStack.has(stack)) {
    const f = path.join(OUT, `${stack}.json`);
    byStack.set(stack, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : { stack, nodes: {} });
  }
  return byStack.get(stack);
};
for (const file of process.argv.slice(2)) {
  for (const n of JSON.parse(fs.readFileSync(file, "utf8"))) {
    const stack = Math.round(Number(n.d));
    load(stack).nodes[n.pa] = {
      actor: POS[n.actor] ?? n.actor,
      a: n.acts.map((x) => ({ c: x.code, s: x.s.map((v) => Math.round(v * 1000) / 1000), e: x.e.map((v) => Math.round(v * 100) / 100) })),
    };
  }
}
for (const [stack, data] of byStack) {
  fs.writeFileSync(path.join(OUT, `${stack}.json`), JSON.stringify(data));
  console.log(stack, Object.keys(data.nodes).length);
}
