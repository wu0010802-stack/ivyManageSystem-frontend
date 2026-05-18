import { createApp } from 'vue'
import { createPinia } from 'pinia'

// PWA 升級自救：偵測到 chunk hash 已被新部署移除（dynamic import 失敗、
// 或瀏覽器丟 ChunkLoadError）時，主動清掉 SW + caches 再 reload 一次，
// 避免舊 SW 命中已死的 chunk 造成白屏。用 sessionStorage flag 防止迴圈。
const SELF_HEAL_FLAG = '__ivy_chunk_self_heal__'
async function selfHealAndReload() {
  if (sessionStorage.getItem(SELF_HEAL_FLAG)) return
  sessionStorage.setItem(SELF_HEAL_FLAG, '1')
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } finally {
    location.reload()
  }
}
function looksLikeChunkLoadError(message = '') {
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(
    message,
  )
}
window.addEventListener('error', (e) => {
  const msg = e?.message || e?.error?.message || ''
  if (looksLikeChunkLoadError(msg)) selfHealAndReload()
})
window.addEventListener('unhandledrejection', (e) => {
  const reason = e?.reason
  const msg = (reason && (reason.message || String(reason))) || ''
  if (looksLikeChunkLoadError(msg)) selfHealAndReload()
})

import App from './App.vue'
import router from './router'
import { initSyncBridge } from './stores/syncBridge'
import { useA11yPreference } from '@/composables/useA11yPreference'
import { initSentry } from '@/utils/sentry'

import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './assets/design-tokens.css'
import './assets/main.css'
import './assets/a11y.css'
import './styles/portal/soft-ui.css'

const app = createApp(App)

// Sentry init（缺 VITE_SENTRY_DSN 時 no-op）；non-blocking，boot 期間極早期
// 的 error 可能漏在 Sentry hook 接管前 — 視為可接受 trade-off。
initSentry(app, { entry: 'admin' })

app.use(createPinia())
app.use(router)

useA11yPreference().init()
initSyncBridge()

// 等 router 解析首次 navigation 再 mount，避免 START_LOCATION race
// 造成的 title 一閃「儀表板｜常春藤管理系統」與 AdminLayout 在 /public 路由
// 短暫掛載而打 /api/notifications/summary。
router.isReady().finally(() => app.mount('#app'))
