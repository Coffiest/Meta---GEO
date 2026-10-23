/**
 * ブラウザ用の node:crypto の置き換え(engine の deck.ts の randomInt だけを使う)。
 * レッスンの練習の卓は端末の中で配るため、engine をブラウザでも読む。
 * 偏りの無い整数を Web Crypto で作る(棄却法)。本番の卓はサーバーの node:crypto のまま。
 */
export function randomInt(min, max) {
  const range = max - min;
  const limit = Math.floor(0x100000000 / range) * range;
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) return min + (buf[0] % range);
  }
}
