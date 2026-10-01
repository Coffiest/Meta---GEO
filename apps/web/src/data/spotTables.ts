import type { CheckRaiseBoard, DonkReason, ProbeCard } from "@meta-geo/engine/src/review/spotPlans.js";
import type { BarrelCard } from "@meta-geo/engine/src/review/barrelPlan.js";

/**
 * Notion の【プローブベット】【ドンクベット】【チェックレイズ(call側)】【チェックレイズサイズ･頻度】
 * 【チェックレイズ後のターン戦略(call側)】と、共有された解説画像「チェックレイズをしないといけない理由」。
 *
 * **ノートに書かれた手の選び方・サイズ・頻度は1つも落とさずにここに置く。** バリィの解説
 * (`lib/spotComment.ts`)は、局面に当たる行を吹き出しに出し、節全体を詳細に出す。
 */

// ═════════════════════════════ プローブ ═════════════════════════════

export interface ProbeRow {
  title: string;
  /** 打つ手とサイズ(ノートの文のまま)。 */
  hands: string;
  /** 有利ボードの頻度 / 不利ボードの頻度(記載が無ければ null)。 */
  favorable: string;
  unfavorable: string | null;
}

export const PROBE_TABLE: Record<ProbeCard, ProbeRow> = {
  straight: {
    title: "ストレート完成カード",
    hands: "TPTK以外のTP、2P、ガットショットで50%。ミドル〜ボトムヒット、アンダーペア、セット、OESDで33%",
    favorable: "頻度50%",
    unfavorable: "頻度20%(打つ手とサイズは同じ)",
  },
  rag: {
    title: "ラグ",
    hands: "TPTK以外のTP、2P、ガットショットで2e。ミドル〜ボトムヒット、アンダーペア、セット、OESDで33%",
    favorable: "頻度50%",
    unfavorable: "頻度20%(打つ手とサイズは同じ)",
  },
  overcard: {
    title: "A以外のオーバーカード",
    hands: "2P以上、ガットショット、ボトムヒットで2e。ミドル〜ボトムヒット、アンダーペア、セット、OESDで33%",
    favorable: "頻度30%",
    unfavorable: null,
  },
  ace: {
    title: "Aが落ちた時",
    hands: "2P以上、OESD、ガットショット、ボトムヒットで2e",
    favorable: "頻度10%",
    unfavorable: "頻度20%(打つ手とサイズは同じ)",
  },
  flush: {
    title: "フラッシュ完成カード",
    hands: "ショーダウンバリューのある手(Aハイ、ミドルペア系)と完全なエアー以外の全てで33%。乱数で2回に1回。TPもベットに含む",
    favorable: "頻度50%",
    unfavorable: "頻度20%(打つ手とサイズは同じ)",
  },
  repeat: {
    title: "ターンリピート(ボードがペアになる)",
    hands: "レンジでチェック",
    favorable: "打たない",
    unfavorable: "打たない",
  },
};

export const PROBE_DEFINITION =
  "プローブベット = フロップでオリジナルのIPがチェックバックしたあと、ターンでOOPから打つベット。" +
  "リバーも同じ考え方(ターンでチェックバックされたら、リバーで先に打つ)で、同じ表を使う。";

export const PROBE_BODY =
  PROBE_DEFINITION +
  "\n2e = ターンとリバーの2回で、ちょうどオールインになるサイズ(ジオメトリックサイズ)。\n\n" +
  "【有利ボード】\n" +
  (["straight", "rag", "overcard", "ace", "flush", "repeat"] as ProbeCard[])
    .map((c) => `・${PROBE_TABLE[c].title}(${PROBE_TABLE[c].favorable}): ${PROBE_TABLE[c].hands}`)
    .join("\n") +
  "\n\n【不利ボード】\n" +
  "・ストレート完成・ラグ・Aが落ちた時・フラッシュ完成カード: 打つ手とサイズは同じで、頻度は20%\n" +
  "・ターンリピート: レンジでチェック\n" +
  "・A以外のオーバーカード: ノートに記載が無いので、有利ボードと同じ手で見る\n\n" +
  "有利ボード = フロップが9ハイ以下か、ドローの多いボード(プローブする側のレンジが強くなりやすい)。";

// ═════════════════════════════ ドンク ═════════════════════════════

export const DONK_REASON_TEXT: Record<DonkReason, { title: string; why: string; hands: string }> = {
  lowBoard: {
    title: "フロップのローボード",
    why: "ローボードは、きみ(コール側)のレンジにナッツ級が多いボードだ",
    hands: "無理やりオッズを合わせる目的で、ドローで安くベット",
  },
  connectBoard: {
    title: "フロップのコネクトボード",
    why: "コネクトボードは、きみ(コール側)のレンジにナッツ級が多いボードだ",
    hands: "無理やりオッズを合わせる目的で、ドローで安くベット",
  },
  turnRepeat: {
    title: "ターンリピート",
    why: "ターンでボードがペアになって、ナッツ級がきみの側に移った",
    hands: "無理やりオッズを合わせる目的で、ドローで安くベット",
  },
  flushCompleted: {
    title: "フラッシュ完成カード",
    why: "フラッシュが完成しうるカードが落ちて、ナッツが変化した",
    hands: "フラッシュ以上のナッツ級でバリュー。リバーなら、2Pでダブルバレルを打たれてフラッシュ完成カードが落ちたときのドンクブロック",
  },
  straightCompleted: {
    title: "ストレート完成カード",
    why: "ストレートが完成しうるカードが落ちて、ナッツが変化した",
    hands: "ストレート以上のナッツ級でバリュー",
  },
  nutChange: {
    title: "ナッツが変化(リバーでボードがペア)",
    why: "ボードがペアになってナッツが変化し、きみの側にナッツ級(フルハウス)ができうる",
    hands: "フルハウス以上のナッツ級でバリュー",
  },
  threeBetStraight: {
    title: "3betPotのリバーのロー1枚ストレートボード",
    why: "3betPotで、ロー1枚でストレートが完成するリバーになった",
    hands: "ブロックベット",
  },
};

export const DONK_BODY =
  "ドンクの目的 = チェックバックされてしまうシチュエーションでの、バリューの取り逃し回避。\n" +
  "つまり、ドンクが存在するスポット = オリジナルがチェックバックしたいスポット = OOP側にナッツ級が移ったスポット。\n" +
  "・フロップのローボード、コネクトボード\n" +
  "・ターンリピート\n" +
  "・3betPotのロー1枚ストレートボード\n" +
  "・フラッシュ完成カードが落ちた時\n" +
  "・ストレート完成カードが落ちた時\n" +
  "・ナッツが変化しOOP側にナッツ級ができた時\n\n" +
  "【上記を満たす均衡的ドンク戦略】\n" +
  "・フロップのローボードやコネクトボード、ターンリピート時に、無理やりオッズを合わせる目的でドローで安くベット\n" +
  "・3betPotのリバーの1枚ストレートボードでのブロックベット\n" +
  "・2Pでダブルバレルを打たれて、リバーでフラッシュ完成カードが落ちてドンクブロック\n\n" +
  "【上記を満たさない誤ったドンクベット】\n" +
  "・ドンクが許されないシチュエーションでの、純粋なリバーブロックベット\n" +
  "・ターンで無理やりオッズを合わせるためにドローでベットするのを、リピートボード以外で打つ\n\n" +
  "【ブロックベット】チェックアラウンドを回避するバリューの安ドンクブロックベットは、ドンク条件を満たすこと。" +
  "デカベットを回避するブロックベットもドンク条件を満たすこと。ただし相手がブラフも持つマージナルベッターなら、" +
  "どんなシチュエーションでもデカベット回避型のブロックベットが有効。\n\n" +
  "【初心者ドンクの狩り方】ラグでのドンクベットは、血迷った謎ドンク。\n\n" +
  "ローボード = 最高ランクが8以下(ノートに数値の定義が無いので暫定)。コネクトボード = 上2枚のランク差が1以内。";

// ═════════════════════════════ チェックレイズ ═════════════════════════════

export interface CheckRaiseRow {
  title: string;
  /** 頻度とサイズ。 */
  size: string;
  value: string;
  bluff: string;
  /** コールに回す手など(あれば)。 */
  note: string | null;
}

export const CHECK_RAISE_TABLE: Record<CheckRaiseBoard, CheckRaiseRow> = {
  paired: {
    title: "ペアボード",
    size: "頻度10%で小さくレイズ",
    value: "キッカーが強いトリップスを半分チェックレイズに回し、残りのトリップスでコール",
    bluff: "全てのダブルバックドアをレイズ。さらに、スケアカードの多いポケットペア(例: 6ポケ)で毎回プロテクトレイズ",
    note: null,
  },
  straightBoard: {
    title: "ストレート完成ボード",
    size: "頻度10%で小さくレイズ",
    value: "上のストレートでレイズ、下のストレートでコール",
    bluff: "全てのコンボドロー(フラドロかつストドロ)と、全てのナッツフラッシュドローでレイズ。レインボーボードでは、バックドアフラッシュドローが付いたストレートドローをレイズ",
    note: null,
  },
  dryKQ: {
    title: "ドライなKハイ・Qハイボード",
    size: "頻度10%でポットレイズ(ドライなKハイ・Qハイのみ100%レイズ)",
    value: "全てのセットとツーペア",
    bluff: "全てのナッツストドロ、全てのオープンエンドストドロ、全てのナッツダブルバックドア、全てのダブルバックドアの付いたボトムヒット",
    note: null,
  },
  dryJT: {
    title: "ドライなJTハイボード",
    size: "チェックレイズサイズは50%",
    value: "セットはチェックレイズに回す",
    bluff: "フラッシュドローは全てチェックレイズ",
    note: "打つ側はチェックか350%のオールインの二極(バリューはTPTK・オーバーペア・2P、ブラフは全てのストレートドロー)",
  },
  monotone: {
    title: "モノトーンボード",
    size: "頻度5%で小さくレイズ",
    value: "モノトーンボードはパッシブにプレイする",
    bluff: "モノトーンボードはパッシブにプレイする",
    note: null,
  },
  general: {
    title: "上のどれにも当たらないボード",
    size: "チェックレイズサイズは50%。相手のCBサイズが上がるほど、チェックレイズ頻度は下がる",
    value: "セット、ツーペア以上",
    bluff: "ボトムヒット → ストレートドロー → 弱いポケット → フラッシュドローの順に優先",
    note: "チェックレイズは最低でも頻度15%必要",
  },
};

export const CHECK_RAISE_WHY =
  "エクイティの放棄をしないために、チェックレイズをしよう。チェックレイズを適切な頻度で行うと、相手のベットを抑制できる。" +
  "最低でも頻度15%でチェックレイズする必要がある。チェックレイズが少ないと相手にたくさんベットされて、" +
  "5枚目までカードを引ければ逆転できたかもしれない手を、たくさん降ろされてしまう。";

export const CHECK_RAISE_SHORT_STACK =
  "浅スタックのトナメでは、ワンペアくらいで頻繁にチェックレイズしていい。ワンペアでのオールインは、ショートの場合は大きな利益を生む。";

export const CHECK_RAISE_BODY =
  "チェックレイズ = OOP(相手より先にアクションをする人)が一旦チェックしたあと、相手のベットに対してレイズを返すこと。\n\n" +
  CHECK_RAISE_WHY +
  "\n\n【チェックレイズサイズ・頻度】\n" +
  "・相手のCBサイズが上がるほど、チェックレイズ頻度は下がる\n" +
  "・チェックレイズサイズは50%\n" +
  "・ドライなKハイ、Qハイのみ100%レイズ\n\n" +
  "【チェックレイズ(call側)】\n" +
  (["paired", "straightBoard", "dryKQ", "monotone"] as CheckRaiseBoard[])
    .map((b) => {
      const r = CHECK_RAISE_TABLE[b];
      return b === "monotone"
        ? `・${r.title}: ${r.size}。${r.value}`
        : `・${r.title}: ${r.size}\n  バリュー: ${r.value}\n  ブラフ: ${r.bluff}`;
    })
    .join("\n") +
  "\n\n【ドライJTハイボード】セットはチェックレイズ。フラッシュドローは全てチェックレイズ。\n\n" +
  "【ブラフの優先順】ボトムヒット → ストレートドロー → 弱いポケット → フラッシュドロー。\n" +
  "【コール側】ドローでのチェックレイズを恐れない。\n\n" +
  CHECK_RAISE_SHORT_STACK;

export interface AfterCheckRaiseRow {
  title: string;
  plan: string;
  value: string | null;
  bluff: string | null;
}

export const AFTER_CHECK_RAISE_TABLE: Record<BarrelCard, AfterCheckRaiseRow> = {
  overcard: { title: "オーバーカードが落ちた時", plan: "レンジ全体でチェック", value: null, bluff: null },
  paired: { title: "ペアカードが落ちた時", plan: "レンジ全体でチェック", value: null, bluff: null },
  flush: { title: "フラッシュ完成カードが落ちた時", plan: "全てのハンドで安くベット", value: null, bluff: null },
  rag: {
    title: "ラグが落ちた時",
    plan: "バリューハンドでポットベット。リバーでのオールインを目指す",
    value: "全てのセットとツーペアでベット(相手に降りられそうな時はチェック)",
    bluff: "全てのドローとボトムペア",
  },
};

export const AFTER_CHECK_RAISE_BODY =
  "【チェックレイズ後のターン戦略(call側)】フロップでチェックレイズしてコールされたあとのターン。\n" +
  (["overcard", "paired", "flush", "rag"] as BarrelCard[])
    .map((c) => {
      const r = AFTER_CHECK_RAISE_TABLE[c];
      return `・${r.title}: ${r.plan}` + (r.value ? `\n  バリュー: ${r.value}\n  ブラフ: ${r.bluff}` : "");
    })
    .join("\n");
