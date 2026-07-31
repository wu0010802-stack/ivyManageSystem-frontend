import { createApp, type App as VueApp } from 'vue'
import { createPinia } from 'pinia'
import { installChunkSelfHeal } from '@/utils/chunkSelfHeal'

import App from './App.vue'
import router from './router'

// 共用設計 tokens（字級 / 間距 / 圓角 / 陰影 / 動效 / semantic colors）。
// 各角色 app 共用同一份基礎尺度，避免「四個產品」的視覺語言分裂。
// 角色 accent 由 parent app 在自己 root style 覆寫 --brand-*。
import '@/assets/design-tokens.css'
// M3 token 基建（color / typography / elevation / motion / state layer）。
// 在 globals.css 之前 import，讓 globals 可在需要時覆寫。
// Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §3
import './styles/m3-tokens.css'
import './styles/typography.css'
import './styles/motion.css'
// 家長 App 全域樣式：focus / reduced-motion / tap-highlight / utility class
// + 既有 IvyKids tokens（與 M3 共存，P4 view 改完後 P5 統一清理）。
// 必須在 design-tokens.css 之後 import（因為它使用 token 變數）。
import './styles/globals.css'
// 共用 UI patterns（pt-eyebrow / pt-card / pt-list-group / pt-pill / pt-action-btn 等）
// 2026-05-17 contact book redesign 大重構引入，跨 view 重用。
import './styles/patterns.css'
// 無障礙偏好（字級 / 高對比）覆寫，需在 globals.css 之後以便覆蓋。
import '@/assets/a11y.css'

import { useParentAuthStore } from './stores/parentAuth'
import { getMe } from './api/profile'
import { initTheme } from './composables/useTheme'
import { initA11y } from './composables/useA11y'
import { initSentry } from '@/utils/sentry'
// 離線寫入佇列：boot / online / visibilitychange flush triggers（spec §6.3.2）
import { flushAllParent } from '@/parent/utils/parentOfflineQueue'

// PWA 升級自救（chunk hash 失效時清 SW+caches reload，避免白屏）
installChunkSelfHeal()

// Theme + A11y 應在第一次 paint 前套用，避免閃爍
initTheme()
initA11y()

const app: VueApp = createApp(App)

// Sentry init（缺 VITE_SENTRY_DSN 時 no-op）；non-blocking
initSentry(app, { entry: 'parent' })

app.use(createPinia())
app.use(router)

// 全域 navigation guard：未登入使用者只能進公開頁（login / bind）
//
// sessionStorage 內的 user 不是 source of truth：cookie 有效但 sessionStorage 被清空
// （新分頁、隱私視窗、瀏覽器重啟）時會誤判未登入。
// 因此首次進非公開頁時先 probe `/parent/me` 一次，成功則 hydrate store；失敗（401）由
// axios interceptor 處理重導，guard 直接放行讓 interceptor 接手即可。
let bootProbe: Promise<void> | null = null
async function ensureSessionProbed(authStore: ReturnType<typeof useParentAuthStore>) {
  if (authStore.isAuthed()) return
  if (!bootProbe) {
    bootProbe = getMe()
      .then((res) => {
        const user = res?.data
        if (user) authStore.setUser(user)
      })
      .catch(() => {
        // 401 → interceptor 已導向 /login；其他錯誤就讓後續 guard 邏輯把人送到 /login
      })
  }
  await bootProbe
}

router.beforeEach(async (to) => {
  const authStore = useParentAuthStore()
  const isPublic = to.meta?.public === true

  if (!isPublic) {
    await ensureSessionProbed(authStore)
    if (!authStore.isAuthed()) {
      // 深連結保存：帶上原始目的地，讓 LoginView 登入成功後能導回這裡
      // （見 utils/safeRedirect.ts —— 消費端一律驗證過才使用，這裡存的是
      // router 自己解析出的 fullPath，非使用者可竄改的原始輸入）。
      return { path: '/login', replace: true, query: { redirect: to.fullPath } }
    }
  }
  return true
})

function setupOfflineFlushTriggers() {
  // boot：等 router 首次 nav 結束後跑一次（auth hydrate 完成）
  router.afterEach(() => {
    if ((window as Window & { __parent_boot_flushed?: boolean }).__parent_boot_flushed) return
    ;(window as Window & { __parent_boot_flushed?: boolean }).__parent_boot_flushed = true
    queueMicrotask(() => { flushAllParent().catch(() => {}) })
  })
  // online event
  window.addEventListener('online', () => {
    flushAllParent().catch(() => {})
  })
  // visibilitychange 切回前景
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      flushAllParent().catch(() => {})
    }
  })
}
setupOfflineFlushTriggers()

app.mount('#app')
