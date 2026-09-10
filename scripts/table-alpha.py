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
DST = ROOT / "apps/web/public/table/table_v3_alpha.png"


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


def main():
    width, height, rgb = read_png_rgb(SRC)
    rgba, chromatic, opaque = to_rgba(width, height, rgb)
    write_png_rgba(DST, width, height, rgba)
    total = width * height
    print(f"{SRC.name} {width}x{height} -> {DST.name}")
    print(f"  不透明な画素: {opaque:,} / {total:,} ({opaque / total * 100:.1f}%)")
    print(f"  有彩色の画素: {chromatic:,} ({chromatic / total * 100:.3f}%) ← 0 に近いほど screen 合成と厳密に一致する")
    print(f"  ファイルサイズ: {SRC.stat().st_size:,} -> {DST.stat().st_size:,} bytes")


if __name__ == "__main__":
    sys.exit(main())
