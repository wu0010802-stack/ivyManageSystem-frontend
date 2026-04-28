#!/bin/sh
# 從容器 /etc/resolv.conf 抓 nameserver IP，sed 替換 nginx conf 的 placeholder。
# 在 nginx 啟動前跑（檔名 25 排在 20-envsubst 之後、nginx 啟動之前）。
# 設計目的：Zeabur k3s 環境的 cluster DNS IP 不固定，不能寫死；
#         也不能依賴 nginx:alpine 的 NGINX_LOCAL_RESOLVERS（envsubst filter 在
#         此環境中沒成功傳遞此變數，導致 nginx config 留下字面 ${...}）。
set -e
RESOLVER=$(awk '/^nameserver/ {print $2; exit}' /etc/resolv.conf 2>/dev/null || true)
if [ -z "$RESOLVER" ]; then
    echo "[25-fix-resolver] WARN: /etc/resolv.conf 沒 nameserver，fallback 到 8.8.8.8" >&2
    RESOLVER="8.8.8.8"
fi
echo "[25-fix-resolver] 設定 nginx resolver 為: $RESOLVER"
sed -i "s|__RESOLVER_IP__|$RESOLVER|g" /etc/nginx/conf.d/default.conf
