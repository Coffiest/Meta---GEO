// 169 種類の手どうしのプリフロップの勝率(引き分けは半分)をモンテカルロで計算し、
// apps/web/public/trainer/equity169.json に書く(1000 倍した整数。[i][j] = 手 i の 手 j に対する勝率)。
// 手の並びは表の並び(行=1枚目、スーテッドは右上)。使い方: node scripts/trainer/equity-matrix.mjs [試行数]
import fs from "node:fs";
import path from "node:path";
const N = Number(process.argv[2] ?? 3000);
const R = "AKQJT98765432";
// カード = rank(0..12, 2=0 … A=12) * 4 + suit
const rankOf = (ch) => 12 - R.indexOf(ch);
function combos(i) {
  const r = Math.floor(i / 13), c = i % 13;
  const a = 12 - r, b = 12 - c, out = [];
  if (r === c) { for (let s = 0; s < 4; s++) for (let t = s + 1; t < 4; t++) out.push([a * 4 + s, a * 4 + t]); }
  else if (r < c) { for (let s = 0; s < 4; s++) out.push([a * 4 + s, b * 4 + s]); }
  else { for (let s = 0; s < 4; s++) for (let t = 0; t < 4; t++) if (s !== t) out.push([b * 4 + s, a * 4 + t]); }
  return out;
}
// 7 枚の強さ(大きいほど強い)
function score(cards) {
  const cnt = new Array(13).fill(0), suitMask = [0, 0, 0, 0];
  let mask = 0;
  for (const c of cards) { const r = c >> 2; cnt[r]++; mask |= 1 << r; suitMask[c & 3] |= 1 << r; }
  const straightTop = (m) => {
    const mm = m | ((m >> 12) & 1); // A を 1 としても数える
    for (let t = 12; t >= 3; t--) { const need = t === 3 ? 0b1111 | (1 << 12) : 0b11111 << (t - 4); if ((m & need) === need) return t; }
    return -1;
  };
  for (let s = 0; s < 4; s++) {
    const m = suitMask[s];
    if (popc(m) >= 5) {
      const st = straightTop(m);
      if (st >= 0) return 8e6 + st;
      return 5e6 + topBits(m, 5);
    }
  }
  const quads = [], trips = [], pairs = [], singles = [];
  for (let r = 12; r >= 0; r--) { if (cnt[r] === 4) quads.push(r); else if (cnt[r] === 3) trips.push(r); else if (cnt[r] === 2) pairs.push(r); else if (cnt[r] === 1) singles.push(r); }
  if (quads.length) { const k = Math.max(...[...trips, ...pairs, ...singles]); return 7e6 + quads[0] * 13 + k; }
  if (trips.length && (trips.length > 1 || pairs.length)) { const p = Math.max(trips[1] ?? -1, pairs[0] ?? -1); return 6e6 + trips[0] * 13 + p; }
  const st = straightTop(mask);
  if (st >= 0) return 4e6 + st;
  if (trips.length) { const k = [...pairs, ...singles].sort((a, b) => b - a); return 3e6 + trips[0] * 169 + k[0] * 13 + k[1]; }
  if (pairs.length >= 2) { const k = [...pairs.slice(2), ...singles].sort((a, b) => b - a)[0] ?? 0; return 2e6 + pairs[0] * 169 + pairs[1] * 13 + k; }
  if (pairs.length) { const k = singles; return 1e6 + pairs[0] * 2197 + k[0] * 169 + k[1] * 13 + k[2]; }
  return topBits(mask, 5);
}
function popc(m) { let c = 0; while (m) { m &= m - 1; c++; } return c; }
function topBits(m, n) { let v = 0, k = 0; for (let r = 12; r >= 0 && k < n; r--) if (m & (1 << r)) { v = v * 13 + r; k++; } return v; }
const rnd = Math.random;
const C = Array.from({ length: 169 }, (_, i) => combos(i));
const M = Array.from({ length: 169 }, () => new Array(169).fill(500));
for (let i = 0; i < 169; i++) {
  for (let j = i; j < 169; j++) {
    let win = 0, n = 0;
    for (let t = 0; t < N; t++) {
      const h1 = C[i][Math.floor(rnd() * C[i].length)], h2 = C[j][Math.floor(rnd() * C[j].length)];
      if (h1[0] === h2[0] || h1[0] === h2[1] || h1[1] === h2[0] || h1[1] === h2[1]) continue;
      const used = new Set([...h1, ...h2]); const board = [];
      while (board.length < 5) { const c = Math.floor(rnd() * 52); if (!used.has(c)) { used.add(c); board.push(c); } }
      const a = score([...h1, ...board]), b = score([...h2, ...board]);
      win += a > b ? 1 : a === b ? 0.5 : 0; n++;
    }
    const e = n ? Math.round((win / n) * 1000) : 500;
    M[i][j] = e; M[j][i] = 1000 - e;
  }
}
const out = path.join(path.dirname(new URL(import.meta.url).pathname), "../../apps/web/public/trainer/equity169.json");
fs.writeFileSync(out, JSON.stringify(M));
console.log("AA vs KK", M[0][14] / 10, "AKs vs QQ", M[1][28] / 10, "72o vs AA", M[13 * 12 + 7][0] / 10);
