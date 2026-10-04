#!/usr/bin/env python3
"""ディーラーボタンの画像を、オーナー支給の原画から描画用に書き出す。

原画は `apps/web/public/table/dealer_button_source.png`(支給されたまま。**加工して残さない**)。
出力は `apps/web/public/table/dealer_button_v1.png`。やるのは「円の外の黒い台紙を透過」と「縮小」の2つだけで、
絵柄・色・構図には手を入れない。

## なぜ円の外を透過させるのか

支給画像は正方形で、円の外側(四隅)が黒く塗られている。卓の上に置くと黒い四角が見えてしまうので、
四隅と同じ色(#151513 の台紙)で四隅からつながっている領域だけを透過にする。円の縁取りは
純黒(#000000)で台紙とわずかに色が違うので、色の近さで台紙だけを選べば縁取りは残る
(単純なしきい値ではなく塗り広げなので、円の中の黒い文字「DEALER」「POKER ART」も巻き込まない)。

## なぜ縮小するのか

卓での表示は直径28px。端末のDPRが3でも84px しか要らないので、余裕を見て192pxに落とす
(原画2000pxのRGBAは16MBで、常時動く卓に置くには重すぎる)。

原画を差し替えたら、このスクリプトを再実行すること。
"""
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "apps/web/public/table/dealer_button_source.png"
OUT = ROOT / "apps/web/public/table/dealer_button_v1.png"
SIZE = 192
TOLERANCE = 6  # 台紙の色(四隅の色)からこの差以内を台紙とみなす(縁取りの #000 は差 21 なので残る)


def main() -> None:
    im = Image.open(SRC).convert("RGB")
    w, h = im.size
    px = im.load()
    base = px[0, 0]
    outside = bytearray(w * h)
    q: deque[tuple[int, int]] = deque([(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)])
    while q:
        x, y = q.popleft()
        if not (0 <= x < w and 0 <= y < h) or outside[y * w + x]:
            continue
        if max(abs(a - b) for a, b in zip(px[x, y], base)) > TOLERANCE:
            continue
        outside[y * w + x] = 1
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    rgba = im.convert("RGBA")
    data = rgba.load()
    for y in range(h):
        for x in range(w):
            if outside[y * w + x]:
                r, g, b, _ = data[x, y]
                data[x, y] = (r, g, b, 0)

    # 縮小は透過を考慮した平均(premultiplied)で行う。
    small = rgba.resize((SIZE, SIZE), Image.LANCZOS, reducing_gap=3.0)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    small.save(OUT, optimize=True)
    print(f"wrote {OUT.relative_to(ROOT)} ({SIZE}x{SIZE}, {OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
