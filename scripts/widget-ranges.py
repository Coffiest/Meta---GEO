"""
iOS ウィジェット(ios-widget/)に入れるオープンレンジのデータを書き出す。

元: apps/web/public/trainer/<stack>.json(GTO タブ・特訓と同じ計算済みの解)。
出力: ios-widget/PokerARTRanges.json
  { "stacks": [100, ...], "positions": ["UTG", ...],
    "ranges": { "<stack>": { "<pos>": { "raise": [169 の 0-100], "allIn": [...], "raiseSize": "2.1" } } } }
手の並びは GTO タブの表と同じ 13×13(行 = 上の札、AA が左上、右上がスーテッド)。
データを差し替えたら、このスクリプトをもう一度走らせる。
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "apps/web/public/trainer"
OUT = ROOT / "ios-widget/PokerARTRanges.json"
STACKS = [100, 60, 40, 30, 20, 12]
POSITIONS = ["UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB"]

ranges = {}
for st in STACKS:
    nodes = json.loads((SRC / f"{st}.json").read_text())["nodes"]
    ranges[str(st)] = {}
    for i, pos in enumerate(POSITIONS):
        node = nodes.get("-".join(["F"] * i))
        if not node or node["actor"] != pos:
            continue
        raise_ = [0] * 169
        allin = [0] * 169
        size = ""
        for a in node["a"]:
            c = a["c"]
            if c == "RAI":
                allin = [round(x * 100) for x in a["s"]]
            elif c.startswith("R"):
                raise_ = [min(100, r + round(x * 100)) for r, x in zip(raise_, a["s"])]
                size = c[1:]
        ranges[str(st)][pos] = {"raise": raise_, "allIn": allin, "raiseSize": size}

OUT.write_text(json.dumps({"stacks": STACKS, "positions": POSITIONS, "ranges": ranges}, separators=(",", ":")))
print(OUT, OUT.stat().st_size, "bytes")
