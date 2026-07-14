"use client";

import { BLIND_STRUCTURE } from "@meta-geo/engine/src/blindStructure.js";

/** ブラインドストラクチャの全体表。プレイ画面の設定メニューやマイページから開くモーダル。 */
export function BlindStructureSheet({ currentLevel, onClose }: { currentLevel?: number; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md max-h-[80vh] overflow-y-auto rounded-t-3xl bg-navy-900 ring-1 ring-navy-700 p-5 pb-[calc(env(safe-area-inset-bottom)+20px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-navy-50">ブラインドストラクチャ</h2>
          <button onClick={onClose} className="text-navy-400 text-xl leading-none px-2" aria-label="閉じる">
            ×
          </button>
        </div>
        <p className="text-[11px] text-navy-400 mb-3">
          開始スタック20,000点 / 1レベル5分 / BB ANTE方式(BBの席がBB額を追加で支払う)
        </p>
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-navy-400 text-[10px]">
              <th className="text-left py-1.5 font-medium">Lv</th>
              <th className="text-right py-1.5 font-medium">SB</th>
              <th className="text-right py-1.5 font-medium">BB</th>
              <th className="text-right py-1.5 font-medium">ANTE</th>
            </tr>
          </thead>
          <tbody>
            {BLIND_STRUCTURE.map((lv) => (
              <tr
                key={lv.level}
                className={`border-t border-navy-800 ${lv.level === currentLevel ? "text-mint-400 font-semibold" : "text-navy-200"}`}
              >
                <td className="py-1.5">{lv.level === currentLevel ? `▶ ${lv.level}` : lv.level}</td>
                <td className="text-right py-1.5">{lv.smallBlind.toLocaleString()}</td>
                <td className="text-right py-1.5">{lv.bigBlind.toLocaleString()}</td>
                <td className="text-right py-1.5">{lv.bbAnte.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-navy-500 mt-3">
          最終レベル以降は優勝者が決まるまで同じ比率でブラインドが上がり続けます。
        </p>
      </div>
    </div>
  );
}
