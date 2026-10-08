#!/usr/bin/env python3
"""相手の決定を解説する「ラフくん」の画像を、暗い地に置ける透過PNGにする。

オーナー支給の `rafu_source.jpg` は**白地に黒い体(シルエット)・白い目**のJPEG(アルファ無し)。
アプリの地は暗い(#0A0A0B〜)ので、黒い体のままだと地に溶けて見えない。

やること:
1. 縁から塗り広げて到達できる明るい画素 = 外側 → 透明。目や腕の白い線(体に囲まれた白)は白のまま残す。
2. 体の外周に明るいグレーの縁取り(--fg-2 #AEAEB2)を付けて、暗い地から輪郭を立てる。
3. 外に浮いた黒い線(左上の「≡」)は明るいグレーに塗り替える(暗い地では見えなくなるため)。
4. 余白を切り詰め、高さ 420px に縮める(バリィの 419px に揃える)。

支給された元ファイルには手を触れない。中身の意味が変わったら出力の名前も変える。

    python3 scripts/character-rafu.py
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "apps/web/public/characters/rafu_source.jpg"
DST = ROOT / "apps/web/public/characters/rafu_v1.png"
LIGHT = (174, 174, 178)
RIM = 6  # 縁取りの太さ(元画像の画素)
TARGET_H = 420

_spec = importlib.util.spec_from_file_location("ca", ROOT / "scripts/character-alpha.py")
ca = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ca)  # type: ignore[union-attr]


def build() -> Image.Image:
    rgb = np.asarray(Image.open(SRC).convert("RGB"), dtype=np.float64)
    m = 4 + RIM
    rgb = np.pad(rgb, ((m, m), (m, m), (0, 0)), constant_values=255)
    lum = rgb.mean(axis=2)
    passable = lum > 128
    exterior = ca.flood_exterior(passable)
    dark = ~passable
    labels, n = ca.label_components(dark)
    sizes = np.bincount(labels.ravel(), minlength=n + 1)
    biggest = int(np.argmax(sizes[1:]) + 1)
    body_dark = labels == biggest
    floating = dark & ~body_dark & (sizes[labels] > 30)
    body = ~exterior & ~(floating)  # 体(黒)+ 体に囲まれた白(目・線)

    h, w = lum.shape
    out = np.zeros((h, w, 4), dtype=np.uint8)
    # 外周の縁取り: 体を広げた輪の部分。
    rim = ca.dilate(body | body_dark, RIM) & exterior & ~floating
    out[rim, :3] = LIGHT
    out[rim, 3] = 255
    # 体: 元の色のまま不透明(黒い体・白い目)。
    out[body, :3] = rgb[body].round().astype(np.uint8)
    out[body, 3] = 255
    # 浮いた線: 明るいグレー。
    fz = ca.dilate(floating, 2) & exterior & ~rim
    out[fz | floating, :3] = LIGHT
    out[fz | floating, 3] = 255

    img = Image.fromarray(out, "RGBA")
    ys, xs = np.nonzero(out[..., 3] >= 128)
    img = img.crop((xs.min() - 2, ys.min() - 2, xs.max() + 3, ys.max() + 3))
    scale = TARGET_H / img.height
    return img.resize((round(img.width * scale), TARGET_H), Image.LANCZOS)


if __name__ == "__main__":
    out = build()
    a = np.asarray(out)
    assert a[0, 0, 3] == 0 and a[-1, -1, 3] == 0, "corners must be transparent"
    out.save(DST, optimize=True)
    print(f"wrote {DST.relative_to(ROOT)} {out.size}")
