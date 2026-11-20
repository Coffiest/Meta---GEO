# Poker ART のウィジェットと Apple Watch(GTO プリフロップのレンジ)

自分の iPhone / Apple Watch 用(App Store 用ではない)。データは同梱(通信しない)。色は GTO タブと同じ(フォールド 青 / コール 緑 / レイズ 赤 / オールイン 濃い赤)。

## できること

- トーナメント(100/60/40/30/20/12bb)とキャッシュ(100bb)
- オープン(UTG〜SB)と、相手のオープンへの対応(例: BTN のオープンに対する BB)
- iPhone のウィジェット(iOS 17 以上)
  - 小・中: 長押し →「ウィジェットを編集」で場面を選ぶ
  - 大: ウィジェットの上のボタンで「MTT / Cash・スタック・vs(誰のオープンか)・me(自分の席)」を切り替える(アプリは開かない)
  - 特大: iPad だけ(iPhone には特大の大きさが無い。Apple の仕様)
  - 押すとアプリの GTO タブがその場面で開く(`pokerart://geo?tab=gto&mode=mtt&stack=100&pa=…`)
- Apple Watch のアプリ(watchOS 10 以上): 表と、その下の選択(Digital Crown でスクロール)。最後に見た場面を覚える

## ファイル

| ファイル | 入れるターゲット |
|---|---|
| `RangeCore.swift`(データと表の描画) | `PokerARTWidget` と `PokerARTWatch` の両方 |
| `PokerARTRanges.json`(約400KB) | `PokerARTWidget` と `PokerARTWatch` の両方 |
| `PokerARTRangeWidget.swift`(iPhone のウィジェット) | `PokerARTWidget` だけ |
| `PokerARTWatchApp.swift`(Watch のアプリ) | `PokerARTWatch` だけ |

データを作り直すとき: リポジトリの一番上で `python3 scripts/widget-ranges.py`。

## Xcode での手順(`~/Documents/その他/ポーカー部/Poker ART/Poker ART.xcodeproj`)

1. ウィジェット拡張 `PokerARTWidget`(最低 iOS 17)に、上の表のとおりファイルを入れる(古い `PokerARTRangeWidget.swift` と `PokerARTRanges.json` は差し替え)。
2. File → New → Target… → watchOS → **App** → 名前 `PokerARTWatch`、「Watch App for Existing iOS App」で `Poker ART` を選ぶ。最低 watchOS 10。
   自動で作られた `PokerARTWatchApp.swift`・`ContentView.swift` のひな形は消し、上の表のとおりファイルを入れる。
3. アプリの URL Types に `pokerart`(済みなら不要)。ContentView.swift は pokerart:// を同じパスの https に直して開く(済みなら不要)。
4. iPhone をつないでアプリを実行。Watch のアプリは iPhone のアプリと一緒に入る(Watch の「マイウォッチ」→ Poker ART →「Apple Watch に表示」がオフならオンに)。
