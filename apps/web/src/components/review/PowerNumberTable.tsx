"use client";

import {
  PN_RANKS,
  POWER_NUMBER_TABLE,
  pnBand,
  pnCellOf,
  type PnBand,
} from "@meta-geo/engine/src/review/powerNumber.js";

/**
 * パワーナンバー表(13×13)。出典の表と同じ数字・同じ色・同じ見た目(白地に黒の数字、細い罫、色の帯)で、
 * 画像ではなく部品として描く(オーナー指示: 画像を転載せず、同じものを自作して出す)。
 * 右上の三角がスーテッド、対角がペア、左下の三角がオフスート。自分の手のマスを太い枠で示す。
 *
 * 色は出典の表から採った値。データ可視化の配色なので、アプリのアクセントの規則の対象外(CLAUDE.md の例外)。
 */
const BAND_BG: Record<PnBand, string> = {
  red: "#DAC1BC",
  blue: "#98B1D9",
  yellow: "#FCEE73",
  white: "#E8E4D3",
};

export function PowerNumberTable({ highlight }: { highlight?: string }) {
  const hl = highlight ? pnCellOf(highlight) : null;
  return (
    <div className="overflow-hidden rounded-xl bg-white p-2 text-black shadow-e1">
      <table className="w-full table-fixed border-collapse tabular-nums" style={{ fontFamily: "system-ui, sans-serif" }}>
        <thead>
          <tr>
            <th className="w-[7.1%]" />
            {PN_RANKS.map((r) => (
              <th key={r} className="border-b-2 border-black pb-0.5 text-center text-[11px] font-semibold">
                {r}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {POWER_NUMBER_TABLE.map((row, ri) => (
            <tr key={PN_RANKS[ri]}>
              <th className="border-r-2 border-black pr-0.5 text-center text-[11px] font-semibold">{PN_RANKS[ri]}</th>
              {row.map((v, ci) => {
                const on = hl !== null && hl[0] === ri && hl[1] === ci;
                return (
                  <td
                    key={ci}
                    className="relative h-[22px] border border-[#9a9a9a] p-0 text-center text-[10.5px] leading-none"
                    style={{ backgroundColor: v === null ? "#E8E4D3" : BAND_BG[pnBand(v)] }}
                  >
                    {v === null ? "" : v === Infinity ? <span className="text-[14px] leading-none">∞</span> : v}
                    {on && <span aria-hidden className="pointer-events-none absolute -inset-[2px] z-10 rounded-[3px] ring-[2.5px] ring-black" />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1.5 px-0.5 text-[9.5px] leading-snug text-[#333]">
        右上: スーテッド / 対角: ペア / 左下: オフスート。有効M が数字より小さければオールイン。∞ はいつでもオールイン、空欄は有効M が 3 未満のときだけ。
      </p>
    </div>
  );
}
