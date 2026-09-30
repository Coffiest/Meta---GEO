/**
 * ポストフロップのベット/レイズが、戦略用語で言うと何にあたるかを判定する。
 *
 * ドンク・CB・ディレイCB・バレル・プローブ・チェックレイズは、どれも**ストリートをまたぐ
 * アクション履歴**でしか決まらない(「プリフロップ最後のレイザー」「前のストリートでコールした人」
 * 「フロップがチェックで流れたか」)。決定1つを見ても分からないので、ハンドの全アクションを
 * 頭から1回なめて求める。
 *
 * **全席を同じロジックで判定する。** 席の持ち主が誰であっても、通る経路・返る形は同一。
 *
 * 用語の定義(オーナー確定):
 *  - オリジナル = プリフロップで最後にレイズした人(PFR)。
 *  - CB          = オリジナルがフロップで最初にベット。
 *  - ディレイCB  = オリジナルがフロップでチェック(全員チェック)→ ターンで最初にベット。
 *  - ドンク      = オリジナルでないプレイヤーが、オリジナルより先(=OOP)にベット。
 *  - ターンバレル = フロップでベット/レイズした人が、ターンでもベット。
 *  - リバーバレル = ターンでベット/レイズした人が、リバーでもベット(3連続=トリプルバレル)。
 *  - プローブ    = フロップでオリジナルのIPがチェックバック → ターンでOOPが最初にベット。
 *  - チェックレイズ = 同じストリートで自分がチェックした後にレイズ。
 */

export type BetRole =
  | "checkRaise"
  | "probe"
  | "donk"
  | "delayedCbet"
  | "cbet"
  | "turnBarrel"
  | "riverBarrel"
  /** 上のどれにも当たらないベット/レイズ(プリフロップがリンプポットで「オリジナル」がいない等)。 */
  | "otherBet";

export type BetStreet = "flop" | "turn" | "river";

/** ベットサイズの段(ポット比)。しきい値は `BET_SIZE_BANDS`。 */
export type BetSizeClass = "block" | "small" | "medium" | "large" | "overbet";

/** ポット比 → サイズ段の境界。ブロックベットは Notion の「1/3を使う」に合わせて 40% まで。 */
export const BET_SIZE_BANDS = {
  /** この値以下はブロック/超小さい(約1/3)。 */
  block: 0.4,
  /** この値以下は小さい(約1/2)。 */
  small: 0.6,
  /** この値以下は中(約2/3〜3/4)。 */
  medium: 0.85,
  /** この値以下は大(ポットサイズ前後)。これを超えると、ポットより大きいベット。 */
  large: 1.05,
} as const;

export interface RoleAction {
  sequenceNumber: number;
  seatIndex: number;
  street: string;
  kind: string;
  /** 現ストリートの累計拠出(=そのアクション後の「〜まで」)。 */
  toAmount: number | null;
  potBefore: number;
}

export interface BetRoleInfo {
  sequenceNumber: number;
  seatIndex: number;
  street: BetStreet;
  role: BetRole;
  /** プリフロップ最後のレイザー(オリジナル)本人か。リンプポットでは誰も該当しない。 */
  isOriginalRaiser: boolean;
  /** その時点の生存者のうち、最後に手番が来る席か("IP")。他に後ろの席が居れば "OOP"。 */
  position: "IP" | "OOP";
  /** ベット額 ÷ その時点のポット。額が分からないオールインは null。 */
  potFraction: number | null;
  sizeClass: BetSizeClass | null;
  /**
   * このストリートまで連続して「そのストリートの最後のアグレッサー」だった数。
   * 2 = ダブルバレル、3 = トリプルバレル。
   */
  streak: number;
  /** ドンクのうち、前のストリートで(ベットに)コールした人が先に打ったもの。 */
  leadAfterCall: boolean;
}

export interface BetRoleTable {
  buttonFixedPos: number;
  seatCount: number;
}

const POSTFLOP: readonly string[] = ["flop", "turn", "river"];

function isForcedPost(kind: string): boolean {
  return kind === "postBlind" || kind === "postAnte";
}

function isAggression(kind: string): boolean {
  return kind === "bet" || kind === "raise" || kind === "allIn";
}

/** ポストフロップの行動順(小さいほど先)。SB が先頭、BTN が最後。 */
function actOrder(seat: number, table: BetRoleTable): number {
  const offset = (((seat - table.buttonFixedPos) % table.seatCount) + table.seatCount) % table.seatCount;
  return (offset + table.seatCount - 1) % table.seatCount;
}

export function sizeClassOf(fraction: number): BetSizeClass {
  if (fraction <= BET_SIZE_BANDS.block) return "block";
  if (fraction <= BET_SIZE_BANDS.small) return "small";
  if (fraction <= BET_SIZE_BANDS.medium) return "medium";
  if (fraction <= BET_SIZE_BANDS.large) return "large";
  return "overbet";
}

interface StreetState {
  /** そのストリートでベット/レイズが1回でも出たか。 */
  aggressionSeen: boolean;
  /** 最後にベット/レイズした席(=そのストリートのアグレッサー)。 */
  lastAggressor: number | null;
  /** チェックした席。 */
  checked: Set<number>;
  /** コールした席。 */
  called: Set<number>;
  /** 席ごとの累計拠出(ベット額の計算用)。 */
  contribution: Map<number, number>;
}

function freshStreet(): StreetState {
  return { aggressionSeen: false, lastAggressor: null, checked: new Set(), called: new Set(), contribution: new Map() };
}

/**
 * ハンドの全アクションから、ポストフロップの各ベット/レイズの役割を求める。
 * ベット/レイズ以外(チェック・コール・フォールド)は返さない。
 */
export function readBetRoles(actions: readonly RoleAction[], table: BetRoleTable): BetRoleInfo[] {
  // オリジナル = プリフロップ最後のレイザー。
  let original: number | null = null;
  for (const a of actions) {
    if (a.street === "preflop" && !isForcedPost(a.kind) && isAggression(a.kind)) original = a.seatIndex;
  }

  const streets: Record<string, StreetState> = { flop: freshStreet(), turn: freshStreet(), river: freshStreet() };
  const folded = new Set<number>();
  // プリフロップで降りた席を先に反映する(ポストフロップの生存者判定に使う)。
  for (const a of actions) if (a.street === "preflop" && a.kind === "fold") folded.add(a.seatIndex);

  const out: BetRoleInfo[] = [];

  for (const a of actions) {
    if (!POSTFLOP.includes(a.street)) continue;
    const street = a.street as BetStreet;
    const st = streets[street]!;

    if (a.kind === "fold") {
      folded.add(a.seatIndex);
      continue;
    }
    if (a.kind === "check") {
      st.checked.add(a.seatIndex);
      continue;
    }
    if (a.kind === "call") {
      st.called.add(a.seatIndex);
      if (a.toAmount !== null) st.contribution.set(a.seatIndex, a.toAmount);
      continue;
    }
    if (!isAggression(a.kind)) continue;

    // ── ここからベット/レイズ ──
    const prior = st.contribution.get(a.seatIndex) ?? 0;
    const amount = a.toAmount !== null ? a.toAmount - prior : null;
    const potFraction = amount !== null && a.potBefore > 0 ? amount / a.potBefore : null;

    const live = [...new Set(actions.map((x) => x.seatIndex))].filter((s) => !folded.has(s));
    const myOrder = actOrder(a.seatIndex, table);
    const position: "IP" | "OOP" = live.every((s) => s === a.seatIndex || actOrder(s, table) < myOrder) ? "IP" : "OOP";

    const firstOnStreet = !st.aggressionSeen;
    const prev = street === "turn" ? streets["flop"]! : street === "river" ? streets["turn"]! : null;
    const flop = streets["flop"]!;

    const isOriginal = original !== null && a.seatIndex === original;
    const originalLive = original !== null && !folded.has(original);

    // ストリートを遡って、連続アグレッサーだった数を数える(このアクション自身を含む)。
    let streak = 1;
    if (street === "turn" && flop.lastAggressor === a.seatIndex) streak = 2;
    if (street === "river") {
      const turn = streets["turn"]!;
      if (turn.lastAggressor === a.seatIndex) streak = flop.lastAggressor === a.seatIndex ? 3 : 2;
    }

    let role: BetRole = "otherBet";
    let leadAfterCall = false;

    if (st.checked.has(a.seatIndex) && !firstOnStreet) {
      // 自分が先にチェックしていて、その後に誰かのベットへレイズ(=チェックレイズ)。
      role = "checkRaise";
    } else if (firstOnStreet) {
      const flopCheckedThrough =
        !flop.aggressionSeen && street !== "flop" && original !== null && flop.checked.has(original);
      const originalActsAfter = original !== null && originalLive && actOrder(original, table) > myOrder;

      if (street === "turn" && flopCheckedThrough && !isOriginal && originalActsAfter) {
        // フロップでオリジナルがIPからチェックバック → ターンでOOPが最初に打つ。
        role = "probe";
      } else if (!isOriginal && original !== null && originalActsAfter) {
        role = "donk";
        leadAfterCall = prev !== null && prev.called.has(a.seatIndex);
      } else if (street === "flop" && isOriginal) {
        role = "cbet";
      } else if (street === "turn" && isOriginal && flopCheckedThrough) {
        role = "delayedCbet";
      } else if (street === "turn" && streak >= 2) {
        role = "turnBarrel";
      } else if (street === "river" && streak >= 2) {
        role = "riverBarrel";
      }
    } else if (street === "turn" && streak >= 2) {
      role = "turnBarrel";
    } else if (street === "river" && streak >= 2) {
      role = "riverBarrel";
    }

    out.push({
      sequenceNumber: a.sequenceNumber,
      seatIndex: a.seatIndex,
      street,
      role,
      isOriginalRaiser: isOriginal,
      position,
      potFraction,
      sizeClass: potFraction === null ? null : sizeClassOf(potFraction),
      streak,
      leadAfterCall,
    });

    st.aggressionSeen = true;
    st.lastAggressor = a.seatIndex;
    if (a.toAmount !== null) st.contribution.set(a.seatIndex, a.toAmount);
  }

  return out;
}
