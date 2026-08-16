#!/bin/sh
# 產生 nginx `resolver` 設定（2026-08-16 staging 全站 /api timeout 事故防復發）。
#
# 為什麼需要：default.conf 的 proxy_pass 改用變數形式讓 nginx 逐請求重新解析
# 後端 DNS（後端 redeploy 會換 IP），而變數形式的解析不走 libc、必須顯式指定
# `resolver`。cluster DNS 的 IP 每個環境不同（Zeabur/K8s/本機 Docker），不能寫死
# ——開機時從 /etc/resolv.conf 抄第一個 nameserver。
#
# 放在 /docker-entrypoint.d/（nginx 官方 image 會依檔名序執行），必須早於
# 20-envsubst-on-templates.sh 之後的 nginx 啟動；輸出到 conf.d 的 05- 前綴檔，
# 位於 00-tenant-brand.conf 之後、default.conf 之前（http context 內順序不影響
# 語意，前綴只求可預期）。
#
# valid=30s：解析結果快取 30 秒，後端換 IP 最多 30 秒內收斂（實測 Zeabur 後端
# rolling 重啟本來就 >30s，不會造成可感知的中斷窗口）。
set -eu

ns="$(awk '/^nameserver/ { print $2; exit }' /etc/resolv.conf 2>/dev/null || true)"
if [ -z "${ns}" ]; then
    # resolv.conf 缺失時退回 Docker 內建 DNS；沒有 resolver 的變數 proxy_pass
    # 會在第一個請求就 502「no resolver defined」，寧可帶著 fallback 啟動。
    echo "[15-resolver] /etc/resolv.conf 讀不到 nameserver，退回 127.0.0.11" >&2
    ns="127.0.0.11"
fi

echo "resolver ${ns} valid=30s ipv6=off;" > /etc/nginx/conf.d/05-resolver.conf
echo "[15-resolver] resolver=${ns} (valid=30s)" >&2
