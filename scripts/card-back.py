#!/usr/bin/env python3
"""トランプの裏面画像を、オーナー支給の原画から描画用に書き出す。

原画は `apps/web/public/cards/back_source.jpg`(支給されたまま。**加工して残さない**)。
出力は `apps/web/public/cards/back_v3.png`。やるのは縮小・角の透過・減色の3つだけで、
絵柄・色・構図には手を入れない。

## なぜ角を透過させるのか(v3で変わったところ)

支給画像は角の外側(白い縁の外)が黒く塗られている。以前はこれを透過させず、描画側の
`rounded-md`(6px)で黒ごと切り落としていた。ところが**その半径は絵の角丸よりずっと大きい**。
絵の角丸は幅の4.4%で、自席カード(幅61px)でも2.7px、相手の席(幅33px)なら1.5pxしかない。
6pxで丸めると黒だけでなく**白い縁と中身まで削れ、四隅が切り落とされて見えていた**(指摘済み)。

なので黒い部分そのものを透過にして、描画側では一切クリップしない。こうすれば絵の角丸が
そのまま出る。透過にするのは「四隅から黒でつながっている領域」だけ(単純なしきい値ではなく
四隅からの塗り広げ)なので、将来絵の中に暗い色が入っても巻き込まない。

## なぜ縮小するのか

裏面が一番大きく出るのは自席のカード(`PlayingCard` の lg = 高さ80px)。端末のDPRが3でも
実ピクセルで240px、幅にして183px しか要らない。原画は1206px幅あり、**描画に使う6.6倍**ある。
画像の大きさはそのままメモリと復号の負荷になる(1206×1592のRGBAは7.7MB)。卓は常時動いて
いて発熱に効くので、顔札と同じ744px幅(顔札は744×1039)まで落とす。744pxなら
DPR3の自席カードに対してもまだ4倍の余裕がある。

## なぜ減色するのか

絵柄は数色の平面的なイラストなのに、原画はJPEGなので白い輪郭のまわりにリンギングノイズを
持つ。パレットPNG(127色+透過1色)にすると平均誤差 0.3/255 程度 ―― 見た目は変わらないまま、
支給JPEGの228KBから95KB弱になる。RGBAのまま保存すると265KBまで膨らむので、
**透過は「完全に透明な1色」としてパレットに持たせる**(絵の縁のアンチエイリアスは不透明のまま
残るが、23倍に縮小されるため見えない)。

使い方: python3 scripts/card-back.py
"""

from __future__ import annotations

import pathlib
from collections import deque

import numpy as np
from PIL import Image, ImageChops, ImageStat

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "apps/web/public/cards/back_source.jpg"
OUTPUT = ROOT / "apps/web/public/cards/back_v3.png"

# 顔札(public/cards/{1-13}{suit}.png)と同じ幅に揃える。
TARGET_WIDTH = 744
# 透過用に1色空けるので、絵に使えるのは255色ではなく127色。
PALETTE_COLORS = 127
# 「黒い台紙」とみなす明るさ。絵の一番暗い色(ティールの地 = max 126)より十分下に置く。
BLACK_MAX = 60


def outside_mask(img: Image.Image) -> np.ndarray:
    """四隅から黒でつながっている領域(= 台紙の外側)を True で返す。

    単純なしきい値ではなく四隅からの塗り広げにしているのは、絵の中に暗い色が入っても
    巻き込まないようにするため。
    """
    arr = np.asarray(img).astype(int)
    height, width, _ = arr.shape
    dark = arr.max(2) < BLACK_MAX
    seen = np.zeros((height, width), bool)
    queue: deque[tuple[int, int]] = deque()
    for y, x in ((0, 0), (0, width - 1), (height - 1, 0), (height - 1, width - 1)):
        if dark[y, x] and not seen[y, x]:
            seen[y, x] = True
            queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < height and 0 <= nx < width and dark[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((ny, nx))
    return seen


def main() -> None:
    src = Image.open(SOURCE).convert("RGB")
    height = round(TARGET_WIDTH * src.height / src.width)
    # 透過は縮小の**後**に付ける。先に付けて縮小すると、透明部分の黒いRGBが縁へ混ざって
    # 暗いふちが出る(PILのリサイズは乗算済みアルファではないため)。
    resized = src.resize((TARGET_WIDTH, height), Image.LANCZOS)

    outside = outside_mask(resized)
    reduced = resized.quantize(colors=PALETTE_COLORS, method=Image.MEDIANCUT, dither=Image.NONE)

    transparent_index = PALETTE_COLORS
    palette = list(reduced.getpalette())[: PALETTE_COLORS * 3] + [0, 0, 0]
    indexed = np.where(outside, transparent_index, np.asarray(reduced)).astype("uint8")
    out = Image.fromarray(indexed, mode="P")
    out.putpalette(palette)
    out.save(OUTPUT, "PNG", optimize=True, transparency=transparent_index)

    error = max(ImageStat.Stat(ImageChops.difference(resized, reduced.convert("RGB"))).mean)
    corner_run = int((~outside[0]).argmax())
    print(f"source {SOURCE.relative_to(ROOT)} {src.size} {SOURCE.stat().st_size // 1024}KB")
    print(
        f"wrote  {OUTPUT.relative_to(ROOT)} {out.size} {OUTPUT.stat().st_size // 1024}KB "
        f"減色誤差={error:.2f}/255 透過={outside.mean() * 100:.3f}% 角丸={corner_run}px"
        f"({corner_run / TARGET_WIDTH * 100:.1f}%)"
    )
    print(f"PlayingCard.tsx の BACK_ASPECT は aspect-[{TARGET_WIDTH}/{height}] に合わせること")


if __name__ == "__main__":
    main()
