"""
プレイヤーのアイコン(動物の絵10枚)を書き出す。

オーナー支給の原画 apps/web/public/avatars/source/<name>.png(512px・地は透明)は加工せず残し、
アイコン用に 256px へ縮小して apps/web/public/avatars/animal_<name>_v1.png に書き出す。
丸の中に置く余白と地の色は画面側(components/Avatar.tsx の ANIMAL_AVATARS)で付ける。
原画を差し替えたらこのスクリプトを再実行し、意味が変わったら出力名の _v1 を上げる。
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "apps/web/public/avatars"
NAMES = ["sheep", "shark", "pig", "penguin", "parrot", "mouse", "lion", "flamingo", "fish", "cat"]

for name in NAMES:
    img = Image.open(ROOT / "source" / f"{name}.png").convert("RGBA")
    img.resize((256, 256), Image.LANCZOS).save(ROOT / f"animal_{name}_v1.png", optimize=True)
    print(name, img.size)
