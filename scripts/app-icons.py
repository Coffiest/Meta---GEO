#!/usr/bin/env python3
"""アプリアイコン一式を、オーナー支給の1枚の原画から作り直す。

原画は `apps/web/public/logos/Logo_club.png`(クラブのスプラッター、正方形、黒地)。
**原画のファイルそのものには手を入れない**。色も絵も足さず引かず、やるのは
「リサイズ」「出る大きさに合わせた切り取り」「マスカブル用の余白付け」「減色」の4つだけ。

作るもの:

  apps/web/public/logos/Logo_club_1024.png      PWAマニフェストの purpose:"any"
  apps/web/public/logos/Logo_club_mask_1024.png PWAマニフェストの purpose:"maskable"
  apps/web/public/logos/Logo_club_mark_256.png  アプリ内ヘッダー(44pxで描画)
  apps/web/src/app/icon.png                     favicon(Next.jsの規約ファイル。512×512)
  apps/web/src/app/apple-icon.png               ホーム画面アイコン(180×180)
  apps/web/src/app/favicon.ico                  /favicon.ico(16/32/48の多重ICO)

## なぜ maskable だけ別に作るのか

Android のアダプティブアイコンは、アイコンを端末ごとの形(円・角丸四角・雫)で
**切り抜く**。切り抜かれても残ることが保証されているのは、中心にある直径80%の円
(セーフゾーン)の内側だけ。原画は絵柄が画面の82%まで広がっているので、そのまま
maskable として渡すと外周のスプラッターが欠ける。絵を80%へ縮めて地色で埋めた版を
別に用意し、`any` は原画そのまま(フルブリード)、`maskable` は余白付き、と使い分ける。

## 小さく出るものだけ絵柄いっぱいに切る

同じ絵でも、出る大きさによって切り方を変える。

- **小さく出るもの**(ブラウザのタブのfavicon 16〜32px、アプリ内ヘッダーの44px枠):
  原画のままだとクラブの本体が7〜20pxにしかならず、何の絵か分からない。
  「絵柄の外接矩形を正方形に広げた範囲」で切って枠いっぱいに絵を持ってくる
  (切る範囲は絵から毎回測るので、原画を差し替えても追従する)。
- **大きく出るもの**(ホーム画面/ランチャーのタイル、60pt以上): 切らない。
  タイルは余白があったほうが収まりが良く、支給された構図もそのまま残したいため。

## 地色

余白は原画の外周8pxの平均色で埋める。原画の地はほぼ一様な黒(#141412 付近)なので、
継ぎ目は出ない。アプリのトークン(--n-0 等)へ寄せる正規化はしない ―― 支給された絵の
地の色を変えないため。

## 減色して書き出す理由

原画はJPEG由来の微細なノイズを持つ(一様に見える地の実測は平均 #141412 / 標準偏差 0.8、
16〜24の幅で散っている)。実質2色の絵なのに異なる色が16,876個あり、そのほとんどが
目に見えないノイズなのに、PNGにすると容量のほとんどをそれが占める。書き出しの際に
128色へ減色すると(ディザ無し)、平均誤差 0.26/255 ―― 見た目は変わらないまま容量が
半分以下になる。原画 `Logo_club.png` は減色せずそのまま残す。

## iOS のホーム画面アイコン

iOS は PWA でも manifest の icons ではなく `apple-touch-icon` を使う。だから
apple-icon.png が実質の「ホーム画面に入れたときのアイコン」になる。iPhone の @3x が
60pt × 3 = 180px なので 180×180 がちょうど。iOS 側で角丸マスクが掛かるため、
こちらは余白を足さない(フルブリードのまま)。

使い方: python3 scripts/app-icons.py
"""

from __future__ import annotations

import pathlib

from PIL import Image, ImageChops, ImageStat

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "apps/web/public/logos/Logo_club.png"
LOGOS = ROOT / "apps/web/public/logos"
APP = ROOT / "apps/web/src/app"

# マスカブルのセーフゾーンは中心の直径80%。絵をその内側へ収める。
MASKABLE_SCALE = 0.80
# 書き出し時の色数(上の「減色して書き出す理由」参照)。
PALETTE_COLORS = 128


def background_color(img: Image.Image, border: int = 8) -> tuple[int, int, int]:
    """外周 `border` px の平均色。余白を埋めても継ぎ目が出ない色を原画から取る。"""
    w, h = img.size
    strips = [
        img.crop((0, 0, w, border)),
        img.crop((0, h - border, w, h)),
        img.crop((0, 0, border, h)),
        img.crop((w - border, 0, w, h)),
    ]
    total = [0.0, 0.0, 0.0]
    count = 0
    for strip in strips:
        stat = ImageStat.Stat(strip)
        for i in range(3):
            total[i] += stat.sum[i]
        count += stat.count[0]
    return tuple(round(c / count) for c in total)  # type: ignore[return-value]


def square(img: Image.Image, size: int) -> Image.Image:
    """正方形へリサイズ(原画が正方形でなければ地色の正方形へ中央配置してから)。"""
    if img.width != img.height:
        side = max(img.size)
        canvas = Image.new("RGB", (side, side), background_color(img))
        canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
        img = canvas
    return img.resize((size, size), Image.LANCZOS)


def mark(img: Image.Image, size: int) -> Image.Image:
    """絵柄の外接矩形を正方形に広げた範囲で切り出す(小さく出るもの用。上のコメント参照)。

    「絵柄」は地色より緑が明らかに強い画素。地はほぼ無彩色の黒、絵はティールなので
    この1本のしきい値で分かれる(地の緑の標準偏差は0.8しかないので、+40は十分に外側)。
    """
    bg = background_color(img)
    green = img.split()[1]
    lit = green.point(lambda v: 255 if v - bg[1] > 40 else 0)
    box = lit.getbbox()
    if box is None:
        return square(img, size)
    left, top, right, bottom = box
    cx, cy = (left + right) / 2, (top + bottom) / 2
    # 絵柄が枠に接しないよう5%だけ外へ広げる(角丸のタイルなので端ぎりぎりは切れて見える)。
    half = max(right - left, bottom - top) / 2 * 1.05
    # 画像からはみ出す場合は収まるところまで縮める(原画は絵柄が中央寄りなので通常は起きない)。
    half = min(half, cx, cy, img.width - cx, img.height - cy)
    crop = img.crop((round(cx - half), round(cy - half), round(cx + half), round(cy + half)))
    return crop.resize((size, size), Image.LANCZOS)


def maskable(img: Image.Image, size: int) -> Image.Image:
    inner = round(size * MASKABLE_SCALE)
    canvas = Image.new("RGB", (size, size), background_color(img))
    canvas.paste(square(img, inner), ((size - inner) // 2, (size - inner) // 2))
    return canvas


def main() -> None:
    src = Image.open(SOURCE).convert("RGB")
    print(f"source {SOURCE.relative_to(ROOT)} {src.size} bg={background_color(src)}")

    outputs: list[tuple[pathlib.Path, Image.Image]] = [
        (LOGOS / "Logo_club_1024.png", square(src, 1024)),
        (LOGOS / "Logo_club_mask_1024.png", maskable(src, 1024)),
        (LOGOS / "Logo_club_mark_256.png", mark(src, 256)),
        (APP / "icon.png", mark(src, 512)),
        (APP / "apple-icon.png", square(src, 180)),
    ]
    for path, image in outputs:
        reduced = image.quantize(colors=PALETTE_COLORS, method=Image.MEDIANCUT, dither=Image.NONE)
        reduced.save(path, "PNG", optimize=True)
        error = ImageStat.Stat(ImageChops.difference(image, reduced.convert("RGB"))).mean
        print(
            f"wrote {path.relative_to(ROOT)} {image.size} "
            f"{path.stat().st_size // 1024}KB 減色誤差={max(error):.2f}/255"
        )

    ico = APP / "favicon.ico"
    mark(src, 256).save(ico, "ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"wrote {ico.relative_to(ROOT)} 16/32/48 {ico.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
