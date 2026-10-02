/**
 * トーナメントのボタン/SB/BB決定ロジック(デッドボタン方式)。
 * docs/POKER_RULES.md 4章参照。
 *
 * ## ルール(TDA Rule 33 / Robert's Rules のトーナメント章)
 *
 * トーナメントは「フォワードムービング・ビッグブラインド + デッドボタン」で回す。
 * 実卓でディーラーボタンという物理的な円盤が動く様子をそのまま写すと、次の3行になる:
 *
 * 1. **BBは、前のハンドのBB席の次にいる「生存プレイヤー」へ進む。**
 * 2. **SBは、前のハンドのBB席そのもの。**
 * 3. **BTNは、前のハンドのSB席そのもの。**
 *
 * 2と3の席は「前のハンドに存在した席」なので、そのプレイヤーが直前にバストしていれば
 * 空席になりうる。空席にSBが当たれば**デッドSB**(そのハンドはSBを徴収しない)、
 * 空席にBTNが当たれば**デッドボタン**(誰もボタンを持たない)になる。これがこの方式の名前の由来。
 *
 * この3行から、実卓と同じ次の性質が自動的に出てくる:
 * - 誰もBBを2ハンド連続で払わない(1のBBは必ず「次の」生存者へ進むため)。
 * - 誰もBBを飛ばして逃げられない(1は生存者を1人ずつ順に舐めるため、1周に必ず1回当たる)。
 * - **BTNは1周に1回、全員に回る**(BTN席の列はBB席の列を2ハンド遅らせたものに等しい)。
 * - 空席がBTN/SBに現れるのはバースト直後の高々2ハンドだけで、自然に解消する
 *   (次のハンドのSBは「前のハンドのBB席」= 必ず生存者の席だから)。
 *
 * ## 以前の実装の誤り(このファイルを書き直した理由)
 *
 * 以前は「SB = BB席の1つ前の**固定席番号**、BTN = そのさらに1つ前の固定席番号」としていた。
 * 卓が埋まっている間は正しい答えになるが、バストで席が虫食いになると破綻する。
 * 例: 6席の卓に席0・1・3の3人が残った場合、以前の実装だと
 *
 *   BB=1 SB=0 BTN=5(空) → BB=3 SB=2(空) BTN=1 → BB=0 SB=5(空) BTN=4(空) → (以降くり返し)
 *
 * となり、**席0と席3には永久にBTNが回ってこない**し、SBも席0だけが毎周払わされる。
 * 空席が「前のハンドの席」ではなく「固定席番号の隣」から湧いてくるため、いつまでも消えない。
 * 上の3行のルールなら同じ状況で BB=1/SB=0/BTN=3 → BB=3/SB=1/BTN=0 → BB=0/SB=3/BTN=1 と回り、
 * 3人に均等にボタンが回る。
 *
 * ## ヘッズアップ
 *
 * 2人になったらデッドボタンの概念は適用されず、SB=ボタン(プリフロップ先行・ポストフロップ後攻)。
 * BBだけは上の1のまま進めるので、3人→2人になる瞬間も「BBを2回連続で払う人」は発生しない。
 */

/** 直前のハンドのブラインド位置。SB側は空席(デッドSB)だった場合もその席番号を保持する。 */
export interface PreviousBlindPositions {
  /** 直前のハンドのSB席の位置(デッドSBだった場合もその位置)。 */
  readonly smallBlindFixedPos: number;
  /** 直前のハンドのBB席の位置(BBは必ず生存者なので常に着席中だった席)。 */
  readonly bigBlindFixedPos: number;
}

export interface ButtonAssignment {
  readonly buttonFixedPos: number;
  /** SB席の「位置」。デッドSB(空席)でも位置は決まる ―― 次のハンドのBTNがここに置かれるため。 */
  readonly smallBlindFixedPos: number;
  readonly smallBlindSeat: number | null; // null = デッドスモールブラインド(このハンドはSB徴収なし)
  readonly bigBlindSeat: number;
  readonly buttonIsDead: boolean;
}

/** 次のハンドへ持ち越すブラインド位置(デッドでも位置は持ち越す)。 */
export function nextPreviousBlinds(assignment: ButtonAssignment): PreviousBlindPositions {
  return {
    smallBlindFixedPos: assignment.smallBlindFixedPos,
    bigBlindFixedPos: assignment.bigBlindSeat,
  };
}

function nextOccupiedAfter(
  fixedPos: number,
  occupiedSeats: ReadonlySet<number>,
  seatCount: number,
): number {
  for (let step = 1; step <= seatCount; step++) {
    const candidate = (fixedPos + step) % seatCount;
    if (occupiedSeats.has(candidate)) return candidate;
  }
  throw new Error("No occupied seats found");
}

function previousOccupiedBefore(
  fixedPos: number,
  occupiedSeats: ReadonlySet<number>,
  seatCount: number,
): number {
  for (let step = 1; step <= seatCount; step++) {
    const candidate = ((fixedPos - step) % seatCount + seatCount) % seatCount;
    if (occupiedSeats.has(candidate)) return candidate;
  }
  throw new Error("No occupied seats found");
}

export function computeButtonAssignment(params: {
  readonly occupiedSeats: ReadonlySet<number>;
  readonly seatCount: number;
  /** 1ハンド目は null。 */
  readonly previous: PreviousBlindPositions | null;
}): ButtonAssignment {
  const { occupiedSeats, seatCount, previous } = params;
  if (occupiedSeats.size < 2) {
    throw new Error("At least 2 occupied seats are required to assign button/blinds");
  }

  // 1ハンド目は基準が無いので、席番号の小さい方からBTN→SB→BBが並ぶように置く
  // (最小席がBBになる従来の初期配置を維持している)。
  if (previous === null) {
    const live = [...occupiedSeats].sort((a, b) => a - b);
    const bigBlindSeat = live[0]!;
    const buttonFixedPos = live.length === 2 ? live[1]! : live[live.length - 2]!;
    const smallBlindSeat = live.length === 2 ? live[1]! : live[live.length - 1]!;
    return { buttonFixedPos, smallBlindFixedPos: smallBlindSeat, smallBlindSeat, bigBlindSeat, buttonIsDead: false };
  }

  // 1: BBは前のハンドのBB席の次の「生存者」へ。ここだけは必ず着席中の席になる。
  const bigBlindSeat = nextOccupiedAfter(previous.bigBlindFixedPos, occupiedSeats, seatCount);

  if (occupiedSeats.size === 2) {
    // ヘッズアップ: SB=ボタン。BBの進め方は上のまま。
    const buttonSeat = [...occupiedSeats].find((s) => s !== bigBlindSeat)!;
    return {
      buttonFixedPos: buttonSeat,
      smallBlindFixedPos: buttonSeat,
      smallBlindSeat: buttonSeat,
      bigBlindSeat,
      buttonIsDead: false,
    };
  }

  // 2: SBは前のハンドのBB席。3: BTNは前のハンドのSB席。どちらも空席になりうる。
  const sbFixedPos = previous.bigBlindFixedPos;
  let buttonFixedPos = previous.smallBlindFixedPos;

  // 人が**増えた**直後(MTTのレイトレジスト/テーブルバランスで着席、特にヘッズアップから3人へ
  // 戻った場合)は、前のハンドの席から引いたBTNがBB席と衝突することがある
  // (ヘッズアップでは BTN=SB なので、前のSB席=前のBTN席が新しいBBになりうる)。
  // 席が減る=バーストの側では起きない。衝突したときだけ、BBから生存者を2つ遡る通常配置に落とす。
  if (buttonFixedPos === bigBlindSeat || buttonFixedPos === sbFixedPos) {
    buttonFixedPos = previousOccupiedBefore(sbFixedPos, occupiedSeats, seatCount);
  }

  return {
    buttonFixedPos,
    smallBlindFixedPos: sbFixedPos,
    smallBlindSeat: occupiedSeats.has(sbFixedPos) ? sbFixedPos : null,
    bigBlindSeat,
    buttonIsDead: !occupiedSeats.has(buttonFixedPos),
  };
}
