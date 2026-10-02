/**
 * モーションの共通言語。
 *
 * このアプリの動きは原則すべてスプリングで作る。キーフレームや固定時間のトランジションは
 * 途中で目標を変えられないため、動いている最中に指で掴んで引き戻す、といった操作ができない。
 * スプリングは「今の値と今の速度」から次の目標へ向かうので、いつ割り込まれても連続する。
 *
 * パラメータは物理の3値(質量/剛性/減衰)ではなく、Appleと同じ2つの言葉で考える:
 *   - bounce  … 行き過ぎ(オーバーシュート)の量。0 = 行き過ぎなし。
 *   - duration… 目標へ寄っていく速さ。所要時間の指定ではない(スプリングに終了時刻は無い)。
 *
 * 既定は bounce 0(臨界減衰)。跳ねは「その動きの直前にユーザーが勢いを与えたとき」だけ許す。
 * フリックして投げたカードが少し行き過ぎるのは自然だが、ただ現れたメニューが跳ねるのは不自然。
 */

import type { Transition } from "framer-motion";

/** 位置の移動・リサイズなど、勢いを伴わない一般的な変化。行き過ぎさせない。 */
export const SPRING_MOVE: Transition = { type: "spring", bounce: 0, duration: 0.4 };

/** 小さな要素の出現・状態変化。素早く収める。 */
export const SPRING_SNAPPY: Transition = { type: "spring", bounce: 0, duration: 0.28 };

/** 回転。わずかに行き過ぎさせると回した手応えが出る。 */
export const SPRING_ROTATE: Transition = { type: "spring", bounce: 0.2, duration: 0.4 };

/** ドラッグで開閉するシート/ドロワー。指の勢いを引き継ぐので跳ねてよい。 */
export const SPRING_SHEET: Transition = { type: "spring", bounce: 0.2, duration: 0.3 };

/** 投げられた要素が慣性で飛んでいく動き。最も跳ねる。 */
export const SPRING_THROW: Transition = { type: "spring", bounce: 0.3, duration: 0.5 };

/** 不透明度だけのクロスフェード。モーション低減時の置き換え先でもある。 */
export const FADE: Transition = { duration: 0.2, ease: [0.16, 1, 0.3, 1] };

/**
 * ジェスチャが終わった位置ではなく、その勢いが向かっている先へアニメーションさせるための投射。
 * スクロールの減速と同じ指数減衰で、指を離した瞬間の速度から静止位置を予測する。
 * 教科書的な v²/(2a) ではなくこの形を使う(iOSの減速挙動と一致するのはこちら)。
 *
 * @param velocity 指を離した瞬間の速度(px/秒)
 * @param decelerationRate 0.998 = 通常のスクロール相当。小さくするとよりキビキビ止まる。
 * @returns 現在位置からの移動量(px)。`現在位置 + project(v)` が予測静止位置。
 */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/**
 * 投射した静止位置に最も近いスナップ先を選ぶ。
 * 「離した位置に一番近い候補」ではなく「勢いが向かう先に一番近い候補」を選ぶことで、
 * 軽くフリックしただけで大きく飛ばせるようになる(小さな入力から大きな出力を作る)。
 */
export function snapTo(current: number, velocity: number, points: readonly number[]): number {
  const projected = current + project(velocity);
  return points.reduce((best, p) => (Math.abs(p - projected) < Math.abs(best - projected) ? p : best), points[0]);
}

/**
 * 境界を越えたときの抵抗(ラバーバンド)。越えるほど付いてこなくなる。
 * 硬く止めると「固まった」と読まれるが、抵抗しながら動き続けると
 * 「反応はしている、ただしこの先には何も無い」と正しく伝わる。
 *
 * @param overshoot 境界からはみ出した量(px)
 * @param dimension 対象の寸法(px)。大きいものほど緩やかに抵抗する。
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/**
 * ドラッグ終了からアニメーションへの継ぎ目を消すための初期速度。
 * 指を離した速度をそのままスプリングに渡すことで、掴んでいた動きと自走する動きが
 * 一本の動きに繋がる。framer-motion は絶対速度(px/秒)を受け取る。
 */
export function handoff(transition: Transition, velocity: number): Transition {
  return { ...transition, velocity };
}

/**
 * モーション低減が有効なときの置き換え。動きを消すのではなく、
 * 前庭系に障らない等価物(短いクロスフェード)に差し替える。
 */
export function respectMotion(transition: Transition, reduced: boolean): Transition {
  return reduced ? FADE : transition;
}

/** ドラッグと判定するまでの遊び(px)。これ未満はタップとして扱う。 */
export const DRAG_THRESHOLD = 10;
