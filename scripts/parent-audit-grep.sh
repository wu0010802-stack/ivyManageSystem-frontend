#!/usr/bin/env bash
# 家長端視覺一致性防回歸 grep
#
# 失敗條件：
# 1. parent/ 內出現 #3f7d48 綠 fallback（僅 globals.css 註解放行）
# 2. parent/ 內主按鈕 background: var(--pt-info-link)（連結 color 用法保留）
# 3. parent/ views / components 內出現 background: #xxxxxx 或 color: #xxxxxx 直寫 hex
#    （rgba 內、box-shadow 內、註解內放行）

set -e

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

FAIL=0

# 1. 綠 fallback
GREEN=$(git grep -nE '#3f7d48' -- 'src/parent/' ':!src/parent/styles/globals.css' || true)
if [ -n "$GREEN" ]; then
  echo "❌ 找到 #3f7d48 綠 fallback 殘骸："
  echo "$GREEN"
  FAIL=1
fi

# 2. info-link 主按鈕
INFO_BTN=$(git grep -nE 'background:[^;]*var\(--pt-info-link' src/parent/ || true)
if [ -n "$INFO_BTN" ]; then
  echo "❌ 找到主按鈕誤用 --pt-info-link（連結 color 用法不會被 grep 抓到）："
  echo "$INFO_BTN"
  FAIL=1
fi

# 3. 直寫 hex 在 background / color / border-color
DIRECT_HEX=$(git grep -nP '(background|color|border-color):\s*#[0-9a-fA-F]{3,8}\b' src/parent/views/ src/parent/components/ \
  | grep -vE '/\*|//|rgba\(' \
  || true)
if [ -n "$DIRECT_HEX" ]; then
  echo "❌ 找到直寫 hex（應改用 design tokens）："
  echo "$DIRECT_HEX"
  FAIL=1
fi

if [ $FAIL -eq 1 ]; then
  echo ""
  echo "請參考 docs/superpowers/specs/2026-05-06-parent-portal-consistency-design.md §3"
  exit 1
fi

echo "✅ parent audit grep 通過"
