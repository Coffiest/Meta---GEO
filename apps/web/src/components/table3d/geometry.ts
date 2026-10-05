/**
 * 3D 卓の寸法・カメラと、3D の基準点 → 画面(設計枠 448×H の px)への投影。
 *
 * 卓は 3D で描くが、席・カード・ポット・ボタンは今までどおり DOM で重ねる(文字が鮮明で、既存の
 * アニメーションがそのまま使える)。DOM をどこに置くかは、3D 側と**同じカメラ**で基準点を投影して決める。
 * ここがずれると、席が卓の縁から浮いて見える。
 *
 * **設計枠の高さ H は端末に合わせて変わる**(幅は 448 固定)。以前は 448×597 の固定枠を縮めて描いていて、
 * 縦長のスマホでは卓の上下に帯が余っていた(オーナー指摘)。H が大きいほど卓を縦に長くし、カメラを
 * 卓の中心へ寄せ直して、枠の上下の余白(奥の席の手札・自席のブロックのぶん)だけを残して卓で埋める。
 * 卓の長さとカメラの位置は、H ごとに二分探索で決める(`tableSpec`)。
 *
 * 座標系: 卓面が y=0 の XZ 平面。+z が手前(自席の側)、-z が奥。単位は任意(卓の短径の半分 = 1)。
 * 純関数・定数だけ(テストで投影結果を検査する)。three.js は使わない(卓画面の最初の読み込みに
 * three を含めないため)。投影の式は three の PerspectiveCamera + lookAt と同じ。
 */

export const DESIGN_WIDTH = 448;
/** 基準の高さ(2D の卓画像と同じ 3:4)。3D の卓はこれ以上の高さで描く。 */
export const DESIGN_HEIGHT = 597;
/** 3D の卓の設計枠の高さの範囲。縦長すぎる画面では、これ以上は卓を伸ばさない(上下に余白が残る)。 */
export const MIN_DESIGN_HEIGHT = 597;
export const MAX_DESIGN_HEIGHT = 860;

/** 空いている領域の縦横比から、3D の卓の設計枠の高さを決める。 */
export function designHeightFor(availableWidth: number, availableHeight: number): number {
  if (availableWidth <= 0 || availableHeight <= 0) return DESIGN_HEIGHT;
  const h = Math.round((DESIGN_WIDTH * availableHeight) / availableWidth);
  // 10px 刻みにして、わずかなリサイズで卓が作り直されないようにする。
  return Math.max(MIN_DESIGN_HEIGHT, Math.min(MAX_DESIGN_HEIGHT, Math.floor(h / 10) * 10));
}

/** 卓の形のうち、高さによらないもの。スーパー楕円 |x/a|^n + |z/b|^n = 1。 */
const BASE_SHAPE = {
  /** 外周の半幅(x)。 */
  halfWidth: 1.0,
  /** 丸みの指数(2 = 楕円、大きいほど四角)。 */
  exponent: 3.2,
  /** レール(縁のクッション)の幅。 */
  railWidth: 0.15,
  /** レールの高さ(卓面から)。 */
  railHeight: 0.085,
} as const;

export interface TableShape {
  halfWidth: number;
  /** 外周の半奥行き(z)。H によって変わる。 */
  halfDepth: number;
  exponent: number;
  railWidth: number;
  railHeight: number;
}

export interface CameraSpec {
  /** 縦の画角(度)。 */
  fov: number;
  position: readonly [number, number, number];
  target: readonly [number, number, number];
}

export interface TableSpec {
  height: number;
  shape: TableShape;
  camera: CameraSpec;
}

/** 基準(H = 597)のカメラ。自席の後ろ上方から見下ろす。 */
const BASE_FOV = 33;
const CAMERA_OFFSET: readonly [number, number, number] = [0, 4.15, 3.33];
/** 枠の上下に残す余白(px)。上は奥の席の手札、下は自席のブロックのぶん。 */
const MARGIN_TOP = 75;
const MARGIN_BOTTOM = 51;

/** 横の画角を保つ(どの H でも卓の幅は同じ大きさに見える)ための縦の画角。 */
function fovFor(height: number): number {
  const baseAspect = DESIGN_WIDTH / DESIGN_HEIGHT;
  const tanH = Math.tan((BASE_FOV * Math.PI) / 360) * baseAspect;
  return (2 * Math.atan(tanH / (DESIGN_WIDTH / height)) * 180) / Math.PI;
}

/** スーパー楕円上の点。θ=0 が右(+x)、θ=π/2 が手前(+z)。 */
export function superellipsePoint(theta: number, a: number, b: number, n: number): { x: number; z: number } {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return {
    x: a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n),
    z: b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n),
  };
}

/** 輪郭の点列(閉じた多角形)。inset で内側の輪郭(レールの内縁・フェルト)を作る。 */
export function tableOutline(shape: TableShape, inset = 0, segments = 160): { x: number; z: number }[] {
  const pts: { x: number; z: number }[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    pts.push(superellipsePoint(t, shape.halfWidth - inset, shape.halfDepth - inset, shape.exponent));
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

/** 3D の点 → 設計枠の px と、カメラからの距離。 */
function projectWith(cam: CameraSpec, height: number, p: V3): { x: number; y: number; distance: number } {
  const forward = norm(sub(cam.target, cam.position));
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const d = sub(p, cam.position);
  const depth = dot(d, forward);
  const t = Math.tan((cam.fov * Math.PI) / 360);
  const ndcX = dot(d, right) / (depth * t * (DESIGN_WIDTH / height));
  const ndcY = dot(d, up) / (depth * t);
  return {
    x: ((ndcX + 1) / 2) * DESIGN_WIDTH,
    y: ((1 - ndcY) / 2) * height,
    distance: Math.hypot(d[0], d[1], d[2]),
  };
}

function cameraAt(height: number, targetZ: number): CameraSpec {
  return {
    fov: fovFor(height),
    position: [CAMERA_OFFSET[0], CAMERA_OFFSET[1], targetZ + CAMERA_OFFSET[2]],
    target: [0, 0, targetZ],
  };
}

function boundsOf(spec: TableSpec): { left: number; right: number; top: number; bottom: number } {
  const pts = tableOutline(spec.shape, 0, 96).map((p) => projectWith(spec.camera, spec.height, [p.x, 0, p.z]));
  return {
    left: Math.min(...pts.map((p) => p.x)),
    right: Math.max(...pts.map((p) => p.x)),
    top: Math.min(...pts.map((p) => p.y)),
    bottom: Math.max(...pts.map((p) => p.y)),
  };
}

/** 卓の長さを決めたうえで、上下の余白が釣り合うカメラの位置を探す。返り値は余白の残り(px、負ならはみ出し)。 */
function centered(height: number, halfDepth: number): { spec: TableSpec; slack: number } {
  const shape: TableShape = { ...BASE_SHAPE, halfDepth };
  let lo = -2;
  let hi = 2;
  let spec: TableSpec = { height, shape, camera: cameraAt(height, 0) };
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    spec = { height, shape, camera: cameraAt(height, mid) };
    const b = boundsOf(spec);
    const topRoom = b.top - MARGIN_TOP;
    const bottomRoom = height - MARGIN_BOTTOM - b.bottom;
    // 注視点を手前(+z)へ動かすほど、卓は画面の上へずれる。上の余白が多い = 卓が下にある → 手前へ。
    if (topRoom > bottomRoom) lo = mid;
    else hi = mid;
  }
  const b = boundsOf(spec);
  return { spec, slack: Math.min(b.top - MARGIN_TOP, height - MARGIN_BOTTOM - b.bottom) };
}

const specCache = new Map<number, TableSpec>();

/** 高さ H の卓の形とカメラ。卓は余白に収まる最大の長さにする(二分探索)。 */
export function tableSpec(height: number = DESIGN_HEIGHT): TableSpec {
  const cached = specCache.get(height);
  if (cached) return cached;
  let lo = 1.2;
  let hi = 4;
  let best = centered(height, lo).spec;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const r = centered(height, mid);
    if (r.slack >= 0) {
      best = r.spec;
      lo = mid;
    } else hi = mid;
  }
  specCache.set(height, best);
  return best;
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

/**
 * ディーラーボタンの置き場所(スロットごとの固定の点)。席のレールから卓の内側へ `inset`、
 * 角度を `dTheta` だけ横にずらした点。席のブロック(手札・名前・ベット表示)とボード・ポットに
 * 重ならず、かつ**その席に一番近いボタン**になるよう決めてある(`tableGeometry.test.ts`)。
 *
 * ハンドの途中では位置が変わらない(実測をしない)。以前は描画のたびに実測していて、誰かが降りて
 * 「Fold」が出るとボタンが跳ね、避けた結果として卓の中央まで行って誰のボタンか分からなくなっていた。
 */
const DEALER_OFFSET: Record<number, { dTheta: number; inset: number }> = {
  0: { dTheta: -0.42, inset: 0.3 },
  1: { dTheta: -0.06, inset: 0.42 },
  2: { dTheta: 0.1, inset: 0.4 },
  3: { dTheta: 0.16, inset: 0.38 },
  4: { dTheta: -0.1, inset: 0.4 },
  5: { dTheta: 0.06, inset: 0.42 },
};

export interface TableLayout {
  height: number;
  /** 各スロットの席の中心(レールの上)。 */
  seats: Record<number, ScreenPoint>;
  /** 各スロットが BTN のときのディーラーボタンの中心。 */
  dealer: Record<number, ScreenPoint>;
  /** ボードの5枚の中心。 */
  board: ScreenPoint;
  /** ポット表示の中心(ボードの少し奥)。 */
  pot: ScreenPoint;
  /** 卓の中心。 */
  center: ScreenPoint;
  /** 卓の外周の画面上の範囲(テスト・デバッグ用)。 */
  bounds: { left: number; right: number; top: number; bottom: number };
  /** ボードを卓面に寝かせて見せる角度(度)。カメラの見下ろし角から出す。 */
  boardTiltDeg: number;
}

const layoutCache = new Map<number, TableLayout>();

export function tableLayout(height: number = DESIGN_HEIGHT): TableLayout {
  const cached = layoutCache.get(height);
  if (cached) return cached;
  const spec = tableSpec(height);
  const { halfWidth, halfDepth, exponent, railWidth, railHeight } = spec.shape;
  const proj = (p: V3) => projectWith(spec.camera, height, p);
  const nearEdge = proj([0, railHeight, halfDepth - railWidth / 2]).distance;
  const at = (x: number, y: number, z: number): ScreenPoint => {
    const p = proj([x, y, z]);
    return { x: p.x, y: p.y, depthScale: nearEdge / p.distance };
  };

  const seats: Record<number, ScreenPoint> = {};
  const dealer: Record<number, ScreenPoint> = {};
  for (const [slot, theta] of Object.entries(SLOT_THETA)) {
    const r = superellipsePoint(theta, halfWidth - railWidth / 2, halfDepth - railWidth / 2, exponent);
    seats[Number(slot)] = at(r.x, railHeight, r.z);
    const o = DEALER_OFFSET[Number(slot)]!;
    const d = superellipsePoint(theta + o.dTheta, halfWidth - railWidth - o.inset, halfDepth - railWidth - o.inset, exponent);
    dealer[Number(slot)] = at(d.x, 0, d.z);
  }

  // ボード・ポットは基準の卓で z=0.12 / −0.42。卓が縦に伸びたぶん、手前(卓の真ん中)へ寄せる
  // (奥に寄ったままだと、ボードと自席の間に大きな空きができる)。
  const k = halfDepth / 1.62;
  const shift = (k - 1) * 0.55;
  const pitch = Math.atan2(
    spec.camera.position[1] - spec.camera.target[1],
    spec.camera.position[2] - spec.camera.target[2]
  );
  const layout: TableLayout = {
    height,
    seats,
    dealer,
    board: at(0, 0, 0.12 + shift),
    pot: at(0, 0, -0.42 + shift * 0.8),
    center: at(0, 0, 0.1 + shift),
    bounds: boundsOf(spec),
    // 真上から見下ろす(90°)なら寝かせない。見下ろし角が浅いほど強く寝かせる。
    boardTiltDeg: 90 - (pitch * 180) / Math.PI,
  };
  layoutCache.set(height, layout);
  return layout;
}
