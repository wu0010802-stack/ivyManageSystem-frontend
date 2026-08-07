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
import { createApp, type App as VueApp } from 'vue'
import { installChunkSelfHeal } from '@/utils/chunkSelfHeal'

import App from './App.vue'
import router from './router'
import { initSentry } from '@/utils/sentry'
import { initTenantBoot } from '@/utils/tenantBoot'
import { getBranding, onBrandingLoaded, useTenantBranding } from '@/composables/useTenantBranding'

// 設計 tokens（字級 / 間距 / 圓角 / 顏色）與 admin / parent 共用同一份基礎尺度
import '@/assets/design-tokens.css'

// PWA 升級自救（chunk hash 失效時清 SW+caches reload，避免白屏）
installChunkSelfHeal()

const app: VueApp = createApp(App)

// 多租戶 boot 檢查（frontend-core §2.1）。公開報名頁是**最需要**擋的一支：
// 認不出園所卻照樣渲染，家長會對著別校的報名表單填自己小孩的個資。
const tenantBoot = initTenantBoot()

// Sentry init（缺 VITE_SENTRY_DSN 時 no-op）；non-blocking
initSentry(app, {
  entry: 'public',
  tags: tenantBoot.slug ? { tenant: tenantBoot.slug } : undefined,
}).finally(() => tenantBoot.report())

if (tenantBoot.proceed) {
  // 品牌預熱：與首次導航並行，避免 header 的校名／英文名先閃 default 再跳。
  // 單租戶模式下 useTenantBranding() 不會發任何請求（灰度不變式）。
  useTenantBranding()
  // router.beforeEach 設的 document.title 尾綴用 short_name，品牌回來後補套一次。
  onBrandingLoaded(() => {
    const title = router.currentRoute.value.meta?.title
    if (title) document.title = `${title}｜${getBranding().short_name}`
  })
  app.use(router)
  app.mount('#app')
}
