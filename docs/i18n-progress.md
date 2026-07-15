# 多言語対応(ja/en/ko/zh)進捗

基盤: `lib/i18n.tsx`(LocaleProvider/useI18n/t、localStorage保存、ブラウザ言語自動判定、<html lang>同期)、
`LanguageSwitcher`(ログイン画面ヘッダー+ホーム設定メニューに常設。いつでも切替可)。`layout.tsx`にProvider配線済み。

## 翻訳済み画面
- ホーム挨拶(HomeGreeting)・プレイボタン(PlayButton): 挨拶/タグライン/バイイン/プレイ
- ログイン(LoginScreen)
- オンボーディング(Onboarding)
- 言語切替UI(LanguageSwitcher)
- プレイ中アクションバー(ActionBar): タイムバンク/離席/x-f予約/オールイン・ジオメトリック プリセット/残0
- 座席(Seat): チャットaria/離席中

## 未翻訳(以降のサイクルで順次)
- Lobby(home/stats/history/leaderboard各タブ・ハンバーガーメニュー・空状態・数値ラベル)
- app/page.tsx(設定ポップオーバー/チャット/マッチング待機/離脱確認)
- GeoComingSoon(プロモ全文)
- PokerTable / lib/handRank.ts(役名)/ TournamentResultScreen
- RRRatingCard / PlayerDetailModal / BlindStructureSheet / ChatLogSheet / GameHandHistorySheet / HomeGreeting / Header / PlayButton / EmptyState
- app/geo/page.tsx と geo/*(GEO DATABASE UI)
- app/review/* / pricing / legal/tokushoho
- lib/useAuth.ts 等のユーザー向けエラー文言
