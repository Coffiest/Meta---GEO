import { OPEN_RAISE_BUCKET, PREFLOP_BUCKETS, POSTFLOP_BUCKETS, type PostflopBucket, type PreflopBucket } from "@/lib/geoApi";

/**
 * アクションカラー(オーナー指示の固定4色。サイズ帯による濃淡は付けず、そのまま使う)。
 *   Fold=青 #4D7AB3 / Call・Check=緑 #7CB570 / Bet・Raise=赤 #DD4D45 /
 *   とても大きいBet(ポット100%超)=茶 #722722
 *
 * allInには専用色を持たせない。Open Raise統合バケット(mergeOpenRaiseByBucket)は
 * representativeBucket(最多件数だったraise2-5/raise5+/allInのいずれか)で色を決めるため、
 * allInだけ別色にすると「たまたまallInが最多だったセルだけ違う色に見える」という
 * 見た目のバグになる(ユーザー報告)。allInもBET_RAISE_COLORにそろえ、Open Raiseは
 * 常に同じ赤で表示されるようにする。
 */
const FOLD_COLOR = "#4D7AB3";
const CALL_COLOR = "#7CB570";
const BET_RAISE_COLOR = "#DD4D45";
const HUGE_BET_RAISE_COLOR = "#722722";

export const PREFLOP_BUCKET_COLOR: Record<PreflopBucket, string> = {
  fold: FOLD_COLOR,
  call: CALL_COLOR,
  "raise2-5": BET_RAISE_COLOR, // オープンレンジ(2〜5bb)
  "raise5+": BET_RAISE_COLOR, // 5bb超(主に3bet/4bet)
  allIn: BET_RAISE_COLOR,
};

export const POSTFLOP_BUCKET_COLOR: Record<PostflopBucket, string> = {
  fold: FOLD_COLOR,
  checkOrCall: CALL_COLOR,
  "bet20-40": BET_RAISE_COLOR,
  "bet40-60": BET_RAISE_COLOR,
  "bet60-80": BET_RAISE_COLOR,
  "bet80-100": BET_RAISE_COLOR,
  "bet100+": HUGE_BET_RAISE_COLOR, // とても大きいbet(ポット100%超)
  allIn: BET_RAISE_COLOR,
};

/**
 * バケットの色。Open Raise(統合バケット)はサイズ帯を持たないため、呼び出し側で
 * representativeBucket(統合前の実バケットのうち最多件数だったもの)を渡すこと。
 */
export function bucketColor(bucket: string): string {
  return (
    (PREFLOP_BUCKET_COLOR as Record<string, string>)[bucket] ??
    (POSTFLOP_BUCKET_COLOR as Record<string, string>)[bucket] ??
    "#4b5563"
  );
}

/**
 * バケットの「弱→強」順のインデックス。頻度でなくこの順でセル/バーを並べるために使う
 * (一番激しいアクションを左端に配置する、という表示要件)。未知のバケットは最後尾扱い。
 * Open Raiseは統合後の唯一のレイズ系バケットなので、fold(0)/call(1)の次に置く。
 */
export function bucketOrderIndex(bucket: string): number {
  if (bucket === OPEN_RAISE_BUCKET) return 2;
  const preflopIndex = (PREFLOP_BUCKETS as string[]).indexOf(bucket);
  if (preflopIndex !== -1) return preflopIndex;
  const postflopIndex = (POSTFLOP_BUCKETS as string[]).indexOf(bucket);
  if (postflopIndex !== -1) return postflopIndex;
  return 999;
}

/**
 * バケットの色を、CSS変数へ渡せるスペース区切りRGB("221 77 69")で返す。
 * ガラス面の染め(`rgb(var(--tile-tint) / 0.34)`)のように、同じ色を複数の不透明度で
 * 使い回す箇所で必要になる ―― 16進のままでは不透明度を掛けられないため。
 */
export function bucketTintRgb(bucket: string): string {
  const hex = bucketColor(bucket);
  return [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16)).join(" ");
}

/**
 * 塗りつぶしたセルの上に置く文字色。地の明るさから白/黒どちらが読めるかを選び直す。
 * 閾値0.35は、この4色すべてで4.3:1以上になる点を実測で選んだ。
 */
export function bucketTextColor(hex: string): string {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.substr(i, 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  return luminance > 0.35 ? "#101012" : "#FFFFFF";
}
