import { createApp, type App as VueApp } from 'vue'
import { createPinia } from 'pinia'
import { installChunkSelfHeal } from '@/utils/chunkSelfHeal'

// PWA 升級自救（chunk hash 失效時清 SW+caches reload，避免白屏）
installChunkSelfHeal()

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
import './styles/form-hint.css'

const app: VueApp = createApp(App)

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
