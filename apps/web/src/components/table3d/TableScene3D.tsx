"use client";

import { useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  CanvasTexture,
  PerspectiveCamera,
  Vector3,
  ExtrudeGeometry,
  Path,
  PCFSoftShadowMap,
  PMREMGenerator,
  RepeatWrapping,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  type BufferGeometry,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { CAMERA, DESIGN_HEIGHT, DESIGN_WIDTH, TABLE_SHAPE, tableOutline } from "./geometry";

/** DOM の配置(`geometry.ts` の投影)と同じカメラ。 */
function makeTableCamera(): PerspectiveCamera {
  const cam = new PerspectiveCamera(CAMERA.fov, DESIGN_WIDTH / DESIGN_HEIGHT, 0.1, 50);
  cam.position.set(...CAMERA.position);
  cam.lookAt(new Vector3(...CAMERA.target));
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

/**
 * 3D の卓(WebGL)。卓面・レール・金属の縁・脚台を形から作り、上からのスポットライトで影を落とす。
 * 席・カード・ポット・ボタンは載せない(DOM が同じカメラの投影で重なる。`geometry.ts`)。
 *
 * **発熱対策(卓画面は長時間開きっぱなしになる)**
 *  - `frameloop="demand"`: 卓は静止物なので、マウント時とリサイズ時しか描かない。待機中に GPU は回らない。
 *  - 影は最初の1回だけ焼く(`shadowMap.autoUpdate = false`)。
 *  - 解像度は端末の DPR の2倍まで。
 *
 * 色: 卓面は深いティールのフェルト(アクセント #26c2a3 と同じ系統を暗く落としたもの)、レールは黒い革。
 */

/** スーパー楕円の輪郭を Shape に(XZ → 形の XY。y = -z にして、X 軸で -90° 回すと元の向きに戻る)。 */
function outlineShape(inset: number): Shape {
  const pts = tableOutline(inset);
  const s = new Shape();
  pts.forEach((p, i) => (i === 0 ? s.moveTo(p.x, -p.z) : s.lineTo(p.x, -p.z)));
  s.closePath();
  return s;
}
function outlinePath(inset: number): Path {
  const pts = tableOutline(inset);
  const p = new Path();
  pts.forEach((q, i) => (i === 0 ? p.moveTo(q.x, -q.z) : p.lineTo(q.x, -q.z)));
  p.closePath();
  return p;
}

/** 形の座標から UV を 0〜1 に張り直す(ShapeGeometry の UV は形の座標そのままなので)。 */
function normalizeUv(geo: BufferGeometry): BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const pos = geo.attributes.position!;
  const uv = geo.attributes.uv!;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
  }
  uv.needsUpdate = true;
  return geo;
}

/** フェルトの絵(色の濃淡・繊維の粒・ベットライン・薄いロゴ)。1回だけ canvas に描く。 */
function makeFeltTexture(): CanvasTexture {
  const { halfWidth, halfDepth, railWidth } = TABLE_SHAPE;
  const W = 1024;
  const H = Math.round((W * halfDepth) / halfWidth);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;

  // 中央が明るく、縁へ沈むフェルト(スポットライトの陰影とは別に、布の色そのものの濃淡)。
  const grad = g.createRadialGradient(W / 2, H * 0.48, W * 0.05, W / 2, H / 2, H * 0.62);
  grad.addColorStop(0, "#1f5249");
  grad.addColorStop(0.55, "#163d37");
  grad.addColorStop(1, "#0b221f");
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // 繊維の粒。ごく弱いランダムな明暗を全面に。
  const img = g.getImageData(0, 0, W, H);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 14;
    img.data[i] = Math.max(0, Math.min(255, img.data[i]! + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1]! + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2]! + n));
  }
  g.putImageData(img, 0, 0);

  // ベットライン(卓の形を内側に縮めた細い線)。
  const toPx = (x: number, z: number) => [
    ((x + (halfWidth - railWidth)) / (2 * (halfWidth - railWidth))) * W,
    ((z + (halfDepth - railWidth)) / (2 * (halfDepth - railWidth))) * H,
  ];
  g.strokeStyle = "rgba(190, 255, 240, 0.13)";
  g.lineWidth = 3;
  g.beginPath();
  tableOutline(railWidth + 0.2).forEach((p, i) => {
    const [x, y] = toPx(p.x, p.z);
    if (i === 0) g.moveTo(x!, y!);
    else g.lineTo(x!, y!);
  });
  g.closePath();
  g.stroke();

  // 奥側に薄いワードマーク。
  g.fillStyle = "rgba(210, 255, 245, 0.07)";
  g.font = `800 ${Math.round(W * 0.075)}px "JetBrains Mono", ui-monospace, monospace`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const [lx, ly] = toPx(0, -0.78);
  g.fillText("POKER ART", lx!, ly!);

  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** 金属の映り込み用の環境光(部屋を模した簡易環境)。1回だけ作る。影は1回だけ焼く。 */
function SceneSetup() {
  const { gl, scene, invalidate } = useThree();
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.25;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    invalidate();
    return () => {
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, invalidate]);
  return null;
}

function Table() {
  const { railWidth, railHeight } = TABLE_SHAPE;
  const geos = useMemo(() => {
    const rail = new Shape();
    rail.curves = outlineShape(0).curves;
    rail.holes = [outlinePath(railWidth)];
    const bevel = railHeight * 0.45;
    const railGeo = new ExtrudeGeometry(rail, {
      depth: railHeight - bevel,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: 0.03,
      bevelSegments: 6,
      curveSegments: 1,
    });

    const trim = new Shape();
    trim.curves = outlineShape(railWidth - 0.004).curves;
    trim.holes = [outlinePath(railWidth + 0.016)];
    const trimGeo = new ExtrudeGeometry(trim, { depth: 0.012, bevelEnabled: false, curveSegments: 1 });

    const feltGeo = normalizeUv(new ShapeGeometry(outlineShape(railWidth), 1));

    const apronGeo = new ExtrudeGeometry(outlineShape(0.06), { depth: 0.16, bevelEnabled: false, curveSegments: 1 });
    return { railGeo, trimGeo, feltGeo, apronGeo };
  }, [railWidth, railHeight]);
  const felt = useMemo(() => makeFeltTexture(), []);

  useEffect(
    () => () => {
      Object.values(geos).forEach((g) => g.dispose());
      felt.dispose();
    },
    [geos, felt],
  );

  return (
    <group>
      {/* フェルト */}
      <mesh geometry={geos.feltGeo} rotation-x={-Math.PI / 2} receiveShadow>
        <meshStandardMaterial map={felt} roughness={0.96} metalness={0} />
      </mesh>
      {/* 金属の縁(フェルトとレールの境目) */}
      <mesh geometry={geos.trimGeo} rotation-x={-Math.PI / 2} position-y={0.001} receiveShadow>
        <meshStandardMaterial color="#b9c2c4" metalness={1} roughness={0.28} />
      </mesh>
      {/* レール(黒い革) */}
      <mesh geometry={geos.railGeo} rotation-x={-Math.PI / 2} castShadow receiveShadow>
        <meshPhysicalMaterial color="#070708" roughness={0.58} clearcoat={0.35} clearcoatRoughness={0.5} envMapIntensity={0.6} />
      </mesh>
      {/* 脚台(卓の下の厚み。手前の縁で少し見える)。上面をフェルトと同じ高さにすると z-fighting で縞が出るので、少し下げる。 */}
      <mesh geometry={geos.apronGeo} rotation-x={-Math.PI / 2} position-y={-0.19} castShadow>
        <meshStandardMaterial color="#0d0d0f" roughness={0.7} metalness={0.2} />
      </mesh>
      {/* 卓の落ち影を受ける面(面そのものは描かず、影だけが背景に落ちる) */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.2} receiveShadow>
        <planeGeometry args={[8, 9]} />
        <shadowMaterial opacity={0.55} />
      </mesh>
    </group>
  );
}

export default function TableScene3D() {
  const camera = useMemo(() => {
    const c = makeTableCamera();
    return Object.assign(c, { manual: true });
  }, []);
  return (
    <Canvas
      camera={camera}
      frameloop="demand"
      dpr={[1, 2]}
      shadows={{ type: PCFSoftShadowMap }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      style={{ pointerEvents: "none" }}
    >
      <SceneSetup />
      <hemisphereLight args={["#d7e6e2", "#050506", 0.32]} />
      <spotLight
        position={[0, 4.4, 0.7]}
        angle={0.62}
        penumbra={0.8}
        intensity={70}
        decay={2}
        color="#fff6ea"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0006}
        shadow-normalBias={0.025}
        shadow-radius={6}
        shadow-camera-near={2}
        shadow-camera-far={8}
      />
      {/* 奥からの弱い逆光。レールの縁が光って立体が読める。 */}
      <directionalLight position={[0, 2.2, -4]} intensity={0.9} color="#9fe8d8" />
      <Table />
    </Canvas>
  );
}
