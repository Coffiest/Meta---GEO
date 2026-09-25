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
  /** レイズ(オープン)するハンドのrange文字列。短スタックのジャム主体帯では省略可。 */
  raise?: string[];
  /** SBのみ: リンプ(call)するハンドのrange文字列。 */
  limp?: string[];
  /** 短スタック帯: オールイン(ジャム)するハンドのrange文字列。 */
  jam?: string[];
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

/* ===== 20bb バンド(20-29bb)。ユーザー提供のGTO Wizard 20bbソリューションを転記(近似)。 =====
   LJ raise21.6% / HJ raise26% / CO raise29.4%+call3.6% / BTN jam5.1%+raise28%+call12.9% /
   SB jam10.2%+raise21%+call(limp)53.3%。※混合セルは主要アクションで近似。 */
const LJ20: Preflop100Pos = {
  raiseSize: 2.0,
  raise: ["22+","A2s+","K9s+","Q9s+","J9s+","T8s+","97s+","86s+","76s","65s","ATo+","KJo+"],
};
const HJ20: Preflop100Pos = {
  raiseSize: 2.0,
  raise: ["22+","A2s+","K7s+","Q8s+","J8s+","T8s+","97s+","86s+","75s+","65s","54s","ATo+","KTo+","QJo"],
};
const CO20: Preflop100Pos = {
  raiseSize: 2.0,
  raise: ["22+","A2s+","K5s+","Q8s+","J8s+","T7s+","97s+","86s+","75s+","64s+","54s","A9o+","KTo+","QTo+","JTo"],
};
const BTN20: Preflop100Pos = {
  raiseSize: 2.0,
  jam: ["A2s","A3s","A4s","A5s"],
  raise: ["22+","A6s+","K2s+","Q4s+","J6s+","T6s+","96s+","86s+","75s+","64s+","54s","A2o+","K8o+","Q9o+","J9o+","T9o"],
  limp: ["A7o","A6o","A5o","K7o","Q8o","J8o","T8o","98o","87o","76o"],
};
const SB20: Preflop100Pos = {
  raiseSize: 3.0,
  jam: ["A2s","A3s","A4s","A5s","K2s+","Q9s","J9s"],
  raise: ["99+","ATs+","KQs","AQo+"],
  limp: ["22+","A2s+","K2s+","Q2s+","J2s+","T2s+","92s+","82s+","72s+","62s+","52s+","42s+","32s","A2o+","K2o+","Q3o+","J5o+","T6o+","96o+","86o+","75o+","65o","54o"],
};

export const PREFLOP_20: Record<string, Preflop100Pos> = { UTG: LJ20, HJ: HJ20, CO: CO20, BTN: BTN20, SB: SB20 };

/* ===== 14bb バンド(15-20bb)。20bbと10bbの中間帯。レイズオープンとジャムの混合が濃くなる。 =====
   ※GTO Wizardの14bbソリューションを20bb/10bbから内挿・近似。指摘で修正する。
   raise(2bbオープン, オレンジ) + jam(オールイン, 紫) + fold。SBはcall(緑)も混合。 */
const LJ14: Preflop100Pos = {
  raiseSize: 2.0,
  jam: ["A2s","A3s","A4s","A5s"],
  raise: ["22+","A6s+","K9s+","Q9s+","J9s+","T8s+","97s+","86s+","76s","65s","54s","ATo+","KJo+"],
};
const HJ14: Preflop100Pos = {
  raiseSize: 2.0,
  jam: ["A2s","A3s","A4s","A5s","22","33"],
  raise: ["44+","A6s+","K7s+","Q8s+","J8s+","T8s+","97s+","86s+","75s+","65s","54s","A9o+","KTo+","QTo+","JTo"],
};
const CO14: Preflop100Pos = {
  raiseSize: 2.0,
  jam: ["A2s","A3s","A4s","A5s","22","33","44"],
  raise: ["55+","A6s+","K5s+","Q7s+","J7s+","T7s+","96s+","86s+","75s+","64s+","54s","A7o+","K9o+","QTo+","JTo"],
};
const BTN14: Preflop100Pos = {
  raiseSize: 2.0,
  jam: ["A2s","A3s","A4s","A5s","22","33","44","55"],
  raise: ["66+","A6s+","K2s+","Q4s+","J6s+","T6s+","95s+","85s+","74s+","64s+","54s","43s","A4o+","K8o+","Q9o+","J9o+","T8o+","98o"],
};
const SB14: Preflop100Pos = {
  raiseSize: 2.5,
  jam: ["A2s","A3s","A4s","A5s","22","33","44","55","K2s+","Q7s+"],
  raise: ["66+","ATs+","KJs+","QJs","AQo+","A5s"],
  limp: ["A2s+","K2s+","Q2s+","J2s+","T2s+","92s+","82s+","72s+","62s+","52s+","42s+","32s","A2o+","K2o+","Q4o+","J6o+","T6o+","96o+","86o+","75o+","65o","54o"],
};

export const PREFLOP_14: Record<string, Preflop100Pos> = { UTG: LJ14, HJ: HJ14, CO: CO14, BTN: BTN14, SB: SB14 };

/* ===== 10bb バンド(10-15bb)。ユーザー提供のGTO Wizard 10bbソリューションを転記(近似)。 =====
   ほぼプッシュ/フォールド。各ポジションのAllin(紫)が主体、レイズ(オレンジ)は僅か。
   LJ jam19.7%+raise2.9% / HJ jam25.7%+raise1.5% / CO jam31.2%+raise0.5% /
   BTN jam33.5%+raise5.6% / SB jam48.9%+raise1.6%+call26.9%。
   主要アクション=jamで表現し、SBはjam+call+fold混合。 */
const LJ10: Preflop100Pos = {
  raiseSize: 2.0,
  jam: ["22+","A2s+","K9s+","Q8s+","J8s+","T8s+","97s+","86s+","76s","65s","54s","A9o+","KJo+","QJo"],
};
const HJ10: Preflop100Pos = {
  raiseSize: 2.0,
  jam: ["22+","A2s+","K7s+","Q8s+","J8s+","T8s+","97s+","86s+","75s+","65s","54s","A8o+","KTo+","QTo+","JTo"],
};
const CO10: Preflop100Pos = {
  raiseSize: 2.0,
  jam: ["22+","A2s+","K5s+","Q7s+","J7s+","T7s+","96s+","86s+","75s+","64s+","54s","A7o+","KTo+","QTo+","JTo","T9o"],
};
const BTN10: Preflop100Pos = {
  raiseSize: 2.0,
  jam: ["22+","A2s+","K2s+","Q4s+","J6s+","T6s+","95s+","85s+","75s+","64s+","54s","43s","A5o+","K9o+","QTo+","J9o+","T9o","98o"],
};
const SB10: Preflop100Pos = {
  raiseSize: 2.0,
  jam: ["22+","A2s+","K8s+","Q9s+","J9s+","T8s+","97s+","86s+","76s","65s","A2o+","K8o+","Q9o+","J9o+","T9o"],
  limp: ["K2s","K3s","K4s","K5s","K6s","K7s","Q2s","Q3s","Q4s","Q5s","Q6s","Q7s","Q8s","J2s","J3s","J4s","J5s","J6s","J7s","J8s","T2s","T3s","T4s","T5s","T6s","T7s","92s","93s","94s","95s","96s","82s","83s","84s","85s","72s","73s","74s","75s","62s","63s","64s","52s","53s","42s","43s","32s","K2o","K3o","K4o","K5o","K6o","K7o","Q3o","Q4o","Q5o","Q6o","Q7o","Q8o","J5o","J6o","J7o","J8o","T6o","T7o","T8o","96o","97o","98o","86o","87o","75o","76o","65o","54o"],
};

export const PREFLOP_10: Record<string, Preflop100Pos> = { UTG: LJ10, HJ: HJ10, CO: CO10, BTN: BTN10, SB: SB10 };

/* ===== 7bb バンド(10bb以下)。ユーザー提供のGTO Wizard 7bbソリューションを転記(近似)。 =====
   完全なプッシュ/フォールド(Raise 0%)。Allin(紫)+Fold(青)。SBのみCall(緑)混合。
   LJ jam27.8% / HJ jam31.2% / CO jam34.5% / BTN jam44.2% / SB jam64.3%+call13.4%。 */
const LJ7: Preflop100Pos = {
  raiseSize: 2.0,
  jam: ["22+","A2s+","K7s+","Q9s+","J9s+","T9s","98s","87s","76s","65s","54s","A7o+","KTo+","QTo+"],
};
const HJ7: Preflop100Pos = {
  raiseSize: 2.0,
  jam: ["22+","A2s+","K5s+","Q8s+","J8s+","T8s+","98s","87s","76s","65s","54s","A5o+","K9o+","QTo+","JTo"],
};
const CO7: Preflop100Pos = {
  raiseSize: 2.0,
  jam: ["22+","A2s+","K3s+","Q6s+","J7s+","T7s+","96s+","86s+","76s","65s","54s","A4o+","K9o+","QTo+","JTo","T9o"],
};
const BTN7: Preflop100Pos = {
  raiseSize: 2.0,
  jam: ["22+","A2s+","K2s+","Q2s+","J7s+","T6s+","95s+","85s+","75s+","64s+","54s","A2o+","K8o+","Q9o+","J9o+","T9o"],
};
const SB7: Preflop100Pos = {
  raiseSize: 2.0,
  jam: ["22+","A2s+","K2s+","Q2s+","J4s+","T6s+","96s+","86s+","75s+","64s+","53s+","43s","A2o+","K3o+","Q6o+","J7o+","T7o+","97o+","87o","76o"],
  limp: ["J2s","J3s","T2s","T3s","T4s","T5s","92s","93s","94s","95s","82s","83s","84s","85s","72s","73s","74s","62s","63s","52s","42s","K2o","Q3o","Q4o","Q5o","J5o","J6o","T5o","T6o","96o","86o","75o","65o","54o"],
};

export const PREFLOP_7: Record<string, Preflop100Pos> = { UTG: LJ7, HJ: HJ7, CO: CO7, BTN: BTN7, SB: SB7 };

/**
 * スタックバンドキー → ポジション別レンジ。
 * "100"=50-100bb, "30"=25-49bb, "20"=20-24bb, "14"=15-19bb, "10"=10-14bb, "7"=10bb以下。
 * "30"帯のオープン(RFI)レンジは30-100bbでほぼ不変のため PREFLOP_100 を流用する。
 * 30bbと100bbの戦略差はディフェンス(vsOpen)/3bet/ポストフロップ(SPR)側で生じ、
 * genPreflopVsOpen.ts が band="30" を depth=30 で解くことで区別される。
 */
export const PREFLOP_BANDS: Record<string, Record<string, Preflop100Pos>> = {
  "100": PREFLOP_100,
  "30": PREFLOP_100,
  "20": PREFLOP_20,
  "14": PREFLOP_14,
  "10": PREFLOP_10,
  "7": PREFLOP_7,
};
