"use client";

import { Icon } from "@/components/Icon";
import { mergeOpenRaiseOptions, OPEN_RAISE_BUCKET, OPEN_RAISE_SOURCE_BUCKETS, type ActionOption, type MergedActionOption } from "@/lib/geoApi";
import { bucketColor, bucketOrderIndex } from "./colors";
import type { PillBarItem, PositionPillItem, Street } from "./PositionPillBar";

/**
 * PC(lg以上)専用のナビゲーション帯。GTO Wizard の Study 画面の「スポット選択」を写したもの。
 *
 * - 左端: 条件カード(スタック帯・ステージ・人数)と「変更」ボタン
 * - 続けてポジションカードを横一列に並べる。各カードはヘッダー(ポジション名)の下に
 *   **取り得るアクションを縦に全部並べる**
 *   - 決めたカード: 選んだ行を灰色の帯+白の太字、選ばなかった行は灰色の文字。
 *     別の行を押すとその分岐へ移る(そこから先は捨てる)。ヘッダーを押すとその手番まで戻る
 *   - 手番のカード: アクセントの枠。行を押すとそのアクションで次へ進む
 *   - 先のカード: 薄く表示(押せない)
 * - ストリートのカード(FLOP/TURN/RIVER): そのストリートのボード。押すとそのストリートの最初へ戻る
 *
 * 幅が足りないときは横にスクロールする(モバイルの PositionPillBar と同じく、1本の時系列)。
 */
export interface DesktopSpotItemExtra {
  /** 決めた手番で、その時に選べたアクション(ラインに保存したもの)。無ければ選んだ行だけを出す。 */
  options?: ActionOption[];
}

const STREET_LABEL: Record<Exclude<Street, "preflop">, string> = { flop: "FLOP", turn: "TURN", river: "RIVER" };

function suitSymbol(card: string): string {
  const s = card.slice(-1);
  return s === "s" ? "♠" : s === "h" ? "♥" : s === "d" ? "♦" : "♣";
}
function suitTextClass(card: string): string {
  if (card.endsWith("h")) return "text-crimson-300";
  if (card.endsWith("d")) return "text-azure-400";
  if (card.endsWith("c")) return "text-mint-400";
  return "text-fg";
}

/** 表示する行(プリフロップはレイズ系を Open Raise 1行にまとめる)。強い順(上から)に並べる。 */
function displayOptions(street: Street, options: ActionOption[]): MergedActionOption[] {
  const merged: MergedActionOption[] = street === "preflop" ? mergeOpenRaiseOptions(options) : options;
  return [...merged].sort((a, b) => bucketOrderIndex(b.bucket) - bucketOrderIndex(a.bucket));
}

/** 行が、ラインに記録された実バケットと同じ選択か(Open Raise は元の3バケットのどれでも一致)。 */
function rowMatches(rowBucket: string, chosen: string | undefined): boolean {
  if (!chosen) return false;
  if (rowBucket === OPEN_RAISE_BUCKET) return OPEN_RAISE_SOURCE_BUCKETS.includes(chosen);
  return rowBucket === chosen;
}

export function DesktopSpotBar({
  items,
  settingsSummary,
  onOpenSettings,
  activeOptions,
  activeSampleSize,
  labelFor,
  onSelect,
  onTruncate,
  onBranch,
}: {
  items: (PillBarItem & DesktopSpotItemExtra)[];
  /** 条件カードの本文(例: 30bb+ · 全体 · 6人)。 */
  settingsSummary: string;
  onOpenSettings: () => void;
  activeOptions?: ActionOption[];
  activeSampleSize?: number;
  labelFor: (street: Street, bucket: string) => string;
  onSelect: (bucket: string) => void;
  onTruncate: (street: Street, lineIndex: number) => void;
  /** 決めた手番を別のアクションに付け替える(そこから先は捨てる)。 */
  onBranch: (street: Street, lineIndex: number, bucket: string, options: ActionOption[]) => void;
}) {
  return (
    <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
      <div className="flex w-[168px] shrink-0 flex-col justify-between rounded-lg bg-surface p-2.5 shadow-e1">
        <div>
          <p className="text-[12px] font-black text-fg">GEO Database</p>
          <p className="mt-1 text-[11px] font-semibold leading-snug text-fg-2">{settingsSummary}</p>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className="pressable mt-2 flex items-center gap-1.5 self-start rounded-md bg-surface-2 px-2 py-1 text-[11px] font-bold text-fg"
        >
          <Icon name="settings" className="h-3.5 w-3.5" />
          変更
        </button>
      </div>

      {items.map((item, i) =>
        item.kind === "street" ? (
          <button
            key={`street-${i}`}
            type="button"
            onClick={() => onTruncate(item.street, 0)}
            className="pressable flex w-[132px] shrink-0 flex-col rounded-lg bg-surface p-2.5 text-left shadow-e1"
            aria-label={`${STREET_LABEL[item.street]}の最初へ戻る`}
          >
            <span className="text-[11px] font-black tracking-[0.08em] text-fg-2">{STREET_LABEL[item.street]}</span>
            <span className="mt-2 flex gap-1">
              {item.cards.map((c) => (
                <span
                  key={c}
                  className="flex h-10 w-7 flex-col items-center justify-center rounded bg-surface-2 text-[12px] font-black leading-none ring-1 ring-inset ring-line"
                >
                  <span className={suitTextClass(c)}>{c.slice(0, -1)}</span>
                  <span className={suitTextClass(c)}>{suitSymbol(c)}</span>
                </span>
              ))}
            </span>
          </button>
        ) : (
          <PositionCard
            key={`${item.street}-${item.position}-${i}`}
            item={item}
            activeOptions={activeOptions}
            activeSampleSize={activeSampleSize}
            labelFor={labelFor}
            onSelect={onSelect}
            onTruncate={onTruncate}
            onBranch={onBranch}
          />
        ),
      )}
    </div>
  );
}

function PositionCard({
  item,
  activeOptions,
  activeSampleSize,
  labelFor,
  onSelect,
  onTruncate,
  onBranch,
}: {
  item: PositionPillItem & DesktopSpotItemExtra;
  activeOptions?: ActionOption[];
  activeSampleSize?: number;
  labelFor: (street: Street, bucket: string) => string;
  onSelect: (bucket: string) => void;
  onTruncate: (street: Street, lineIndex: number) => void;
  onBranch: (street: Street, lineIndex: number, bucket: string, options: ActionOption[]) => void;
}) {
  const active = item.state === "active";
  const decided = item.state === "decided";
  const rows = active
    ? displayOptions(item.street, activeOptions ?? [])
    : decided && item.options
    ? displayOptions(item.street, item.options)
    : [];

  return (
    <div
      className={`flex w-[132px] shrink-0 flex-col overflow-hidden rounded-lg shadow-e1 ${
        active ? "bg-surface-2 ring-2 ring-inset ring-accent" : "bg-surface"
      } ${item.state === "future" ? "opacity-40" : ""}`}
    >
      <button
        type="button"
        disabled={!decided}
        onClick={() => decided && item.lineIndex !== undefined && onTruncate(item.street, item.lineIndex)}
        className={`flex items-center justify-between px-2.5 pb-1 pt-2 text-left ${decided ? "pressable" : ""}`}
        aria-label={decided ? `${item.position}の手番へ戻る` : item.position}
      >
        <span className={`text-[12px] font-black tracking-[0.04em] ${active ? "text-accent" : "text-fg"}`}>{item.position}</span>
      </button>

      <div className="flex flex-col pb-1.5">
        {active && rows.length === 0 && (
          <span className="px-2.5 py-1 text-[12px] text-fg-3">{activeSampleSize === 0 ? "サンプルなし" : "…"}</span>
        )}
        {active &&
          rows.map((opt) => (
            <button
              key={opt.bucket}
              type="button"
              onClick={() => onSelect(opt.representativeBucket ?? opt.bucket)}
              className="pressable flex items-center gap-1.5 px-2.5 py-[3px] text-left text-[12px] font-bold text-fg hover:bg-surface-3"
            >
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: bucketColor(opt.representativeBucket ?? opt.bucket) }} />
              <span className="truncate">{labelFor(item.street, opt.bucket)}</span>
            </button>
          ))}

        {decided && rows.length === 0 && (
          // 古いライン(選べたアクションを保存していない)では、選んだ行だけを出す。
          <span className="mx-1 flex items-center gap-1.5 rounded bg-surface-3 px-1.5 py-[3px] text-[12px] font-black text-fg">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: bucketColor(item.bucket ?? "") }} />
            <span className="truncate">{item.actionLabel}</span>
          </span>
        )}
        {decided &&
          item.options &&
          rows.map((opt) => {
            const chosen = rowMatches(opt.bucket, item.bucket);
            return (
              <button
                key={opt.bucket}
                type="button"
                onClick={() =>
                  item.lineIndex !== undefined &&
                  (chosen
                    ? onTruncate(item.street, item.lineIndex + 1)
                    : onBranch(item.street, item.lineIndex, opt.representativeBucket ?? opt.bucket, item.options!))
                }
                className={`pressable mx-1 flex items-center gap-1.5 rounded px-1.5 py-[3px] text-left text-[12px] ${
                  chosen ? "bg-surface-3 font-black text-fg" : "font-semibold text-fg-3 hover:text-fg-2"
                }`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-sm"
                  style={{ background: bucketColor(opt.representativeBucket ?? opt.bucket), opacity: chosen ? 1 : 0.55 }}
                />
                <span className="truncate">{labelFor(item.street, opt.bucket)}</span>
              </button>
            );
          })}

        {item.state === "future" && <span className="px-2.5 py-1 text-[12px] text-fg-faint">—</span>}
      </div>
    </div>
  );
}
