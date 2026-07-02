# カードデザインの差し込み方法

このフォルダに画像ファイルを置くだけで、アプリのカード表示が自動的にその画像に切り替わります。
コードの変更は一切不要です(`PlayingCard` コンポーネントが `img` の読み込み失敗を検知し、
画像が無ければ現行のCSS描画に自動でフォールバックする仕組みになっています)。

## 命名規則

`{ランク}{スート}.png` の形式で、このフォルダ直下に置いてください。

- ランク: `2` `3` `4` `5` `6` `7` `8` `9` `10` `J` `Q` `K` `A`
- スート: `s`(スペード) `h`(ハート) `d`(ダイヤ) `c`(クラブ)

例: エースのスペード → `As.png`、ハートの10 → `10h.png`、キングのダイヤ → `Kd.png`

裏面(伏せカード)は `back.png` という1ファイルです。

## 必要なファイル一覧(全53枚)

```
2s.png 2h.png 2d.png 2c.png
3s.png 3h.png 3d.png 3c.png
4s.png 4h.png 4d.png 4c.png
5s.png 5h.png 5d.png 5c.png
6s.png 6h.png 6d.png 6c.png
7s.png 7h.png 7d.png 7c.png
8s.png 8h.png 8d.png 8c.png
9s.png 9h.png 9d.png 9c.png
10s.png 10h.png 10d.png 10c.png
Js.png Jh.png Jd.png Jc.png
Qs.png Qh.png Qd.png Qc.png
Ks.png Kh.png Kd.png Kc.png
As.png Ah.png Ad.png Ac.png
back.png
```

## 推奨仕様

- 形式: PNG(透過背景推奨)
- 縦横比: 概ね 5:7(トランプの標準比率)。`object-contain` で表示するので多少の差異は自動調整されます
- 解像度: 表示サイズは最大 80×112px 程度(スマホの2倍密度を考慮すると 200×280px 程度あれば十分)

一部のファイルだけ置くことも可能です。存在しないファイルはCSS描画にフォールバックするため、
段階的に差し替えても崩れません。
