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
import { initTenantBoot } from '@/utils/tenantBoot'

import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './assets/design-tokens.css'
import './assets/main.css'
import './assets/a11y.css'
import './styles/portal/soft-ui.css'
import './styles/form-hint.css'
import './assets/crisp.css'

/**
 * 娃娃車 GPS 模擬器（測試用）：必須在任何 `watchPosition` 呼叫之前接管
 * `navigator.geolocation`，因此 mount 要等它完成——司機端一進頁就可能開始追蹤，
 * 晚一步接管就會抓到真實定位而不是模擬路徑。
 *
 * 未設 `VITE_BUS_GPS_SIMULATOR=1` 時這裡是 `Promise.resolve()`，模組不會被載入，
 * 對正式 build 只多一個 microtask。正式部署不設這個變數即可，
 * 見 `utils/busGpsSimulator.ts` 的啟用說明。
 */
const gpsSimulatorReady: Promise<unknown> = import.meta.env.VITE_BUS_GPS_SIMULATOR === '1'
  ? import('@/utils/busGpsSimulator').then((m) => m.installBusGpsSimulator())
  : Promise.resolve()

const app: VueApp = createApp(App)

// 多租戶 boot 檢查（frontend-core §2.1）。單租戶模式（未設 tenant build 變數）
// 一律 proceed=true 且不做任何事，行為與改造前逐字相同（DEV-12 灰度不變式）。
const tenantBoot = initTenantBoot()

// Sentry init（缺 VITE_SENTRY_DSN 時 no-op）；non-blocking，boot 期間極早期
// 的 error 可能漏在 Sentry hook 接管前 — 視為可接受 trade-off。
// tenantBoot.report() 必須等 init 完成才有效（initSentry 是 async）。
initSentry(app, {
  entry: 'admin',
  tags: tenantBoot.slug ? { tenant: tenantBoot.slug } : undefined,
}).finally(() => tenantBoot.report())

// 認不出園所時停止 boot：不掛 router、不 mount、不打任何 API，只留遮罩。
// 靜默顯示 default 品牌是最危險的錯誤（使用者以為在 A 校、實際打的是別校 API）。
if (tenantBoot.proceed) {
  app.use(createPinia())
  app.use(router)

  useA11yPreference().init()
  initSyncBridge()

  // 等 router 解析首次 navigation 再 mount，避免 START_LOCATION race
  // 造成的 title 一閃「儀表板｜常春藤管理系統」與 AdminLayout 在 /public 路由
  // 短暫掛載而打 /api/notifications/summary。
  router.isReady().finally(() => {
    void gpsSimulatorReady.finally(() => app.mount('#app'))
  })
}
