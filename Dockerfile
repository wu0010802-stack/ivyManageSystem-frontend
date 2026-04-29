# syntax=docker/dockerfile:1.6

# ---------- Build stage ----------
FROM node:22-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# VITE_* 變數會被烤進 bundle，必須在 build 階段提供
ARG VITE_API_BASE_URL=/api
ARG VITE_GOOGLE_MAPS_API_KEY=
ARG VITE_LIFF_ID=2009899896-2qCpwrdC 
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY \
    VITE_LIFF_ID=$VITE_LIFF_ID

RUN npm run build

# ---------- Runtime stage ----------
FROM nginx:alpine AS runtime

# nginx 同時服務靜態 SPA 與反代 /api/* 到後端內網（first-party cookie，
# 解 LIFF in-app webview 第三方 cookie 被擋的問題）
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
