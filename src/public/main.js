/**
 * A2: 公開報名頁 entry。
 *
 * Why: 既有 /public/activity* 兩條路由註冊在 admin SPA router，
 * 未登入家長要看一張報名表單卻被迫下載 admin-core + vue-core +
 * element-plus 整包（~400 KB gz）。本 entry 拆出獨立 bundle，
 * 只載 vue-core + element-plus + 兩條公開 view 所需的東西。
 *
 * 部署：nginx 可把 /public/* 轉發到 public.html；舊 admin SPA
 * 路由保留作 fallback，不破壞既有連結。
 */
import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import { initSentry } from '@/utils/sentry'

// 設計 tokens（字級 / 間距 / 圓角 / 顏色）與 admin / parent 共用同一份基礎尺度
import '@/assets/design-tokens.css'

const app = createApp(App)

// Sentry init（缺 VITE_SENTRY_DSN 時 no-op）；non-blocking
initSentry(app, { entry: 'public' })

app.use(router)
app.mount('#app')
