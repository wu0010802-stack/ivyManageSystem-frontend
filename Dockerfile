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
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY

RUN npm run build

# ---------- Runtime stage ----------
FROM nginx:alpine AS runtime

# 用 templates 目錄讓 nginx:alpine 的 entrypoint 在啟動時跑 envsubst
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# 只替換 ${BACKEND_URL}，避免動到 nginx 內建變數（$host、$remote_addr 等）
# BACKEND_URL 由 Zeabur frontend service 的 env 注入；預設指向同專案後端 internal DNS
ENV BACKEND_URL=http://ivymanagesystem-backend-rulla.zeabur.internal:8088 \
    NGINX_ENVSUBST_FILTER=BACKEND_URL

EXPOSE 80
