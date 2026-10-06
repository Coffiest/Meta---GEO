# オーナーの To-Do

オーナーが自分で行う作業(コードではできないもの)の控え。終わったら行ごと消す。

- [ ] **GitHub のリポジトリを非公開にする**(2026-10-06 追加。「いつかやる」)
  - GitHub → このリポジトリ → Settings → General → 一番下の Danger Zone → Change repository visibility → Private。
  - Vercel・Fly.io のデプロイは非公開でもそのまま動く。
  - 注意: 無料プランでは非公開リポジトリの GitHub Actions は月 2,000 分まで。今の CI は1回 約15分なので、月 約60回のマージで上限に当たり、CI とデプロイが止まる。超えそうなら GitHub Pro にする。
