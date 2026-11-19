# Poker ART のウィジェット(GTO オープンレンジ)

ホーム画面・スマートスタックに GTO のオープンレンジ(13×13)を出す iOS ウィジェット。自分の iPhone 用(App Store 用ではない)。

- 小: 色だけの表 / 大: 手の名前つきの表
- 大サイズは、ウィジェットの上のボタンでポジション(UTG〜SB)とスタック(100〜12bb)を直接切り替えられる(アプリは開かない。iOS 17 の押せるウィジェット)
- 小サイズは、長押し →「ウィジェットを編集」で選ぶ(上のボタンで選んだ値があればそちらが優先)
- 押すと、アプリの GTO タブがその場面で開く(`pokerart://geo?tab=gto&stack=20&pa=F-F-F-F-F`)
- 表のデータはウィジェットに同梱(通信しない)。色は GTO タブと同じ(レイズ 赤 / オールイン 濃い赤 / フォールド 青)
- iOS 17 以上

## 入っているもの

| ファイル | 中身 |
|---|---|
| `PokerARTRangeWidget.swift` | ウィジェット本体(設定・表の描画・リンク) |
| `PokerARTRanges.json` | 6 スタック × 7 ポジションのオープンレンジ(約35KB) |

データを作り直すとき(GTO の表が増えた・直ったとき): リポジトリの一番上で `python3 scripts/widget-ranges.py`。

## Xcode での手順(前に作った Poker ART の iOS プロジェクトに足す)

1. Xcode でプロジェクトを開き、File → New → Target… → **Widget Extension**。
   名前は `PokerARTWidget`。「Include Configuration App Intent」と「Include Live Activity」は**外す**。「Activate」を聞かれたら Activate。
2. 自動で作られた `PokerARTWidget.swift` / `PokerARTWidgetBundle.swift` などのひな形を削除する(`@main` が2つになるとビルドが通らない)。
3. このフォルダの `PokerARTRangeWidget.swift` と `PokerARTRanges.json` を、Xcode の `PokerARTWidget` フォルダへドラッグ。
   「Copy items if needed」に印、Target は **`PokerARTWidget` だけ**に印。
4. `PokerARTWidget` ターゲット → General → Minimum Deployments を **iOS 17.0** 以上に。
5. Signing & Capabilities で、ウィジェットのターゲットにもアプリと同じ Team を選ぶ。
6. 押したときにアプリで開くように、アプリ本体のターゲット → Info → **URL Types** に `+`、URL Schemes に `pokerart` を入れる。
7. アプリ側で `pokerart://…` を受けて、同じパスの Web ページを開く(下のどちらか。作り方に合わせる)。
8. iPhone をつないで、アプリのスキームでビルド・実行 → ホーム画面を長押し → 左上の「+」→「Poker ART」→ 大きさを選んで追加。スマートスタックにするなら、ほかのウィジェットの上に重ねる。

### 7. リンクを受ける(Capacitor の場合)

`@capacitor/app` を入れて、Web 側のどこか(起動時に1回)で:

```ts
import { App } from "@capacitor/app";
App.addListener("appUrlOpen", ({ url }) => {
  const u = new URL(url); // pokerart://geo?tab=gto&...
  window.location.href = `/${u.host}${u.pathname}${u.search}`;
});
```

### 7. リンクを受ける(SwiftUI で WKWebView を包んでいる場合)

WebView を持っている View に:

```swift
.onOpenURL { url in
    guard url.scheme == "pokerart",
          var c = URLComponents(string: "https://meta-geo-poker.vercel.app") else { return }
    c.path = "/" + (url.host ?? "") + url.path
    c.query = url.query
    if let target = c.url { webView.load(URLRequest(url: target)) }
}
```

## 注意

- 無料の Apple ID で入れた場合、7日ごとに Xcode から入れ直しが必要(有料の開発者登録なら1年)。
- アプリ側の `/geo?tab=gto&stack=…&pa=…` は v1.39.2 で入れた(Web なので、アプリの入れ直しなしで効く)。
