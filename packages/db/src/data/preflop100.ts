/**
 * 100BB(BBアンティ・レーキなしMTT)のプリフロップ・オープンレンジ。
 * ユーザー提供のGTO Wizardスクリーンショット(LJ=UTG扱い / HJ / CO / BTN / SB)を転記したもの。
 * ※画像からの手作業読み取りのため、境界・混合セルに誤差がありうる。指摘に応じて修正する。
 *
 * 100BBではジャムは0%(純オープンレイズ)。SBのみリンプ(call)主体。
 * 各ポジションのオープンサイズと、open(=レイズ)するハンドの範囲(range文字列)を保持する。
 */

export interface Preflop100Pos {
  /** レイズ(オープン)サイズ(bb)。 */
  raiseSize: number;
  /** レイズ(オープン)するハンドのrange文字列。 */
  raise: string[];
  /** SBのみ: リンプ(call)するハンドのrange文字列。 */
  limp?: string[];
}

/** LJ(=UTG扱い) 23.2% / Raise 2.1bb */
const LJ: Preflop100Pos = {
  raiseSize: 2.1,
  raise: ["22+","A2s+","K5s+","Q8s+","J8s+","T7s+","96s+","86s+","75s+","65s","54s","ATo+","KJo+"],
};

/** HJ 28.5% / Raise 2.1bb */
const HJ: Preflop100Pos = {
  raiseSize: 2.1,
  raise: ["22+","A2s+","K2s+","Q6s+","J7s+","T7s+","96s+","86s+","75s+","64s+","53s+","ATo+","KTo+","QTo+","JTo"],
};

/** CO 37.1% / Raise 2.2bb */
const CO: Preflop100Pos = {
  raiseSize: 2.2,
  raise: ["22+","A2s+","K2s+","Q2s+","J5s+","T6s+","95s+","86s+","74s+","63s+","53s+","A6o+","K9o+","QTo+","JTo"],
};

/** BTN 54.4% / Raise 2.5bb */
const BTN: Preflop100Pos = {
  raiseSize: 2.5,
  raise: ["22+","A2s+","K2s+","Q2s+","J3s+","T5s+","95s+","84s+","74s+","63s+","53s+","43s","A2o+","K5o+","Q7o+","J7o+","T7o+","97o+","86o+","76o"],
};

/** SB: Raise 3.5bb(9%) + リンプ(call)81% + Fold 9.6%。強い/ブラフを3.5bbレイズ、多くをリンプ。 */
const SB: Preflop100Pos = {
  raiseSize: 3.5,
  raise: ["88+","ATs+","KJs+","QJs","AQo+","A5s","A4s","76s","65s","54s"],
  limp: [
    "22+",
    "A2s+",
    "K2s+",
    "Q2s+",
    "J2s+",
    "T2s+",
    "92s+",
    "82s+",
    "72s+",
    "62s+",
    "52s+",
    "42s+",
    "32s",
    "A2o+",
    "K2o+",
    "Q4o+",
    "J6o+",
    "T6o+",
    "96o+",
    "86o+",
    "75o+",
    "65o",
    "54o",
  ],
};

export const PREFLOP_100: Record<string, Preflop100Pos> = { UTG: LJ, HJ, CO, BTN, SB };
