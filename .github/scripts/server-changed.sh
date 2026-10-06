#!/usr/bin/env bash
# 「今回のデプロイでサーバー(Fly.io)を入れ替える必要があるか」を決めて、
# `server=true|false` を $GITHUB_OUTPUT へ書く。
#
# ## なぜ要るのか
#
# 進行中の卓はサーバーのメモリにしか無い。サーバーを再起動すると全員の卓が消え、画面には
# 「進行中の卓が見つかりません」(NO_SESSION)と出る。以前は main への push のたびに無条件で
# サーバーを入れ替えていたので、見た目だけの変更でも、遊んでいる人の卓を消していた。
#
# ## 何と比べるのか
#
# 「前回のpushとの差分」ではなく、**いま実際に動いているサーバーの版(/health の sha)との差分**で
# 決める。前回のpushとの差分だと、連続して push されて途中の実行が取り消されたとき、取り消された
# 実行に含まれていたサーバーの変更が、永久に反映されなくなる。
#
# ## 迷ったら入れ替える
#
# 判定に必要な材料が取れないとき(サーバーが応答しない・版を返さない・履歴に無い・差分が取れない)は
# 必ず true にする。「入れ替えない」に倒すと、サーバーの変更が黙って本番に届かなくなる。
# (遊んでいる人の卓を消すリスクは、別のスクリプト wait-for-quiet.sh が受け持つ。)

set -u

OUT="${GITHUB_OUTPUT:-/dev/stdout}"
HEALTH_URL="${HEALTH_URL:-https://meta---geo.fly.dev/health}"

# サーバーのイメージに入るもの。Dockerfile はリポジトリ全体をコピーして `pnpm install` するので、
# 実際に効くのは packages/ と、依存を決めるルートのファイル。apps/web はサーバーから参照されない。
SERVER_PATHS='^(packages/|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|package\.json$|tsconfig\.base\.json$|\.npmrc$)'

decide() {
  echo "server=$1" >>"$OUT"
  echo "判定: server=$1 ($2)"
  exit 0
}

if [ "${FORCE:-}" = "true" ]; then
  decide true "手動実行で強制"
fi

body=$(curl -sf --max-time 15 "$HEALTH_URL") || decide true "サーバーの状態を取得できない"

sha=$(printf '%s' "$body" | sed -n 's/.*"sha":"\([0-9a-f]\{40\}\)".*/\1/p')
[ -n "$sha" ] || decide true "動いているサーバーが版を返さない(この仕組みの初回)"

git cat-file -e "${sha}^{commit}" 2>/dev/null || decide true "動いているサーバーの版がこの履歴に無い"

files=$(git diff --name-only "$sha" HEAD 2>/dev/null) || decide true "差分を取れない"

if printf '%s\n' "$files" | grep -Eq "$SERVER_PATHS"; then
  decide true "サーバーに関わる変更がある(動いている版 ${sha:0:7} 以降)"
fi

decide false "サーバーに関わる変更が無い(動いている版 ${sha:0:7} 以降)"
