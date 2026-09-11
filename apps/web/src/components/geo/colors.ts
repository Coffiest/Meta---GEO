import { OPEN_RAISE_BUCKET, PREFLOP_BUCKETS, POSTFLOP_BUCKETS, type PostflopBucket, type PreflopBucket } from "@/lib/geoApi";

/**
 * アクションカラー。GTO Wizard と同じロジックで、**色相がアクション、濃淡がサイズ**を表す:
 *   Fold=ブルー / Call・Check=グリーン / ベット・レイズ=レッド(サイズが上がるほど強い) /
 *   Allin=パープル(紫はAllin専用で、他のどこにも使わない)。
 *
 * ダーク地への翻訳について。GTO Wizard は白地なので、サイズが上がるほど色を**暗く**して
 * 背景とのコントラストを上げている。同じ「サイズが上がるほど背景から強く立ち上がる」関係を
 * 暗い地の上で保つには、暗くするのではなく**明るく・熱く**する必要がある。
 * 順序(単調性)と色相の意味はそのままに、進む向きだけを地に合わせて反転させてある。
 * 旧配色は暗いままだったため、Overbet が 1.24:1、Allin が 1.55:1 と実質見えていなかった。
 * 現在は全段が地に対して 3:1 以上ある(下のコメントの数値は #1C1C1E に対する実測値)。
 */
const FOLD_COLOR = "#5B9BD5"; // ブルー(Fold) 5.75:1
const CALL_COLOR = "#6FBF5B"; // グリーン(Call/Check) 7.52:1
const ALLIN_COLOR = "#A98BF5"; // パープル(Allin専用) 6.24:1
/** ジオメトリックサイズの強調色。紫はAllin専用のため、明るいティールで区別する。 */
const GEOMETRIC_COLOR = "#2FD3AE"; // 8.95:1

// サイズ帯の色(小→大で赤が強くなる)。3.87 → 8.17:1 と単調に上がる。
const SMALL_ORANGE = "#BC5C4F"; // 3.87:1
const RAISE_RED = "#D46752"; // 4.75:1
const MEDIUM_RED = "#E86A50"; // 5.35:1
const LARGE_DARK_RED = "#F4805A"; // 6.55:1
const OVERBET_BLOOD_RED = "#FF9A6B"; // 8.17:1

export const PREFLOP_BUCKET_COLOR: Record<PreflopBucket, string> = {
  fold: FOLD_COLOR,
  call: CALL_COLOR,
  "raise2-5": SMALL_ORANGE, // オープンレンジ(2〜5bb)
  "raise5+": LARGE_DARK_RED, // 5bb超(主に3bet/4bet)
  allIn: ALLIN_COLOR,
};

export const POSTFLOP_BUCKET_COLOR: Record<PostflopBucket, string> = {
  fold: FOLD_COLOR,
  checkOrCall: CALL_COLOR,
  "bet20-40": SMALL_ORANGE,
  "bet40-60": RAISE_RED,
  "bet60-80": MEDIUM_RED,
  "bet80-100": LARGE_DARK_RED,
  "bet100+": OVERBET_BLOOD_RED,
  allIn: ALLIN_COLOR,
};

/**
 * geometricRatio(そのバケットの中でジオメトリックサイズだった割合)が高い場合は
 * サイズ帯の色より優先してティールを返す。Allinは常にディープパープル(紫はAllin専用)。
 * Open Raise(統合バケット)はサイズ帯を持たないので、レイズ系の基準色(RAISE_RED)を使う。
 */
export function bucketColor(bucket: string, geometricRatio = 0): string {
  if (bucket === "allIn") return ALLIN_COLOR;
  if (bucket !== "fold" && bucket !== "call" && bucket !== "checkOrCall" && geometricRatio >= 0.5) {
    return GEOMETRIC_COLOR;
  }
  if (bucket === OPEN_RAISE_BUCKET) return RAISE_RED;
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
 * 塗りつぶしたセルの上に置く文字色。
 *
 * 明るいセル(Overbet 8.17:1、ジオメトリック 8.95:1 など)の上では白文字が 2.0〜2.3:1 まで
 * 落ちて読めなくなる。地に対するコントラストを稼ぐほど、その上の白文字は読めなくなるという
 * 相反があるので、セルの明るさから文字色の側を選び直す。閾値 0.35 は、この配色の全段で
 * 4.3:1 以上になる点を実測で選んだ。
 */
export function bucketTextColor(hex: string): string {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.substr(i, 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  return luminance > 0.35 ? "#101012" : "#FFFFFF";
}
