#!/usr/bin/env python3
"""卓画像の黒い台紙を、アルファチャンネルとして焼き込む。

オーナー支給の `table_v3.png` は**アルファを持たない不透明な黒地**の画像で、
これまでは `mix-blend-mode: screen` で黒を透過扱いにしていた。screen は黒を
「そこには何も足さない」として扱うので、理屈のうえでは台紙が消える。

ところが実機(iOS/WebKit)では消えなかった。`mix-blend-mode` は「同じ合成の文脈
(stacking context)の中の背面」としか混ざらないところ、卓を縮小している `zoom` の箱が
WebKit では文脈を作ってしまい、合成の相手が星空ではなくその箱の中(=何も無い)に
なっていたため。Blink の標準化後の `zoom` は文脈を作らないので Chromium では消えており、
それで見落とした。

合成に頼るのをやめて、同じ結果を画像に焼き込む。

    a   = max(r, g, b)
    rgb = 元の色 × 255 / a     (a > 0 のとき。a = 0 なら完全透明)

無彩色(r = g = b)の画素では、これを通常のアルファ合成した結果は screen 合成と
**数学的に完全に一致する**:

    screen:  255 - (255 - v)(255 - B) / 255  =  v + B(255 - v)/255
    alpha :  (255・v + B(255 - v)) / 255     =  v + B(255 - v)/255

この画像は黒地に白い線画なので、ほぼ全ての画素が無彩色。有彩色の画素が混じっていた
場合も、上の式は「黒に対するアンプリマルチプライ」なので見た目はほぼ変わらない
(彩度の情報は rgb 側に残る)。実際の彩度は下の統計で毎回報告する。

支給された元ファイルには一切手を触れない。出力は別名で保存する。

    python3 scripts/table-alpha.py
"""
import struct
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "apps/web/public/table/table_v3.png"
# 同名で上書きするとブラウザやCDNのキャッシュで古い画像が出続けることがあるので、
# 中身の意味が変わったら名前も変える。`table_v3_alpha.png`(内部が透明だった版)は残す。
DST = ROOT / "apps/web/public/table/table_v3_filled.png"

# 卓の内部を塗りつぶす色。globals.css の `--n-4`(#3A3A3C / カード面 L2)。
# その場限りの値を作らず既存トークンから採る。この段を選んだ理由は下の to_rgba を参照。
FILL = (58, 58, 60)

# 外側を塗り広げるときに「壁」とみなすアルファのしきい値。輪郭線のアンチエイリアスが
# これを下回るところまでを外側とする。20 / 40 / 80 のどれでも漏れないことを確認済み。
WALL_ALPHA = 20


def read_png_rgb(path):
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit(f"{path} is not a PNG")
    pos, idat = 8, []
    width = height = depth = color = None
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        kind = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            width, height, depth, color = struct.unpack(">IIBB", chunk[:10])
            interlace = chunk[12]
            if (depth, color, interlace) != (8, 2, 0):
                raise SystemExit(f"expected 8-bit truecolor, non-interlaced; got {depth=} {color=} {interlace=}")
        elif kind == b"IDAT":
            idat.append(chunk)
        elif kind == b"IEND":
            break
    raw = zlib.decompress(b"".join(idat))

    bpp, stride = 3, width * 3
    out = bytearray(height * stride)
    prev = bytearray(stride)
    src = 0
    for y in range(height):
        ftype = raw[src]
        src += 1
        line = bytearray(raw[src : src + stride])
        src += stride
        if ftype == 1:
            for x in range(bpp, stride):
                line[x] = (line[x] + line[x - bpp]) & 0xFF
        elif ftype == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 0xFF
        elif ftype == 3:
            for x in range(stride):
                left = line[x - bpp] if x >= bpp else 0
                line[x] = (line[x] + ((left + prev[x]) >> 1)) & 0xFF
        elif ftype == 4:
            for x in range(stride):
                a = line[x - bpp] if x >= bpp else 0
                b = prev[x]
                c = prev[x - bpp] if x >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 0xFF
        elif ftype != 0:
            raise SystemExit(f"unknown filter type {ftype} on row {y}")
        out[y * stride : (y + 1) * stride] = line
        prev = line
    return width, height, bytes(out)


def to_rgba(width, height, rgb):
    """黒に対するアンプリマルチプライ。返り値は (RGBA バイト列, 彩度の統計)。"""
    rgba = bytearray(width * height * 4)
    chromatic = 0  # max-min が 8 を超える(=無彩色と言い切れない)画素の数
    opaque = 0
    for i in range(width * height):
        r, g, b = rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]
        a = r if r >= g else g
        if b > a:
            a = b
        o = i * 4
        if a == 0:
            continue  # 完全な黒 = 完全な透明。バッファは 0 で初期化済み
        lo = r if r <= g else g
        if b < lo:
            lo = b
        if a - lo > 8:
            chromatic += 1
        opaque += 1
        rgba[o] = (r * 255 + a // 2) // a
        rgba[o + 1] = (g * 255 + a // 2) // a
        rgba[o + 2] = (b * 255 + a // 2) // a
        rgba[o + 3] = a
    return bytes(rgba), chromatic, opaque


def fill_interior(width, height, rgb, rgba):
    """卓の内部を FILL で塗りつぶし、不透明にする。

    プレイ画面の背景はサーキット基板のグリッド(`globals.css` の `.circuit-bg-grid`)。
    卓の内部が透明のままだと、そのグリッドが卓を突き抜けて見えてしまう。卓は面として
    読ませたいので、内部を不透明な一色で塗る。

    CSSで卓の裏に面を敷くのでは駄目で、画像側でやる必要がある。卓はスーパー楕円
    (角を強く丸めた長方形。y の 35%〜65% で幅が一定になり、真の楕円とは違う)で、
    `border-radius` では同じ形を作れない。縁からはみ出すか隙間が空く。画像から導けば
    形は定義上ぴったり一致する。

    内部の求め方は「画像の縁から塗り広げて、到達できなかった画素」。卓の輪郭線が
    閉じているので、これで内部だけが残る(しきい値 20/40/80 のどれでも漏れないことを
    実測で確認した)。輪郭線そのものも「到達できない」側に入るため、線の下にも FILL が
    敷かれる。線の外側のアンチエイリアスぶん(約2px)だけ塗りが広がるが、実機では
    卓は 247 CSS px 幅に縮むので 0.5px 未満、見えない。

    塗り方:

        out_rgb = 元の色 + FILL × (255 - a) / 255
        out_a   = 255

    アンプリマルチプライした色を FILL の上へ通常合成するのと同じ式になる
    (元の色 = 線の色 × a/255 なので、展開すると一致する)。
    検算: a=0 → FILL、a=255 → 白、a=128 の中間調 → 157(通常合成の 156.5 と丸め差のみ)。
    """
    out = bytearray(rgba)
    # 外側 = 画像の縁から4近傍でつながっている、壁より薄い画素。
    outside = bytearray(width * height)
    stack = []
    for x in range(width):
        for y in (0, height - 1):
            i = y * width + x
            if rgba[i * 4 + 3] <= WALL_ALPHA and not outside[i]:
                outside[i] = 1
                stack.append(i)
    for y in range(height):
        for x in (0, width - 1):
            i = y * width + x
            if rgba[i * 4 + 3] <= WALL_ALPHA and not outside[i]:
                outside[i] = 1
                stack.append(i)
    while stack:
        i = stack.pop()
        x = i % width
        y = i // width
        if x > 0:
            j = i - 1
            if not outside[j] and rgba[j * 4 + 3] <= WALL_ALPHA:
                outside[j] = 1
                stack.append(j)
        if x < width - 1:
            j = i + 1
            if not outside[j] and rgba[j * 4 + 3] <= WALL_ALPHA:
                outside[j] = 1
                stack.append(j)
        if y > 0:
            j = i - width
            if not outside[j] and rgba[j * 4 + 3] <= WALL_ALPHA:
                outside[j] = 1
                stack.append(j)
        if y < height - 1:
            j = i + width
            if not outside[j] and rgba[j * 4 + 3] <= WALL_ALPHA:
                outside[j] = 1
                stack.append(j)

    fr, fg, fb = FILL
    filled = 0
    for i in range(width * height):
        if outside[i]:
            continue
        filled += 1
        a = rgba[i * 4 + 3]
        inv = 255 - a
        o = i * 4
        # rgb[] は元の画素(= 線の色 × a/255 そのもの)。ここに FILL の残りを足す。
        out[o] = min(255, rgb[i * 3] + (fr * inv + 127) // 255)
        out[o + 1] = min(255, rgb[i * 3 + 1] + (fg * inv + 127) // 255)
        out[o + 2] = min(255, rgb[i * 3 + 2] + (fb * inv + 127) // 255)
        out[o + 3] = 255
    return bytes(out), filled


def write_png_rgba(path, width, height, rgba):
    stride = width * 4
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter: None。透明部分が長いゼロ列になるので、これが一番縮む
        raw += rgba[y * stride : (y + 1) * stride]

    def chunk(kind, payload):
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload))

    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def verify(width, height, rgba):
    """塗りつぶしが漏れていないかを、書き出す前に確かめる。

    flood fill が輪郭線の隙間から外へ漏れると、キャンバス全体が塗りつぶされてしまう。
    見た目では「なんとなく大きい四角」になるだけで気づきにくいので、機械で確かめる。
    """
    def alpha(x, y):
        return rgba[(y * width + x) * 4 + 3]

    corners = [alpha(0, 0), alpha(width - 1, 0), alpha(0, height - 1), alpha(width - 1, height - 1)]
    if any(corners):
        raise SystemExit(f"四隅が透明でない {corners} ── 塗りが画像の外まで漏れている")

    # 元画像には、目には見えないがアルファ 1〜3 の微細なノイズが全面に散っている。
    # 「アルファが 0 でない」で外接矩形を採るとキャンバス全体になってしまい、漏れを
    # 検出できない。実際に面として見えている画素だけを数える。
    solid = 128
    xs, ys = [], []
    opaque = 0
    for y in range(height):
        row = rgba[y * width * 4 : (y + 1) * width * 4]
        found = False
        for x in range(width):
            if row[x * 4 + 3] >= solid:
                opaque += 1
                if not found:
                    xs.append(x)
                    ys.append(y)
                    found = True
                last = x
        if found:
            xs.append(last)
    if not xs:
        raise SystemExit("不透明な画素が1つも無い ── 塗りつぶしが効いていない")
    return (min(xs), max(xs), min(ys), max(ys)), opaque


def main():
    width, height, rgb = read_png_rgb(SRC)
    rgba, chromatic, opaque = to_rgba(width, height, rgb)
    rgba, filled = fill_interior(width, height, rgb, rgba)
    box, opaque_after = verify(width, height, rgba)
    write_png_rgba(DST, width, height, rgba)
    total = width * height
    cx, cy = width // 2, height // 2
    center = tuple(rgba[(cy * width + cx) * 4 + k] for k in range(4))
    print(f"{SRC.name} {width}x{height} -> {DST.name}")
    print(f"  線の画素(塗る前): {opaque:,} / {total:,} ({opaque / total * 100:.1f}%)")
    print(f"  有彩色の画素: {chromatic:,} ({chromatic / total * 100:.3f}%) ← 0 に近いほど screen 合成と厳密に一致する")
    print(f"  塗りつぶした卓の内部: {filled:,} ({filled / total * 100:.1f}%)  色 #{FILL[0]:02x}{FILL[1]:02x}{FILL[2]:02x}")
    print(f"  不透明な画素(塗った後): {opaque_after:,} ({opaque_after / total * 100:.1f}%)")
    print(f"  卓の外接矩形: x {box[0]}..{box[1]}  y {box[2]}..{box[3]}  ← 元画像の輪郭 x 9..1012 / y 14..1519 と一致すること")
    print(f"  中心の画素: RGBA{center}  ← アルファ 255 / 色が FILL なら成功")
    print(f"  ファイルサイズ: {SRC.stat().st_size:,} -> {DST.stat().st_size:,} bytes")


if __name__ == "__main__":
    sys.exit(main())
