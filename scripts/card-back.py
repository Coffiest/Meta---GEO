#!/usr/bin/env python3
"""トランプの裏面画像を、オーナー支給の原画から描画用に書き出す。

原画は `apps/web/public/cards/back_source.jpg`(支給されたまま。**加工して残さない**)。
出力は `apps/web/public/cards/back_v2.png`。やるのは縮小と減色の2つだけで、
絵柄・色・構図には手を入れない。

## なぜ縮小するのか

裏面が一番大きく出るのは自席のカード(`PlayingCard` の lg = 高さ80px)。端末のDPRが3でも
実ピクセルで240px、幅にして183px しか要らない。原画は1206px幅あり、**描画に使う6.6倍**ある。
画像の大きさはそのままメモリと復号の負荷になる(1206×1592のRGBAは7.7MB)。卓は常時動いて
いて発熱に効くので、顔札と同じ744px幅(顔札は744×1039)まで落とす。744pxなら
DPR3の自席カードに対してもまだ4倍の余裕がある。

## なぜ減色するのか

絵柄は数色の平面的なイラストなのに、原画はJPEGなので白い輪郭のまわりにリンギングノイズを
持つ。128色へ減色すると(ディザ無し)平均誤差 0.29/255 ―― 見た目は変わらないまま、
PNGの容量が支給JPEGの234KBから95KBになる。

## 角の黒について

支給画像は角の外側(白い縁の外)が黒く塗られている。透過にする必要はない ――
描画側は顔札と同じく `rounded-md`(6px)で角を丸めており、**その半径の方が原画の角丸
(幅の4.6%、描画時で約1.5px)より大きい**ので、黒い画素は必ず内側に入る前に切り落とされる。
顔札も角まで不透明な白で、同じように `rounded-md` だけで丸めている。

使い方: python3 scripts/card-back.py
"""

from __future__ import annotations

import pathlib

from PIL import Image, ImageChops, ImageStat

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "apps/web/public/cards/back_source.jpg"
OUTPUT = ROOT / "apps/web/public/cards/back_v2.png"

# 顔札(public/cards/{1-13}{suit}.png)と同じ幅に揃える。
TARGET_WIDTH = 744
PALETTE_COLORS = 128


def main() -> None:
    src = Image.open(SOURCE).convert("RGB")
    height = round(TARGET_WIDTH * src.height / src.width)
    resized = src.resize((TARGET_WIDTH, height), Image.LANCZOS)
    reduced = resized.quantize(colors=PALETTE_COLORS, method=Image.MEDIANCUT, dither=Image.NONE)
    reduced.save(OUTPUT, "PNG", optimize=True)

    error = max(ImageStat.Stat(ImageChops.difference(resized, reduced.convert("RGB"))).mean)
    print(f"source {SOURCE.relative_to(ROOT)} {src.size} {SOURCE.stat().st_size // 1024}KB")
    print(
        f"wrote  {OUTPUT.relative_to(ROOT)} {reduced.size} "
        f"{OUTPUT.stat().st_size // 1024}KB 減色誤差={error:.2f}/255"
    )
    print(f"PlayingCard.tsx の BACK_ASPECT は aspect-[{TARGET_WIDTH}/{height}] に合わせること")


if __name__ == "__main__":
    main()
