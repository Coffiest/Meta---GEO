"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  geoTreeApi,
  GeoApiError,
  PREFLOP_BUCKET_LABELS,
  POSTFLOP_BUCKET_LABELS,
  STACK_BUCKET_LABELS,
  GTO_STACK_LABELS,
  GTO_STACK_TO_BAND,
  GTO_STACK_TO_BUCKET,
  BUBBLE_STAGE_LABELS,
  type BubbleStage,
  type GtoStack,
  type HandClassMatrixResult,
  type LineStep,
  type StackBucket,
  type TreeNode,
} from "@/lib/geoApi";
import { GeoSettingsModal, RATING_MIN, RATING_MAX } from "@/components/geo/GeoSettingsModal";
import { ReportErrorButton } from "@/components/ReportErrorButton";
import { PositionPillBar, type PillBarItem, type Street, type PostflopStreet } from "@/components/geo/PositionPillBar";
import { PositionActionRow } from "@/components/geo/PositionActionRow";
import { HandClassMatrix } from "@/components/geo/HandClassMatrix";
import { BoardCardPicker } from "@/components/geo/BoardCardPicker";
import { Icon } from "@/components/Lobby";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SideNav, SIDE_NAV_ITEMS } from "@/components/SideNav";
import { GeoGuide, hasGeoGuideBeenSeen } from "@/components/geo/GeoGuide";
import { PasscodeModal } from "@/components/PasscodeModal";
import { useAuth } from "@/lib/useAuth";
import { APP_VERSION } from "@/lib/version";

/** localStorage キー: database タブ(/geo)を一度でも開いたか。ホームの「解放」トーストを止める信号。 */
const GEO_DB_OPENED_KEY = "pokerart.geoDbOpened.v1";

/**
 * /geo のゲート。GEO DATABASE は一般開放済み(ログイン済みユーザーのみ)。
 * - 初回アクセス時、または ?guide=1(メニューからの再表示)のときは使い方チュートリアル(GeoGuide)を表示し、
 *   「使ってみる」/スキップで本体(GeoDatabase)へ。以降は本体を直接開く。
 * - 未ログイン(Supabase有効時)はホーム(ログイン画面)へ誘導する。
 */
export default function GeoPage() {
  const { authAvailable, loading, session } = useAuth();
  const router = useRouter();
  const [showGuide, setShowGuide] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // database タブを開いた記録を残す(次回以降ホームの解放トーストを出さない)。
    try {
      localStorage.setItem(GEO_DB_OPENED_KEY, "1");
    } catch {
      /* localStorage不可でも致命ではない */
    }
    // ?guide=1 は既読でも強制表示(ハンバーガーメニューの「使い方」から)。それ以外は初回のみ。
    const forced =
      typeof window !== "undefined" && new URLSearchParams(window.location.search).get("guide") === "1";
    setShowGuide(forced || !hasGeoGuideBeenSeen());
    setReady(true);
  }, []);

  // ログイン必須(Supabaseが有効な本番のみ)。ゲストモード(authAvailable=false)ではブロックしない。
  useEffect(() => {
    if (authAvailable && !loading && !session) router.replace("/");
  }, [authAvailable, loading, session, router]);

  if (authAvailable && !loading && !session) return null; // リダイレクト中は何も出さない
  if (loading || !ready) {
    // 認証確認 / 表示判定が終わるまでの軽量プレースホルダ(SSRとの表示ちらつきも防ぐ)。
    return <div className="flex min-h-screen items-center justify-center bg-white text-[13px] text-ink-500">読み込み中…</div>;
  }
  if (showGuide) return <GeoGuide onDone={() => setShowGuide(false)} />;
  return <GeoDatabase />;
}

/** 読み込み開始からの経過秒。これ以上かかっているときだけ「時間がかかっています」に切り替える。 */
const SLOW_HINT_AFTER_SEC = 3;

/**
 * 読み込み開始からの経過秒表示。毎秒のsetStateをこの葉コンポーネントに閉じ込め、
 * 親(GeoDatabase)のツリー全体が毎秒再描画されないようにする(発熱・カクつき対策)。
 */
function ElapsedText({ startedAt }: { startedAt: number }) {
  const [sec, setSec] = useState(() => Math.floor((Date.now() - startedAt) / 1000));
  useEffect(() => {
    setSec(Math.floor((Date.now() - startedAt) / 1000));
    const timer = setInterval(() => setSec(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  if (sec < SLOW_HINT_AFTER_SEC) return <span>読み込み中…</span>;
  return <span>時間がかかっています…({sec}秒経過)</span>;
}

const FULL_PREFLOP_ORDER = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
const FULL_POSTFLOP_ORDER = ["SB", "BB", "UTG", "HJ", "CO", "BTN"];

/** GEOタブ: 人数ごとのブラインド基準ポジション並び(プリフロップのアクション順)。
 * サーバー(geoTree)のブラインド基準ラベルと同じ命名。ヘッズアップはボタンがSBを兼ねるため BTN(SB)。
 *
 * 3人卓にも UTG を入れてある。デッドボタン方式では、バスト直後などで着席が飛び飛びになると
 * 「ブラインドでもボタンでもない席」が生まれ、その席は UTG と命名される(engine の
 * computePositionLabels)。3人卓を BTN/SB/BB だけにしていた頃は、実際に記録されている
 * 3人卓 UTG の意思決定へ画面から到達できなかった。存在しない人数では単に空で出るだけなので
 * 入れておいて害はない。 */
const GEO_PREFLOP_ORDER: Record<number, string[]> = {
  2: ["BTN(SB)", "BB"],
  3: ["UTG", "BTN", "SB", "BB"],
  4: ["UTG", "BTN", "SB", "BB"],
  5: ["UTG", "CO", "BTN", "SB", "BB"],
  6: FULL_PREFLOP_ORDER,
};
const GEO_POSTFLOP_ORDER: Record<number, string[]> = {
  2: ["BB", "BTN(SB)"],
  3: ["SB", "BB", "UTG", "BTN"],
  4: ["SB", "BB", "UTG", "BTN"],
  5: ["SB", "BB", "UTG", "CO", "BTN"],
  6: FULL_POSTFLOP_ORDER,
};

type LineStepWithMeta = LineStep & { geometricRatio?: number };

function nextStreetOf(street: Street): PostflopStreet | null {
  if (street === "preflop") return "flop";
  if (street === "flop") return "turn";
  if (street === "turn") return "river";
  return null;
}

function bucketLabelFor(street: Street, bucket: string): string {
  const table: Record<string, string> = street === "preflop" ? PREFLOP_BUCKET_LABELS : POSTFLOP_BUCKET_LABELS;
  return table[bucket] ?? bucket;
}

function GeoDatabase() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** 最下部バージョン表記タップ→パスコード(2357)→管理者画面(GEOデータ削除等)への隠し導線。 */
  const [adminGateOpen, setAdminGateOpen] = useState(false);
  const router = useRouter();
  // データ源の切替。"geo"=従来の実測プレイヤーDB / "gto"=自社計算したGTO解(検証用ビューア)。
  const [mode, setMode] = useState<"geo" | "gto">("geo");
  const [stackBucket, setStackBucket] = useState<StackBucket>("30+");
  // GTOタブ専用のエフェクティブスタック(実スタック深度)。GEOタブの範囲バケットとは独立。
  const [gtoStackBb, setGtoStackBb] = useState<GtoStack>(100);
  const [bubbleStage, setBubbleStage] = useState<BubbleStage>("normal");
  /**
   * GEOタブ: 卓の参加人数(2〜6)。必ずどれか1つを選ぶ。
   *
   * 人数をまとめて集計してはいけない。ラインはポジション名の並びで表すが、人数が違うと
   * アクション順そのものが変わるため、同じ "UTG:fold" というラインが6人卓のHJ・5人卓のCO・
   * 4人卓のBTNを1つのノードへ合流させてしまう。さらにルート(ライン無し)だけは全人数の
   * 最初のアクションが合算されるので、「UTGだけ異常にデータが多く、その先が急に痩せる」
   * という実体のない偏りが生まれていた。
   */
  const [playerCount, setPlayerCount] = useState<number>(6);
  /** GTOタブ: 人数(2〜6)。6未満はアーリーポジションの自動フォールド接頭辞で表現する。 */
  const [gtoPlayerCount, setGtoPlayerCount] = useState(6);
  // トナメ偏差値フィルタ範囲。全域(RATING_MIN〜RATING_MAX)のときはフィルタなし扱い。
  const [ratingRange, setRatingRange] = useState({ min: RATING_MIN, max: RATING_MAX });
  const ratingFilter =
    ratingRange.min > RATING_MIN || ratingRange.max < RATING_MAX ? ratingRange : undefined;
  const ratingActive = Boolean(ratingFilter);

  const [street, setStreet] = useState<Street>("preflop");
  const [preflopLine, setPreflopLine] = useState<LineStepWithMeta[]>([]);
  const [board, setBoard] = useState<string[]>([]);
  const [streetLines, setStreetLines] = useState<Record<Street, LineStepWithMeta[]>>({
    preflop: [],
    flop: [],
    turn: [],
    river: [],
  });
  const [pendingStreet, setPendingStreet] = useState<PostflopStreet | null>(null);
  const [dismissedStreet, setDismissedStreet] = useState<PostflopStreet | null>(null);

  const [node, setNode] = useState<TreeNode | null>(null);
  const [matrix, setMatrix] = useState<HandClassMatrixResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** ボード選択直後、その板面に一致する実測データが1件もないかどうか。真の間は次のストリートへ
   * 自動で進めず、「板面を選び直す」導線を出す(存在しない板面を選んだ場合の連鎖ポップアップ防止)。 */
  const [justPickedBoard, setJustPickedBoard] = useState(false);

  const bucketLabels: Record<string, string> = street === "preflop" ? PREFLOP_BUCKET_LABELS : POSTFLOP_BUCKET_LABELS;

  /** GTOタブで人数<6のとき、不在のアーリーポジションを自動フォールド扱いにする接頭辞。
   * リクエスト時のみラインの先頭に付与し、画面のピルには表示しない。 */
  const gtoFoldPrefix: LineStep[] =
    mode === "gto" && gtoPlayerCount < 6
      ? FULL_PREFLOP_ORDER.slice(0, 6 - gtoPlayerCount).map((p) => ({ position: p, bucket: "fold" }))
      : [];

  /** 現在のモード/人数でのプリフロップのアクション順(表示対象ポジション)。 */
  function preflopOrder(): string[] {
    if (mode === "gto") return FULL_PREFLOP_ORDER.slice(6 - gtoPlayerCount);
    return GEO_PREFLOP_ORDER[playerCount] ?? FULL_PREFLOP_ORDER;
  }

  /** 現在のモード/人数でのポストフロップのアクション順。 */
  function postflopOrderAll(): string[] {
    if (mode === "gto") {
      const visible = new Set(preflopOrder());
      return FULL_POSTFLOP_ORDER.filter((p) => visible.has(p));
    }
    return GEO_POSTFLOP_ORDER[playerCount] ?? FULL_POSTFLOP_ORDER;
  }

  function foldedBeforeStreet(streetKey: Street): Set<string> {
    const folded = new Set<string>();
    preflopLine.forEach((s) => {
      if (s.bucket === "fold") folded.add(s.position);
    });
    if (streetKey === "turn" || streetKey === "river") {
      streetLines.flop.forEach((s) => {
        if (s.bucket === "fold") folded.add(s.position);
      });
    }
    if (streetKey === "river") {
      streetLines.turn.forEach((s) => {
        if (s.bucket === "fold") folded.add(s.position);
      });
    }
    return folded;
  }

  function activePositions(streetKey: Street): string[] {
    const before = foldedBeforeStreet(streetKey);
    const order = streetKey === "preflop" ? preflopOrder() : postflopOrderAll();
    return order.filter((p) => !before.has(p));
  }

  function remainingActiveCount(streetKey: Street): number {
    const activeAtStart = activePositions(streetKey);
    const currentStreetLine = streetKey === "preflop" ? preflopLine : streetLines[streetKey];
    const foldedThisStreet = new Set(currentStreetLine.filter((s) => s.bucket === "fold").map((s) => s.position));
    return activeAtStart.filter((p) => !foldedThisStreet.has(p)).length;
  }

  // GTOポストフロップの「計算中」ポーリング。solving=true の応答が来たら数秒後に再取得する。
  const [solving, setSolving] = useState(false);
  const [pollTick, setPollTick] = useState(0);
  /** 一時的な取得失敗をリトライ中(スピナー文言を「再試行中」に切り替える用)。 */
  const [reconnecting, setReconnecting] = useState(false);
  /**
   * 直近の取得失敗の内訳。以前は catch でエラーを握り潰していたため、画面には
   * 「接続を再試行中…」しか出ず原因を切り分けられなかった。何が・どこで・どれだけ待って
   * 失敗したのかをそのまま保持し、待たせている間も画面に出す。
   */
  const [failure, setFailure] = useState<{ reason: string; detail: string; attempt: number } | null>(null);
  /** 現在のリクエストを開始した時刻(経過秒の表示用)。応答が遅いことを待っている間に伝える。 */
  const [requestStartedAt, setRequestStartedAt] = useState<number | null>(null);
  /** 同じ条件で連続して失敗した回数。条件が変わるか成功したらリセットする。 */
  const retryRoundRef = useRef(0);
  /** 直前のリクエスト条件。pollTickによる再試行と、条件変更による新規取得を区別するために持つ。 */
  const lastRequestKeyRef = useRef<string | null>(null);

  // 条件(モード/スタック/ライン/ボード等)を一意に表す文字列。pollTickは含めない —
  // これが変わったときだけ「新しい取得」とみなしてエラー表示をクリアする。
  const requestKey = JSON.stringify([
    mode,
    stackBucket,
    gtoStackBb,
    bubbleStage,
    street,
    preflopLine,
    board,
    streetLines[street],
    ratingFilter?.min,
    ratingFilter?.max,
    playerCount,
    gtoPlayerCount,
  ]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRequestStartedAt(Date.now());
    // 条件が変わった=新しい取得なので、前の条件で出したエラーは消す。
    // 逆にpollTickによる再試行では消さない — 以前はここで無条件にクリアしていたため、
    // 出したエラーが5秒後の再試行で勝手に消えてスピナーへ戻り、原因が読めなかった。
    if (lastRequestKeyRef.current !== requestKey) {
      lastRequestKeyRef.current = requestKey;
      retryRoundRef.current = 0;
      setError(null);
      setFailure(null);
      setReconnecting(false);
    } else if (retryRoundRef.current > 0) {
      // 失敗後のバックグラウンド再試行。スピナーを「再試行中(N回目)」にして、
      // エラー表示と合わせて「今まさに復帰を試している」ことが分かるようにする。
      setReconnecting(true);
    }

    // GTOタブは実スタック選択(gtoStackBb)を band へ写像して送る。push/fold/Nashノード用に近い範囲バケットも併送。
    const gtoBand = GTO_STACK_TO_BAND[gtoStackBb];
    const gtoBucket = GTO_STACK_TO_BUCKET[gtoStackBb];
    const makeRequest = () =>
      mode === "gto"
        ? street === "preflop"
          ? geoTreeApi.gtoNode({ variant: "full", line: [...gtoFoldPrefix, ...preflopLine], stackBucket: gtoBucket, band: gtoBand })
          : geoTreeApi.gtoPostflopNode({
              stackBucket: gtoBucket,
              band: gtoBand,
              line: [...gtoFoldPrefix, ...preflopLine],
              board,
              postflopLine: streetLines[street],
            })
        : street === "preflop"
        ? geoTreeApi.preflopNode({
            stackBucket,
            bubbleStage,
            line: preflopLine,
            ratingRange: ratingFilter,
            playerCount,
          })
        : geoTreeApi.postflopNode({
            stackBucket,
            bubbleStage,
            preflopLine,
            board,
            street,
            postflopLine: streetLines[street],
            ratingRange: ratingFilter,
            playerCount,
          });

    // 失敗したら「1回目で」原因を画面に出す。ここでリトライを重ねてから表示すると、
    // 1回ぶんのタイムアウト(10秒)×回数ぶんだけ表示が遅れ、その間ユーザーには
    // 「再試行中…」しか見えない=事実上フリーズ、という元の不具合に逆戻りするため。
    // リトライは必ずバックグラウンドに回す:
    // - 失敗を確定表示 → node を破棄(直前ノードへのアクション重複追加ループを断つ)
    // - loading=false にして画面を凍結させない(ユーザーは操作・手動再試行ができる)
    // - 5秒後にeffectごと再実行し、復帰するまでエラーを出したまま裏で試し続ける
    async function run() {
      if (cancelled) return;
      try {
        const result = await makeRequest();
        if (cancelled) return;
        setReconnecting(false);
        setSolving(Boolean(result.solving));
        if (result.solving) {
          // サーバーがCFR計算中。3.5秒後に再取得(このeffectをpollTickで再発火)。
          setTimeout(() => {
            if (!cancelled) setPollTick((t) => t + 1);
          }, 3500);
          return;
        }
        setNode(result.node);
        setMatrix(result.matrix);
        if (result.node.sampleSize > 0) setJustPickedBoard(false);
        retryRoundRef.current = 0;
        setError(null);
        setFailure(null);
      } catch (err) {
        if (cancelled) return;
        // 何が起きたかを必ず残す。GeoApiError なら原因種別・HTTPステータス・所要時間まで分かる。
        const reason = err instanceof GeoApiError ? err.describe() : err instanceof Error ? err.message : String(err);
        const detail =
          err instanceof GeoApiError ? err.detailLine() : err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        const round = retryRoundRef.current + 1;
        retryRoundRef.current = round;
        setNode(null);
        setReconnecting(false);
        setFailure({ reason, detail, attempt: round });
        setError(round === 1 ? reason : `${reason}(${round}回試行。自動で再試行を続けます)`);
        setTimeout(() => {
          if (!cancelled) setPollTick((t) => t + 1);
        }, 5000);
      }
    }

    void run().finally(() => {
      if (!cancelled) {
        setLoading(false);
        setRequestStartedAt(null);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, pollTick]);

  // プリフロップ(あるいは各ストリート)のアクションが終わり、まだ2人以上残っていて
  // 次のストリートがあるなら、自動でボードカード選択ポップアップを開く。
  useEffect(() => {
    if (!node || node.position !== null || pendingStreet || justPickedBoard) return;
    const next = nextStreetOf(street);
    if (!next) return;
    if (remainingActiveCount(street) < 2) return;
    if (dismissedStreet === next) return;
    setPendingStreet(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, street, pendingStreet, dismissedStreet, justPickedBoard, preflopLine, streetLines, board]);

  /** ラインをリセットしてプリフロップ先頭へ戻す(モード/人数の切替時)。 */
  function resetLines() {
    setStreet("preflop");
    setPreflopLine([]);
    setBoard([]);
    setStreetLines({ preflop: [], flop: [], turn: [], river: [] });
    setPendingStreet(null);
    setDismissedStreet(null);
    setJustPickedBoard(false);
  }

  function switchMode(next: "geo" | "gto") {
    if (next === mode) return;
    setMode(next);
    resetLines();
  }

  function changePlayerCount(next: number) {
    if (next === playerCount) return;
    setPlayerCount(next);
    resetLines();
  }

  function changeGtoPlayerCount(next: number) {
    if (next === gtoPlayerCount) return;
    setGtoPlayerCount(next);
    resetLines();
  }

  function selectBucket(bucket: string) {
    // 取得中/再試行中は選択を受け付けない。受け付けると、直前ノードが未確定のまま次の
    // アクションが積まれてラインが重複・破損する(致命バグの再発防止)。
    if (loading || !node?.position) return;
    const opt = node.options.find((o) => o.bucket === bucket);
    const step: LineStepWithMeta = { position: node.position, bucket, geometricRatio: opt?.geometricRatio ?? 0 };
    setDismissedStreet(null);
    setJustPickedBoard(false);
    if (street === "preflop") {
      setPreflopLine((prev) => [...prev, step]);
    } else {
      setStreetLines((prev) => ({ ...prev, [street]: [...prev[street], step] }));
    }
  }

  function handleTruncate(streetKey: Street, lineIndex: number) {
    setDismissedStreet(null);
    if (streetKey === "preflop") {
      setPreflopLine((prev) => prev.slice(0, lineIndex));
      setBoard([]);
      setStreetLines({ preflop: [], flop: [], turn: [], river: [] });
      setStreet("preflop");
      return;
    }
    setStreet(streetKey);
    if (streetKey === "flop") {
      setBoard((prev) => prev.slice(0, 3));
      setStreetLines((prev) => ({ ...prev, flop: prev.flop.slice(0, lineIndex), turn: [], river: [] }));
    } else if (streetKey === "turn") {
      setBoard((prev) => prev.slice(0, 4));
      setStreetLines((prev) => ({ ...prev, turn: prev.turn.slice(0, lineIndex), river: [] }));
    } else {
      setStreetLines((prev) => ({ ...prev, river: prev.river.slice(0, lineIndex) }));
    }
  }

  function confirmBoard(newCards: string[]) {
    setBoard((prev) => [...prev, ...newCards]);
    if (pendingStreet) setStreet(pendingStreet);
    setPendingStreet(null);
    setDismissedStreet(null);
    setJustPickedBoard(true);
  }

  const BOARD_LEN_BEFORE: Record<PostflopStreet, number> = { flop: 0, turn: 3, river: 4 };

  function retryBoard() {
    if (street === "preflop") return;
    const streetKey = street as PostflopStreet;
    setJustPickedBoard(false);
    setBoard((prev) => prev.slice(0, BOARD_LEN_BEFORE[streetKey]));
    setPendingStreet(streetKey);
  }

  function closeBoardPicker() {
    setDismissedStreet(pendingStreet);
    setPendingStreet(null);
  }

  function buildPositionPills(streetKey: Street, order: string[], line: LineStepWithMeta[], isCurrentStreet: boolean): PillBarItem[] {
    return order.map((position) => {
      const idx = line.findIndex((s) => s.position === position);
      if (idx !== -1) {
        const step = line[idx]!;
        return {
          kind: "position",
          street: streetKey,
          position,
          state: "decided",
          actionLabel: bucketLabelFor(streetKey, step.bucket),
          bucket: step.bucket,
          geometricRatio: step.geometricRatio,
          lineIndex: idx,
        };
      }
      if (isCurrentStreet && node?.position === position) {
        return { kind: "position", street: streetKey, position, state: "active" };
      }
      return { kind: "position", street: streetKey, position, state: "future" };
    });
  }

  const items: PillBarItem[] = [...buildPositionPills("preflop", preflopOrder(), preflopLine, street === "preflop")];
  // 2巡目(オープナーがスクイーズ/3betに応答)対応。1周モデルの buildPositionPills は各ポジションを
  // 1回しか描かないため、2回目以降のアクション(オープナーのvs3bet応答=fold/call/4bet)を明示的に足す。
  // 標準ラインでは preflopLine に重複ポジションが無く、この追加は空になるので既存挙動は不変(GEO側も安全)。
  {
    const firstIdx = new Map<string, number>();
    preflopLine.forEach((s, i) => {
      if (!firstIdx.has(s.position)) firstIdx.set(s.position, i);
    });
    // 2巡目以降の「決定済み」ピル(例: オープナーの call-vs-3bet)。
    preflopLine.forEach((s, i) => {
      if (firstIdx.get(s.position) === i) return; // 1周目は標準ピルで描画済み
      items.push({
        kind: "position",
        street: "preflop",
        position: s.position,
        state: "decided",
        actionLabel: bucketLabelFor("preflop", s.bucket),
        bucket: s.bucket,
        geometricRatio: s.geometricRatio,
        lineIndex: i,
      });
    });
    // アクティブな2巡目(オープナーが3betに応答する番)。node.position が既出=2巡目。
    if (street === "preflop" && node?.position && firstIdx.has(node.position)) {
      items.push({ kind: "position", street: "preflop", position: node.position, state: "active" });
    }
  }
  if (board.length >= 3) {
    items.push({ kind: "street", street: "flop", cards: board.slice(0, 3) });
    items.push(...buildPositionPills("flop", activePositions("flop"), streetLines.flop, street === "flop"));
  }
  if (board.length >= 4) {
    items.push({ kind: "street", street: "turn", cards: board.slice(3, 4) });
    items.push(...buildPositionPills("turn", activePositions("turn"), streetLines.turn, street === "turn"));
  }
  if (board.length >= 5) {
    items.push({ kind: "street", street: "river", cards: board.slice(4, 5) });
    items.push(...buildPositionPills("river", activePositions("river"), streetLines.river, street === "river"));
  }

  const noBoardData = !!node && node.position === null && justPickedBoard;

  const awaitingDismissedBoard =
    !!node &&
    node.position === null &&
    !pendingStreet &&
    !justPickedBoard &&
    dismissedStreet === nextStreetOf(street) &&
    nextStreetOf(street) !== null &&
    remainingActiveCount(street) >= 2;

  return (
    <div className="min-h-screen bg-navy-950">
      <div className="max-w-3xl lg:max-w-6xl mx-auto">
        <Header
          tone="dark"
          widthClass="max-w-3xl lg:max-w-6xl"
          left={
            <div className="w-full">
              <div className="mb-2 flex items-center justify-between gap-2">
                {/* GEO Database ワードマーク(GTO Wizard風のプロ仕様ヘッダー)。 */}
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-gold-500 shadow-[0_0_8px_theme(colors.gold.500)]" />
                  <p className="text-[15px] font-black tracking-tight text-navy-50 leading-none">
                    GEO<span className="text-gold-500"> Database</span>
                  </p>
                </div>
                {/* データ源トグル: GEO(実測) / GTO(自社計算・検証用)。 */}
                <div className="flex rounded-lg border border-navy-700 overflow-hidden text-[10px] font-black">
                  {(["geo", "gto"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => switchMode(m)}
                      className={`px-2.5 py-1 uppercase tracking-[0.15em] transition-colors ${
                        mode === m ? "bg-gold-500 text-navy-950" : "bg-navy-900 text-navy-400 active:bg-navy-800"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              {/* items-stretch で設定ボタンをアクションタブ(PositionPillBar)と同じ高さに常に揃える。 */}
              <div className="flex items-stretch gap-2.5">
                {/* 現在の設定(スタック帯・ステージ)を表示し、押すと詳細設定を変更できるボタン。
                    高さはUTG等のアクションタブに合わせて伸縮し、内容は縦中央寄せにする。 */}
                <motion.button
                  onClick={() => setSettingsOpen(true)}
                  whileTap={{ scale: 0.94 }}
                  className="shrink-0 flex flex-col justify-center rounded-xl border border-navy-700 bg-navy-900 px-3 py-1.5 text-left active:bg-navy-800 transition-colors"
                  aria-label="詳細設定を変更"
                >
                  <div className="flex items-center gap-1 text-[9px] font-black tracking-wide text-navy-400">
                    <Icon name="settings" className="h-3 w-3" />
                    設定
                  </div>
                  <div className="text-[11px] font-bold text-navy-50 whitespace-nowrap">
                    {mode === "gto"
                      ? `${GTO_STACK_LABELS[gtoStackBb]} · ${gtoPlayerCount}人`
                      : `${STACK_BUCKET_LABELS[stackBucket]} · ${BUBBLE_STAGE_LABELS[bubbleStage]} · ${playerCount}人${ratingActive ? ` · 偏差${ratingRange.min}-${ratingRange.max}` : ""}`}
                  </div>
                </motion.button>
                <PositionPillBar
                  items={items}
                  onTruncate={handleTruncate}
                  activeOptions={node?.position ? node.options : undefined}
                  activeSampleSize={node?.position ? node.sampleSize : undefined}
                  bucketLabels={bucketLabels}
                  onSelect={selectBucket}
                />
              </div>
            </div>
          }
        />
      </div>

      {/* lg以上は「左ナビレール + 本文」の2カラム。モバイルは従来の1カラム + 下部フッターナビ。 */}
      <div className="mx-auto flex w-full max-w-3xl lg:max-w-6xl lg:gap-6 lg:px-6">
        <SideNav tone="dark" activeKey="database" items={SIDE_NAV_ITEMS} className="lg:pt-4" />

        <main className="min-w-0 flex-1 px-4 pb-28 lg:px-0 lg:pb-12">
        {error && (
          <div className="rounded-2xl bg-crimson-500/10 ring-1 ring-crimson-500/30 px-4 py-3 mb-4">
            <p className="text-sm text-crimson-400">{error}</p>
            {/* 原因の技術詳細(種別・エンドポイント・HTTPステータス・所要ms)。そのまま共有できる。 */}
            {failure && <p className="mt-1 font-mono text-[10px] leading-snug text-crimson-300/70 break-all">{failure.detail}</p>}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPollTick((t) => t + 1)}
                className="rounded-full bg-crimson-500 px-4 py-1.5 text-[12px] font-bold text-white active:translate-y-px"
              >
                今すぐ再試行
              </button>
              <ReportErrorButton
                scope="geo"
                message={error}
                detail={failure?.detail ?? null}
                tone="dark"
                context={{ mode, street, stackBucket, bubbleStage, attempt: failure?.attempt ?? null }}
              />
            </div>
          </div>
        )}

        {/* サンプル数が少ない(n<5000)実測ノードの注意書き。レンジ表自体は表示するが、統計的に不十分な旨を明示する。 */}
        {node && !node.isGto && node.sampleSize > 0 && node.sampleSize < 5000 && (
          <div className="mt-1 flex items-start gap-2.5 rounded-2xl border border-gold-500/40 bg-gold-500/10 px-4 py-3">
            <Icon name="warning" className="mt-0.5 h-4 w-4 shrink-0 text-gold-500" />
            <p className="text-[12px] leading-snug text-gold-100">
              このノードはサンプル数が少なめです（n={node.sampleSize.toLocaleString()}）。レンジ表として不十分なため、参考程度にご覧ください。
            </p>
          </div>
        )}

        {/* PC(lg)ではレンジ表とアクション選択を左右に並べ、スクロールせずに両方を見渡せるようにする。 */}
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
        <div className="mt-1">{matrix && <HandClassMatrix matrix={matrix} bucketLabels={bucketLabels} />}</div>

        <div className="mt-3 lg:mt-1">
          {loading || solving ? (
            <div className="rounded-2xl border border-navy-800 bg-navy-900 p-8 text-center text-sm text-navy-400">
              <div className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-gold-500 border-t-transparent animate-spin" />
                {solving ? (
                  "GTOソルバーで計算中…(この局面の初回は数十秒かかります)"
                ) : reconnecting ? (
                  `接続を再試行中…(${failure?.attempt ?? 1}回目)`
                ) : requestStartedAt !== null ? (
                  // 待たされていること自体を必ず伝える。無言のスピナーだけだと
                  // 「進んでいるのか固まっているのか」が利用者にもこちらにも分からない。
                  <ElapsedText startedAt={requestStartedAt} />
                ) : (
                  "読み込み中…"
                )}
              </div>
              {/* 待たせている間も理由を隠さない。「ずっと再試行中」の原因がその場で読める。
                  上のエラーバナーに同じ内容が出ているときは重複させない。 */}
              {reconnecting && failure && !error && (
                <div className="mt-3 space-y-1 text-left">
                  <p className="text-[12px] leading-snug text-crimson-300">{failure.reason}</p>
                  <p className="font-mono text-[10px] leading-snug text-navy-500 break-all">{failure.detail}</p>
                </div>
              )}
            </div>
          ) : noBoardData ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border border-navy-700 bg-navy-900 p-6 text-center"
            >
              <p className="text-sm text-navy-300 mb-3">この板面に一致する実測データがありません。別の板面をお試しください。</p>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={retryBoard}
                className="rounded-full bg-gold-500 text-navy-950 text-[12px] font-bold px-5 py-2.5"
              >
                板面を選び直す
              </motion.button>
            </motion.div>
          ) : awaitingDismissedBoard ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border border-navy-700 bg-navy-900 p-6 text-center"
            >
              <p className="text-sm text-navy-300 mb-3">次のストリートに進むにはボードを選択してください。</p>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setDismissedStreet(null);
                  setPendingStreet(nextStreetOf(street));
                }}
                className="rounded-full bg-gold-500 text-navy-950 text-[12px] font-bold px-5 py-2.5"
              >
                ボードを選択
              </motion.button>
            </motion.div>
          ) : node ? (
            <PositionActionRow node={node} bucketLabels={bucketLabels} onSelect={selectBucket} />
          ) : null}
        </div>
        </div>

        {/* バージョン表記(タップ→パスコード2357→管理者画面。GEOデータの閲覧/削除等) */}
        <div className="mt-10 flex justify-center">
          <button
            onClick={() => setAdminGateOpen(true)}
            className="cursor-pointer text-[11px] font-medium tracking-wide text-navy-500 transition-colors active:text-navy-300"
          >
            Poker ART v{APP_VERSION} ・ © 2026 Poker ART
          </button>
        </div>
        </main>
      </div>

      <AnimatePresence>
        {adminGateOpen && (
          <PasscodeModal
            expected="2357"
            title="管理者パスコード"
            onSuccess={(code) => {
              try {
                sessionStorage.setItem("adminPasscode", code);
              } catch {
                /* sessionStorage不可でも/admin側で再入力できる */
              }
              router.push("/admin");
            }}
            onClose={() => setAdminGateOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pendingStreet && (
          <BoardCardPicker
            cardsNeeded={pendingStreet === "flop" ? 3 : 1}
            usedCards={board}
            onClose={closeBoardPicker}
            onConfirm={confirmBoard}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {settingsOpen && (
          <GeoSettingsModal
            mode={mode}
            stackBucket={stackBucket}
            gtoStackBb={gtoStackBb}
            bubbleStage={bubbleStage}
            ratingRange={ratingRange}
            playerCount={playerCount}
            gtoPlayerCount={gtoPlayerCount}
            onChangeStackBucket={setStackBucket}
            onChangeGtoStackBb={setGtoStackBb}
            onChangeBubbleStage={setBubbleStage}
            onChangeRatingRange={setRatingRange}
            onChangePlayerCount={changePlayerCount}
            onChangeGtoPlayerCount={changeGtoPlayerCount}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* 下部フッターナビはモバイル/タブレットのみ。lg以上は左のSideNavが担う。 */}
      <div className="lg:hidden">
        <Footer
          activeKey={null}
          centerActive
          items={[
            { key: "home", label: "Home", icon: "home", href: "/" },
            { key: "stats", label: "Stats", icon: "stats", href: "/?tab=stats" },
            { key: "history", label: "History", icon: "history", href: "/?tab=history" },
            { key: "leaderboard", label: "Leaderboard", icon: "trophy", href: "/?tab=leaderboard" },
          ]}
        />
      </div>
    </div>
  );
}
