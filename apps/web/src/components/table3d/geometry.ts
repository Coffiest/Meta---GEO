/**
 * 3D 卓の寸法・カメラと、3D の基準点 → 画面(設計枠 448×597 の px)への投影。
 *
 * 卓は 3D で描くが、席・カード・ポット・ボタンは今までどおり DOM で重ねる(文字が鮮明で、
 * 既存のアニメーションと実測によるディーラーボタンの配置がそのまま使える)。DOM をどこに置くかは、
 * 3D 側と**同じカメラ**で基準点を投影して決める。ここがずれると、席が卓の縁から浮いて見える。
 *
 * 座標系: 卓面が y=0 の XZ 平面。+z が手前(自席の側)、-z が奥。単位は任意(卓の短径の半分 = 1)。
 * 純関数・定数だけ(テストで投影結果を検査する)。three.js は使わない(卓画面の最初の読み込みに
 * three を含めないため。three は 3D の描画を遅延読み込みしたときだけ入る)。投影の式は three の
 * PerspectiveCamera + lookAt と同じ。
 */

export const DESIGN_WIDTH = 448;
export const DESIGN_HEIGHT = 597;

/** 卓の形。スーパー楕円 |x/a|^n + |z/b|^n = 1(角を強く丸めた長方形。旧卓画像と同じ系統の形)。 */
export const TABLE_SHAPE = {
  /** 外周の半幅(x)。 */
  halfWidth: 1.0,
  /** 外周の半奥行き(z)。 */
  halfDepth: 1.62,
  /** 丸みの指数(2 = 楕円、大きいほど四角)。 */
  exponent: 3.2,
  /** レール(縁のクッション)の幅。 */
  railWidth: 0.15,
  /** レールの高さ(卓面から)。 */
  railHeight: 0.085,
} as const;

/** カメラ: 自席の後ろ上方から見下ろす。画面の縦長(448:597)に卓がちょうど収まるよう合わせてある。 */
export const CAMERA = {
  fov: 33,
  position: [0, 4.15, 3.55] as const,
  target: [0, 0, 0.22] as const,
} as const;

/** スーパー楕円上の点。θ=0 が右(+x)、θ=π/2 が手前(+z)。 */
export function superellipsePoint(theta: number, a: number, b: number, n: number): { x: number; z: number } {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return {
    x: a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n),
    z: b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n),
  };
}

/** 輪郭の点列(閉じた多角形)。scale で内側の輪郭(レールの内縁・フェルト)を作る。 */
export function tableOutline(inset = 0, segments = 160): { x: number; z: number }[] {
  const { halfWidth, halfDepth, exponent } = TABLE_SHAPE;
  const pts: { x: number; z: number }[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    pts.push(superellipsePoint(t, halfWidth - inset, halfDepth - inset, exponent));
  }
  return pts;
}

export interface ScreenPoint {
  /** 設計枠の px。 */
  x: number;
  y: number;
  /** 手前(自席の縁)を 1 とした遠近の縮尺。 */
  depthScale: number;
}

type V3 = readonly [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** カメラの座標系(lookAt と同じ: 上方向は +y)。 */
function cameraBasis() {
  const forward = norm(sub(CAMERA.target, CAMERA.position));
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  return { forward, right, up };
}

/** 3D の点 → 設計枠の px と、カメラからの距離。 */
function project(p: V3): { x: number; y: number; distance: number } {
  const { forward, right, up } = cameraBasis();
  const d = sub(p, CAMERA.position);
  const depth = dot(d, forward);
  const t = Math.tan((CAMERA.fov * Math.PI) / 360);
  const ndcX = dot(d, right) / (depth * t * (DESIGN_WIDTH / DESIGN_HEIGHT));
  const ndcY = dot(d, up) / (depth * t);
  return {
    x: ((ndcX + 1) / 2) * DESIGN_WIDTH,
    y: ((1 - ndcY) / 2) * DESIGN_HEIGHT,
    distance: Math.hypot(d[0], d[1], d[2]),
  };
}

/**
 * 表示スロット(0 = 自席・画面下、時計回りに 1 左下 → 2 左上 → 3 奥 → 4 右上 → 5 右下)ごとの、
 * レールの上の角度。θ は superellipsePoint と同じ向き(π/2 = 手前)。
 */
const SLOT_THETA: Record<number, number> = {
  0: Math.PI / 2,
  1: Math.PI * 0.93,
  2: Math.PI * 1.2,
  3: Math.PI * 1.5,
  4: Math.PI * 1.8,
  5: Math.PI * 0.07,
};

export interface TableLayout {
  /** 各スロットの席の中心(レールの上)。 */
  seats: Record<number, ScreenPoint>;
  /** ボードの5枚の中心。 */
  board: ScreenPoint;
  /** ポット表示の中心(ボードの少し奥)。 */
  pot: ScreenPoint;
  /** 卓の中心(ディーラーボタンを置く直線の終点)。 */
  center: ScreenPoint;
  /** 卓の外周の画面上の範囲(テスト・デバッグ用)。 */
  bounds: { left: number; right: number; top: number; bottom: number };
  /** ボードを卓面に寝かせて見せる角度(度)。カメラの見下ろし角から出す。 */
  boardTiltDeg: number;
}

let cached: TableLayout | null = null;

export function tableLayout(): TableLayout {
  if (cached) return cached;
  const { halfWidth, halfDepth, exponent, railWidth, railHeight } = TABLE_SHAPE;
  const nearEdge = project([0, railHeight, halfDepth - railWidth / 2]).distance;
  const at = (x: number, y: number, z: number): ScreenPoint => {
    const p = project([x, y, z]);
    return { x: p.x, y: p.y, depthScale: nearEdge / p.distance };
  };

  const seats: Record<number, ScreenPoint> = {};
  for (const [slot, theta] of Object.entries(SLOT_THETA)) {
    const r = superellipsePoint(theta, halfWidth - railWidth / 2, halfDepth - railWidth / 2, exponent);
    seats[Number(slot)] = at(r.x, railHeight, r.z);
  }

  const outline = tableOutline(0, 96).map((p) => project([p.x, 0, p.z]));
  const pitch = Math.atan2(CAMERA.position[1] - CAMERA.target[1], CAMERA.position[2] - CAMERA.target[2]);

  cached = {
    seats,
    board: at(0, 0, 0.12),
    pot: at(0, 0, -0.42),
    center: at(0, 0, 0.1),
    bounds: {
      left: Math.min(...outline.map((p) => p.x)),
      right: Math.max(...outline.map((p) => p.x)),
      top: Math.min(...outline.map((p) => p.y)),
      bottom: Math.max(...outline.map((p) => p.y)),
    },
    // 真上から見下ろす(90°)なら寝かせない。見下ろし角が浅いほど強く寝かせる。
    boardTiltDeg: 90 - (pitch * 180) / Math.PI,
  };
  return cached;
}
