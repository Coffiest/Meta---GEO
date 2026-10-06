#!/usr/bin/env bash
# 誰かが対局中の間、サーバーの入れ替えを待つ。
#
# 使い方: wait-for-quiet.sh <最大何分待つか>
#
# ## なぜ要るのか
#
# 進行中の卓はサーバーのメモリにしか無い。入れ替えると全員の卓が消えて、画面に
# 「進行中の卓が見つかりません」(NO_SESSION)と出る。サーバーの /health が返す
# `playing`(いま対局中の人数)が0になるのを待ってから入れ替える。
#
# ## 待ち切れないとき
#
# 上限まで待っても誰かが遊んでいたら、警告を出して**進める**。ここで止まり続けると、
# 長時間遊ぶ人が1人いるだけでサーバーの修正がいつまでも本番に届かなくなる(障害の修正も含む)。
# 急ぐ修正は、手動実行(Actions → Deploy → Run workflow)の `force` で待たずに進められる。
#
# ## 待たずに進める場合
#
# - 状態が取れない: サーバーが落ちているなら、待っても誰も遊んでいない
# - `playing` を返さない: この仕組みが入る前の古いサーバー。人数を知る手段が無い

set -u

MAX_MIN="${1:-20}"
HEALTH_URL="${HEALTH_URL:-https://meta---geo.fly.dev/health}"
POLL_SEC="${POLL_SEC:-30}"

if [ "${FORCE:-}" = "true" ]; then
  echo "手動実行で強制: 対局中でも待たずに進める"
  exit 0
fi

# MAX_WAIT_SEC は秒で指定したいとき(テスト用)。通常は分で渡す。
deadline=$(($(date +%s) + ${MAX_WAIT_SEC:-$((MAX_MIN * 60))}))

while :; do
  body=$(curl -sf --max-time 10 "$HEALTH_URL") || {
    echo "サーバーの状態を取得できない: 待たずに進める"
    exit 0
  }
  playing=$(printf '%s' "$body" | sed -n 's/.*"playing":\([0-9][0-9]*\).*/\1/p')
  if [ -z "$playing" ]; then
    echo "サーバーが対局中の人数を返さない(旧版): 待たずに進める"
    exit 0
  fi
  if [ "$playing" -eq 0 ]; then
    echo "対局中の人はいない: 進める"
    exit 0
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "::warning::${MAX_MIN}分待っても ${playing} 人が対局中。待ち切れないので進める(その人たちの卓は消える)"
    exit 0
  fi
  echo "対局中 ${playing} 人。${POLL_SEC}秒後に再確認する"
  sleep "$POLL_SEC"
done
