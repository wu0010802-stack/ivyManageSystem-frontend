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

# 用 templates 目錄讓 nginx:alpine 的 entrypoint 在啟動時跑 envsubst
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# 啟動時從 /etc/resolv.conf 動態替換 __RESOLVER_IP__ 為真實 cluster DNS IP
# （nginx:alpine 內建 NGINX_LOCAL_RESOLVERS 在 Zeabur 環境會出錯，自己處理較穩）
COPY 25-fix-resolver.sh /docker-entrypoint.d/25-fix-resolver.sh
RUN chmod +x /docker-entrypoint.d/25-fix-resolver.sh

# 只替換 ${BACKEND_URL}，避免動到 nginx 內建變數（$host、$remote_addr 等）
# BACKEND_URL 由 Zeabur frontend service 的 env 注入；預設指向同專案後端 internal DNS
ENV BACKEND_URL=http://ivymanagesystem-backend-rulla.zeabur.internal:8080 \
    NGINX_ENVSUBST_FILTER=BACKEND_URL

EXPOSE 8080
