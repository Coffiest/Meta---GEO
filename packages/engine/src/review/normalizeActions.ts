/**
 * 記録されたアクションの種類を、**実際に何をしたか**に直す。
 *
 * ハンドの記録には、プレイヤーが送った種類がそのまま残る。そのため次のような「中身はコール」の手が
 * `raise` / `allIn` / `bet` として残っていることがある(オーナー指摘: オールインにコールした手が
 * ダブルバレルを打ったと解説されていた)。
 *  - ベットに直面して、スタックが足りずに「ALL IN」ボタンを押した(送られる種類は raise)
 *  - 相手のオールインに、残り全部でコールした(自動の席も allIn で送る)
 *
 * 判定: そのストリートで出ている最大の額(toAmount の最大)を超えていない攻撃的な手はコール。
 * 超えていれば(額が足りないショートオールインでも)攻撃的な手のまま残す。
 * toAmount はどの種類もそのストリートの合計拠出額(handEngine と同じ)。
 *
 * 棋譜解析の全経路(役割判定・ポットの形・プリフロップのスポット・バケット)は、この関数を通した後の
 * アクションを読む。席の持ち主によって分岐しない。
 */
export interface NormalizableAction {
  street: string;
  kind: string;
  toAmount: number | null;
}

const AGGRESSIVE = new Set(["bet", "raise", "allIn"]);

export function normalizeCallLikeAggression<T extends NormalizableAction>(actions: readonly T[]): T[] {
  let street = "";
  let maxTo = 0;
  return actions.map((a) => {
    if (a.street !== street) {
      street = a.street;
      maxTo = 0;
    }
    if (a.kind === "postAnte") return a;
    const to = a.toAmount ?? 0;
    if (AGGRESSIVE.has(a.kind) && a.toAmount !== null && to <= maxTo) {
      return { ...a, kind: "call" };
    }
    if (to > maxTo) maxTo = to;
    return a;
  });
}
