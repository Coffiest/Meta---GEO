"""
iOS / Apple Watch のウィジェット(ios-widget/)に入れるプリフロップのレンジを書き出す。

元: apps/web/public/trainer/<stack>.json(トーナメント)と trainer-cash/<stack>.json(キャッシュ)。
    GTO タブ・特訓と同じ計算済みの解。
出力: ios-widget/PokerARTRanges.json
  { "positions": [...8席...],
    "modes": { "mtt": { "stacks": [...], "spots": { "<stack>": { "<opener>|<hero>": {...} } } }, "cash": {...} } }
  spot のキー: opener が "" ならオープン(RFI)、"BTN|BB" なら BTN のオープンに対する BB の対応。
  spot の中身: { "actions": [ { "c": "F"|"C"|"X"|"R2.5"|"RAI", "s": [169 の 0-100] } ] }
手の並びは GTO タブの表と同じ 13×13(行 = 上の札、AA が左上、右上がスーテッド)。
データを差し替えたら、このスクリプトをもう一度走らせる。
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "ios-widget/PokerARTRanges.json"
POS = ["UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB", "BB"]
MODES = {"mtt": ROOT / "apps/web/public/trainer", "cash": ROOT / "apps/web/public/trainer-cash"}


def pack(node):
    return {"actions": [{"c": a["c"], "s": [round(x * 100) for x in a["s"]]} for a in node["a"]]}


out = {"positions": POS, "modes": {}}
for mode, src in MODES.items():
    stacks = sorted((int(p.stem) for p in src.glob("*.json") if p.stem.isdigit()), reverse=True)
    spots_by_stack = {}
    for st in stacks:
        nodes = json.loads((src / f"{st}.json").read_text())["nodes"]
        spots = {}
        for i, opener in enumerate(POS[:-1]):
            pa = "-".join(["F"] * i)
            node = nodes.get(pa)
            if not node or node["actor"] != opener:
                continue
            spots[f"|{opener}"] = pack(node)  # オープン
            # この席の通常のオープン(オールインでない一番小さいレイズ)に対する、後ろの各席の対応。
            raises = [a["c"] for a in node["a"] if a["c"].startswith("R") and a["c"] != "RAI"]
            if not raises:
                continue
            seq = (pa + "-" if pa else "") + raises[0]
            for j in range(i + 1, len(POS)):
                hero = POS[j]
                p2 = seq + "".join(["-F"] * (j - i - 1))
                n2 = nodes.get(p2)
                if n2 and n2["actor"] == hero:
                    spots[f"{opener}|{hero}"] = pack(n2)
        spots_by_stack[str(st)] = spots
    out["modes"][mode] = {"stacks": stacks, "spots": spots_by_stack}

OUT.write_text(json.dumps(out, separators=(",", ":")))
print(OUT, OUT.stat().st_size, "bytes")
for m, v in out["modes"].items():
    print(m, {k: len(s) for k, s in v["spots"].items()})
