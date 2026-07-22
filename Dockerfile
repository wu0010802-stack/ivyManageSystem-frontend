# syntax=docker/dockerfile:1.6

# ---------- Build stage ----------
FROM node:24-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# VITE_* 變數會被烤進 bundle，必須在 build 階段提供
ARG VITE_API_BASE_URL=/api
ARG VITE_GOOGLE_MAPS_API_KEY=
ARG VITE_LIFF_ID=2009899896-2qCpwrdC
ARG VITE_LINE_BOT_FRIEND_URL=https://line.me/R/ti/p/@116fakhu
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

RUN npm run build

# ---------- Runtime stage ----------
FROM nginx:alpine AS runtime

# nginx 同時服務靜態 SPA 與反代 /api/* 到後端內網（first-party cookie，
# 解 LIFF in-app webview 第三方 cookie 被擋的問題）
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
# 安全標頭 snippet（非 template，不經 envsubst）；由各 location include 載入
COPY nginx-security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
