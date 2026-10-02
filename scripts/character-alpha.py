#!/usr/bin/env python3
"""棋譜解析の解説役「バリィ」の画像を、暗い地に置ける透過PNGにする。

オーナー支給の `bally_source.jpg` は**白地に白い体・黒い輪郭**のJPEG(アルファ無し)。
アプリは暗い地(#1C1C1E〜#3A3A3C)なので、そのまま置くと白い長方形が出る。

やること:

1. **縁から塗り広げて到達できる明るい画素 = 外側 → 透明。** 体の中の白は輪郭で閉じて
   いるので到達できず、白いまま残る(`table-alpha.py` の内部塗りと同じ考え方)。
   輪郭の外側のアンチエイリアス(白に近い灰)は、暗さをアルファにして黒で残す。
2. **外に浮いた黒い線(右上の「≡」)を明るいグレーに塗り替える。** 体の輪郭や目と違い、
   周りが全部外側(透明)なので、暗い地では見えなくなるため。色は `--fg-2`(#AEAEB2)。
3. 余白を切り詰める。

支給された元ファイルには手を触れない。出力は別名で保存する。中身の意味が変わったら
出力の名前も変える(同名で上書きするとキャッシュで古い画像が出続ける)。

    pip install pillow numpy
    python3 scripts/character-alpha.py
"""
from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "apps/web/public/characters/bally_source.jpg"
DST = ROOT / "apps/web/public/characters/bally_v1.png"

# これより明るい画素は「線ではない」とみなし、外側の塗り広げが通れる。
# JPEGのにじみで白が 240 前後まで落ちるので、線の芯(ほぼ 0)との中間に置く。
PASSABLE_MIN = 128
# 外に浮いた線の塗り色。globals.css の `--n-8`(= `fg-2`)。
FLOAT_COLOR = (174, 174, 178)
# 浮いた線の周りのアンチエイリアスも同じ色にする範囲(画素)。
FLOAT_HALO = 3
# 切り詰めたあとに残す余白(画素)。
PAD = 2
# 塗り広げの前に、周りへ足す白の幅(画素)。支給画像は頭のてっぺんと足元が画像の縁に
# 接しているので、足さないと縁から外側を塗り広げられない箇所ができる。
MARGIN = 4
# これより小さい「浮いた黒」はゴミ(支給画像の左上隅に数画素の黒い点がある)として消す。
SPECK_MAX = 30


def flood_exterior(passable: np.ndarray) -> np.ndarray:
    """縁から4近傍で塗り広げて、到達できた画素を True にする。"""
    h, w = passable.shape
    seen = np.zeros_like(passable, dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if passable[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if passable[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and passable[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    return seen


def label_components(mask: np.ndarray) -> tuple[np.ndarray, int]:
    """mask の連結成分(8近傍)に 1.. の番号を振る。"""
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    n = 0
    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or labels[sy, sx]:
                continue
            n += 1
            labels[sy, sx] = n
            q = deque([(sy, sx)])
            while q:
                y, x = q.popleft()
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not labels[ny, nx]:
                            labels[ny, nx] = n
                            q.append((ny, nx))
    return labels, n


def dilate(mask: np.ndarray, r: int) -> np.ndarray:
    out = mask.copy()
    for _ in range(r):
        grown = out.copy()
        grown[1:, :] |= out[:-1, :]
        grown[:-1, :] |= out[1:, :]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


def build() -> Image.Image:
    rgb = np.asarray(Image.open(SRC).convert("RGB"), dtype=np.float64)
    rgb = np.pad(rgb, ((MARGIN, MARGIN), (MARGIN, MARGIN), (0, 0)), constant_values=255)
    lum = rgb.mean(axis=2)
    passable = lum > PASSABLE_MIN
    exterior = flood_exterior(passable)

    # 線の芯(通れない暗い画素)の連結成分のうち、隣が全部「外側」のものが浮いた線。
    # 体の輪郭と目は、体の中の白(外側ではない明るい画素)に接しているので当たらない。
    dark = ~passable
    labels, n = label_components(dark)
    inner_light = passable & ~exterior
    touches_inner = np.zeros(n + 1, dtype=bool)
    near_inner = dilate(inner_light, 1)
    touches_inner[np.unique(labels[near_inner & dark])] = True
    floating = dark & ~touches_inner[labels]
    # 小さすぎる浮いた黒はゴミ。透明にする(外側として扱う)。
    sizes = np.bincount(labels.ravel(), minlength=n + 1)
    speck = floating & (sizes[labels] <= SPECK_MAX)
    floating &= ~speck
    exterior |= speck
    float_zone = dilate(floating, FLOAT_HALO)

    h, w = lum.shape
    out = np.zeros((h, w, 4), dtype=np.uint8)
    # 体(外側ではない画素)はそのまま不透明。
    body = ~exterior
    out[body, :3] = rgb[body].round().astype(np.uint8)
    out[body, 3] = 255
    # 外側: 暗さをアルファに。色は黒(浮いた線の周りだけ明るいグレー)。
    ext_alpha = np.clip(255 - lum, 0, 255).round().astype(np.uint8)
    out[exterior, 3] = ext_alpha[exterior]
    out[exterior, :3] = 0
    # 浮いた線: 芯も周りのアンチエイリアスも明るいグレーに。
    fz = float_zone & (floating | exterior)
    out[fz, :3] = FLOAT_COLOR
    out[floating, 3] = 255
    # ゴミの点は、周りのにじみごと消す。
    out[dilate(speck, 2) & exterior, 3] = 0
    # JPEGのにじみで外側に出た薄い灰(アルファ数%)は消す。
    faint = exterior & (out[..., 3] < 12)
    out[faint, 3] = 0

    img = Image.fromarray(out, "RGBA")
    ys, xs = np.nonzero(out[..., 3] >= 128)
    box = (
        max(0, xs.min() - PAD),
        max(0, ys.min() - PAD),
        min(w, xs.max() + 1 + PAD),
        min(h, ys.max() + 1 + PAD),
    )
    print(f"floating strokes recolored: {len(np.unique(labels[floating]))}, specks removed: {len(np.unique(labels[speck]))}")
    return img.crop(box)


def verify(img: Image.Image) -> None:
    a = np.asarray(img)
    h, w = a.shape[:2]
    for y, x in ((0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)):
        assert a[y, x, 3] == 0, f"corner ({x},{y}) is not transparent"
    # 体の中(画像の下寄り中央)は白く不透明なこと。
    cy, cx = int(h * 0.75), int(w * 0.35)
    px = a[cy, cx]
    assert px[3] == 255 and px[:3].min() > 200, f"body center is not opaque white: {px}"
    # 浮いた線の色が載っていること。
    has_float = np.any((a[..., 3] == 255) & np.all(a[..., :3] == FLOAT_COLOR, axis=-1))
    assert has_float, "floating strokes were not recolored"
    print(f"ok: {w}x{h}, aspect {w / h:.4f}")


if __name__ == "__main__":
    result = build()
    verify(result)
    result.save(DST, optimize=True)
    print(f"wrote {DST.relative_to(ROOT)}")
