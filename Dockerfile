# syntax=docker/dockerfile:1.6

# ---------- Build stage ----------
FROM node:24-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Zeabur 只在 Git service 的 build phase 提供此值。不得設預設值或改用
# VITE_SENTRY_RELEASE：沒有可驗證的完整 commit SHA 時，Docker build 必須失敗。
ARG ZEABUR_GIT_COMMIT_SHA

# VITE_* 變數會被烤進 bundle，必須在 build 階段提供
ARG VITE_API_BASE_URL=/api
ARG VITE_GOOGLE_MAPS_API_KEY=
# 不給預設值：LIFF ID 綁定 LINE console 的 endpoint 網域，各環境必須在
# 儀表板顯式設定；硬編 prod ID 曾讓沒設變數的 staging 默默把 LIFF 流程
# 轉去 prod endpoint（環境互串）。缺值時家長端 LINE 登入會明確報
# 「VITE_LIFF_ID 未設定」（src/parent/services/liff.ts），fail-fast 優於誤連。
# ⚠ 多租戶（4d/fb）後這兩個變數已降為**過渡期 fallback**：LIFF ID 與加好友連結
# 改由 `GET /api/public/tenant-meta` 依 Host 回傳（line_configs / system_configs）。
# 階段 3（Sentry 觀察到 fallback 命中為零一個 release 後）連同 ENV 與
# src/parent/services/liff.ts 的 fallback 分支一起刪除。
# 特別注意 VITE_LINE_BOT_FRIEND_URL 的預設值是 default tenant 的 OA——
# 多租戶下把它烤進 bundle 必然錯（B 校家長加到 A 校的 OA），故新租戶上線前必須
# 確認 tenant-meta 有回 line_bot_friend_url。
ARG VITE_LIFF_ID=
ARG VITE_LINE_BOT_FRIEND_URL=https://line.me/R/ti/p/@116fakhu
# 多租戶識別（fc `resolveTenant()` 的 build-time 設定）。必須宣告為 ARG，否則
# Zeabur 儀表板設了也穿不進 vite build（Docker --build-arg 對未宣告的 ARG 無效）。
# 兩者皆空 = 單租戶模式，全前端行為與改造前逐字相同（灰度不變式 DEV-05）。
ARG VITE_TENANT_BASE_DOMAIN=
ARG VITE_TENANT_DOMAIN_MAP=
# 品牌 API 灰度開關（空 = 跟隨 isTenantModeEnabled()；1 = 強制開；0 = kill switch）
ARG VITE_TENANT_META_ENABLED=
# Sentry 錯誤監控：DSN 為唯一啟用開關（空值 → utils/sentry.ts no-op，SDK 不下載）。
# 必須宣告為 build ARG，否則 Zeabur 儀表板即使設了 VITE_SENTRY_DSN 也無法穿透
# 進 vite build（Docker --build-arg 對未宣告的 ARG 名稱無效），prod 錯誤監控形同虛設。
ARG VITE_SENTRY_DSN=
ARG VITE_SENTRY_ENVIRONMENT=
ARG VITE_SENTRY_RELEASE=
ARG VITE_SENTRY_TRACES_SAMPLE_RATE=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY \
    VITE_LIFF_ID=$VITE_LIFF_ID \
    VITE_LINE_BOT_FRIEND_URL=$VITE_LINE_BOT_FRIEND_URL \
    VITE_TENANT_BASE_DOMAIN=$VITE_TENANT_BASE_DOMAIN \
    VITE_TENANT_DOMAIN_MAP=$VITE_TENANT_DOMAIN_MAP \
    VITE_TENANT_META_ENABLED=$VITE_TENANT_META_ENABLED \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_SENTRY_ENVIRONMENT=$VITE_SENTRY_ENVIRONMENT \
    VITE_SENTRY_RELEASE=$VITE_SENTRY_RELEASE \
    VITE_SENTRY_TRACES_SAMPLE_RATE=$VITE_SENTRY_TRACES_SAMPLE_RATE

# Sentry source map 上傳（可選）：vite.config.js 的 sentryVitePlugin 需
# SENTRY_UPLOAD_TRUSTED=true + AUTH_TOKEN/ORG/PROJECT 三者齊備才實際 upload；
# 預設空/false → disable，不上傳也不會壞 build。宣告於此讓 Zeabur 要開時免改 Dockerfile。
ARG SENTRY_UPLOAD_TRUSTED=
ARG SENTRY_AUTH_TOKEN=
ARG SENTRY_ORG=
ARG SENTRY_PROJECT=
ENV SENTRY_UPLOAD_TRUSTED=$SENTRY_UPLOAD_TRUSTED \
    SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN \
    SENTRY_ORG=$SENTRY_ORG \
    SENTRY_PROJECT=$SENTRY_PROJECT

# `npm run build` 的 prebuild 生命週期會先跑 scripts/gen-tenant-brand-conf.mjs，
# 產出 nginx-tenant-brand.conf 與 public/brand-version.json（後者必須在 build 之前
# 就位，才會被 vite 拷進 dist 並被 workbox 收進 precache manifest，CT-F-04）。
RUN npm run build
# 寫在 Vite/Workbox build 完成後，避免 build-metadata.json 被收進 PWA precache。
# generator 會先驗證完整 lowercase SHA，再以同目錄暫存檔原子替換正式檔案。
RUN node scripts/generate-build-metadata.mjs --sha "$ZEABUR_GIT_COMMIT_SHA" --out dist/build-metadata.json

# ---------- Runtime stage ----------
FROM nginx:alpine AS runtime

# nginx 同時服務靜態 SPA 與反代 /api/* 到後端內網（first-party cookie，
# 解 LIFF in-app webview 第三方 cookie 被擋的問題）
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
# 安全標頭 snippet（非 template，不經 envsubst）；由各 location include 載入
COPY nginx-security-headers.conf /etc/nginx/security-headers.conf
# 多租戶品牌 map（$tb_* / $tb_known_host / $tb_slug）。`00-` 前綴保證先於
# default.conf 載入——map 必須在 http context 且早於使用它的 server block。
# 不經 templates/ 目錄故不走 envsubst，裡面的中文品牌字面不會被動到。
COPY --from=build /app/nginx-tenant-brand.conf /etc/nginx/conf.d/00-tenant-brand.conf
COPY --from=build /app/dist /usr/share/nginx/html
# 未知 host 守衛開關（fb §3.3）。**必須有值**，否則 nginx entrypoint 的 envsubst
# 不會替換 ${TENANT_HOST_GUARD}，map 會拿到字面 "${TENANT_HOST_GUARD}:0" 而恆不命中。
# 階段 2（多租戶開通、平台健康檢查 host 已列進 branding/tenants.json）後改 on。
ENV TENANT_HOST_GUARD=off
# 啟用官方 image 的 15-local-resolvers.envsh：開機從 /etc/resolv.conf 算出
# ${NGINX_LOCAL_RESOLVERS} 供 template 的 `resolver` 指令使用（變數 proxy_pass
# 的 DNS 重解析依賴它；2026-08-16 staging /api timeout 事故防復發）。
# ⚠ Zeabur 的 frontend service 另設有同名 service variable 兜底——若部署平台
# 用的 Dockerfile 副本沒跟上本行，envsh 沒被啟用會讓 envsubst 把
# ${NGINX_LOCAL_RESOLVERS} 換成空字串，nginx 直接 config error 起不來。
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=true

EXPOSE 8080
