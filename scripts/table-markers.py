#!/usr/bin/env python3
"""卓に置くマーカー(ディーラーボタン・オールインマーカー)の画像を、オーナー支給の原画から描画用に書き出す。

| 原画(支給されたまま。**加工して残さない**)          | 出力                                |
|-----------------------------------------------------|-------------------------------------|
| `apps/web/public/table/dealer_button_source.png`    | `apps/web/public/table/dealer_button_v1.png` |
| `apps/web/public/table/allin_marker_source.png`     | `apps/web/public/table/allin_marker_v1.png`  |

やるのは「形の外の台紙を透過」「余白の切り落とし」「縮小」の3つだけで、絵柄・色・構図には手を入れない。

## なぜ形の外を透過させるのか

支給画像は正方形で、形(円・三角)の外側が黒い台紙(#151513)で塗られている。卓の上に置くと黒い四角が
見えてしまうので、四隅と同じ色で四隅からつながっている領域だけを透過にする。ディーラーボタンの円の縁取りは
純黒(#000000)で台紙とわずかに色が違うので、色の近さで台紙だけを選べば縁取りは残る
(単純なしきい値ではなく塗り広げなので、形の中の黒い文字も巻き込まない)。

## なぜ縮小するのか

卓での表示は直径/幅で 20〜28px。端末のDPRが3でも 84px しか要らないので、余裕を見て長辺 192px に落とす
(原画 2000px の RGBA は 16MB で、常時動く卓に置くには重すぎる)。

原画を差し替えたら、このスクリプトを再実行すること。中身の意味が変わったら出力名を変える
(同名で上書きするとブラウザや CDN のキャッシュで古い画像が出続ける)。
"""
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TABLE = ROOT / "apps/web/public/table"
JOBS = [
    (TABLE / "dealer_button_source.png", TABLE / "dealer_button_v1.png"),
    (TABLE / "allin_marker_source.png", TABLE / "allin_marker_v1.png"),
]
LONG_SIDE = 192
TOLERANCE = 6  # 台紙の色(四隅の色)からこの差以内を台紙とみなす(縁取りの #000 は差 21 なので残る)


def export(src: Path, out: Path) -> None:
    im = Image.open(src).convert("RGB")
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

    # 形の外の余白を切り落とす(描画側で大きさを決めたとき、見た目の大きさと箱の大きさを一致させるため)。
    bbox = rgba.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    cw, ch = rgba.size
    scale = LONG_SIDE / max(cw, ch)
    small = rgba.resize((max(1, round(cw * scale)), max(1, round(ch * scale))), Image.LANCZOS, reducing_gap=3.0)
    small.save(out, optimize=True)
    print(f"wrote {out.relative_to(ROOT)} ({small.size[0]}x{small.size[1]}, {out.stat().st_size} bytes)")


def main() -> None:
    for src, out in JOBS:
        export(src, out)


if __name__ == "__main__":
    main()
