#!/usr/bin/env bash
# dev サーバーをクリーンに起動する。
# 使い方: npm run dev:clean
set -euo pipefail

PORT=3000
LOG=/tmp/nextjs-dev.log
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== dev:clean ==="

# 1. ポート 3000 の既存プロセスを停止（通常 kill → 残存なら kill -9）
PIDS=$(lsof -ti :"$PORT" 2>/dev/null || true)
if [ -n "$PIDS" ]; then
  echo "Stopping existing process(es) on port $PORT: $PIDS"
  echo "$PIDS" | xargs kill 2>/dev/null || true
  sleep 1
  # まだ残っていれば強制終了
  PIDS=$(lsof -ti :"$PORT" 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "Force killing: $PIDS"
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
else
  echo "Port $PORT is free."
fi

# 2. nvm が使えれば .nvmrc のバージョンを使用
export NVM_DIR="$HOME/.nvm"
# npm_config_prefix は nvm と競合するため一時的に解除する
unset npm_config_prefix
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
if command -v nvm &>/dev/null && [ -f "$PROJECT_DIR/.nvmrc" ]; then
  nvm use --silent
  echo "Node: $(node --version)"
fi

# 3. ログをクリアして起動（.next は削除しない）
> "$LOG"
cd "$PROJECT_DIR"
nohup npm run dev -- -p "$PORT" > "$LOG" 2>&1 &
DEV_PID=$!
echo "Started PID: $DEV_PID"

# 4. Ready をポーリング（最大 60 秒：.next なし初回は時間がかかる場合あり）
echo -n "Waiting for ready"
for i in $(seq 1 60); do
  sleep 1
  if grep -q "Ready" "$LOG" 2>/dev/null; then
    echo " (${i}s)"
    break
  fi
  echo -n "."
  if [ "$i" -eq 60 ]; then
    echo ""
    echo "ERROR: server did not start within 60s."
    echo "--- log tail ---"
    tail -20 "$LOG"
    exit 1
  fi
done

# 5. HTTP 200 確認（Ready 直後は少し待つ）
sleep 1
echo -n "Checking HTTP status... "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 60 "http://localhost:${PORT}") || true
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "307" ] || [ "$HTTP_CODE" = "302" ]; then
  echo "HTTP $HTTP_CODE OK"
  echo "=== Ready: http://localhost:${PORT} ==="
else
  echo "HTTP $HTTP_CODE (unexpected)"
  echo "--- log tail ---"
  tail -20 "$LOG"
  exit 1
fi
