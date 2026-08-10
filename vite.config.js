import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { loadBranding, replaceTokens, tokenMapFor } from './scripts/brand-tokens-lib.mjs'

/**
 * dev server 專用：把三個 HTML 的 `{{TB_*}}` 換成 default tenant 的值。
 *
 * 正式環境由 nginx `sub_filter` 依 $host 注入（fb §3.3）；**build 產物刻意保留 token**。
 * `transformIndexHtml` 只在 dev server 生效（CT-F-03：初稿宣稱它也涵蓋 `vite preview`
 * 已撤回）——跑 dist 但沒有 nginx 的環境請先跑 `node scripts/apply-brand-tokens.mjs`。
 *
 * dev 下 public/*.webmanifest 是靜態檔、不經 vite transform，瀏覽器會抓到含 token 的
 * manifest；只影響 dev 安裝 PWA 的顯示名，可接受。
 * dev 模擬他租戶品牌：`?tenant=` 只影響 L2/API，L1 一律 default；L1 驗收走部署環境。
 */
function brandTokensDevPlugin() {
    return {
        name: 'ivy-brand-tokens-dev',
        apply: 'serve',
        transformIndexHtml: {
            order: 'pre',
            handler(html) {
                return replaceTokens(html, tokenMapFor(loadBranding().defaultTenant))
            },
        },
    }
}

// Sentry source map 上傳採雙重 gate：CI 明確標記 trusted main/release，且三個 secret
// 全部存在才啟用。PR 即使是同 repo 分支也不應取得可外傳 source map 的 auth token。
const SENTRY_UPLOAD_ENABLED =
    process.env.SENTRY_UPLOAD_TRUSTED === 'true' &&
    !!process.env.SENTRY_AUTH_TOKEN &&
    !!process.env.SENTRY_ORG &&
    !!process.env.SENTRY_PROJECT

function manualChunks(id) {
    // Vite SFC helper（plugin-vue:export-helper）固定到 vue-core。
    // 不鎖的話 Rollup 會把它推到第一個用 SFC 的 chunk（曾跑去 parent-app），
    // 造成 shared-common ↔ parent-app 循環依賴 → TDZ：
    //   Cannot access 'B' before initialization
    // 必須在 node_modules / src 過濾之前判斷，因為它是 virtual module。
    if (id.includes('plugin-vue:export-helper')) {
        return 'vue-core'
    }

    // A2 baseline bug fix：Vite 動態 import 的 __vitePreload runtime helper
    // 預設會被 rollup 自動放進「第一個用到它的 chunk」（實測落在 parent-app），
    // 導致 admin-core / public-app 等其他用 dynamic import 的 chunk 必須
    // static-import parent-app 取得 helper → 各 entry HTML 被迫 preload
    // parent-app 整包（家長端的 LIFF SDK / styles 等）。
    // 固定到 vue-core 後三個 entry 都共享同一份 helper，
    // 不再連鎖拉入彼此的 chunk。
    if (id.includes('vite/preload-helper')) {
        return 'vue-core'
    }

    // Rollup CommonJS interop helper is a virtual module shared by Vue's compiler
    // dependencies and generic vendor packages. Letting it fall through makes Rollup
    // place it in vendor, producing vue-core -> vendor while vendor already imports
    // Vue APIs: a circular chunk that can expose initialization-order failures.
    if (id.includes('commonjsHelpers.js')) {
        return 'vue-core'
    }

    if (!id.includes('node_modules') && !id.includes('/src/')) {
        return
    }

    // 共用工具：admin & 家長兩端皆會引用、且不能依賴 element-plus / activity-admin。
    // 必須先於 activity-admin / parent-app 規則，避免被 rollup 自動合併進
    // activity-admin chunk（曾發生 parent.html 因 format.js 被合併而被迫載入
    // activity-admin 整包的回歸）。
    // ⚠ 只放 element-plus-free 的檔案；download.js / useConfirmDelete.js 等用 ElMessage
    // 的檔案不能放進來，否則家長 bundle 會被迫拉 element-plus chunk。
    if (
        id.includes('/src/utils/format.ts') ||
        id.includes('/src/utils/apiDedupe.ts') ||
        id.includes('/src/utils/offlineQueue.ts') ||
        // academic：學年/民國年純函式 util（EP-free），admin（活動/考核）與家長端
        // LeavesView 皆用。未顯式指派時 Rollup 把它複製進 admin-core + activity-admin
        // 兩個 chunk，且家長端 import 它 → parent-app 靜態橋接 activity-admin（53KB gz
        // admin 程式碼）。釘到 shared-common 同時 de-dup 並切斷 parent→activity-admin。
        id.includes('/src/utils/academic.ts') ||
        id.includes('/src/composables/useCachedAsync.ts') ||
        id.includes('/src/components/common/MobileErrorRetry.vue') ||
        // 友善錯誤/連線狀態/捲動鎖/品牌裝飾元件：portal views 與家長端共用（皆 EP-free）。
        // 未顯式指派時落 portal chunk → parent-app 靜態橋接整包 portal，連帶 cascade
        // fullcalendar/chart-vendor/activity-admin/qrcode/markdown（~285KB gz）。
        id.includes('/src/composables/useFriendlyError.ts') ||
        id.includes('/src/utils/errorCodeRegistry.ts') ||
        id.includes('/src/composables/useOnlineStatus.ts') ||
        id.includes('/src/composables/useBodyLock.ts') ||
        id.includes('/src/components/brand/') ||
        // ErrorBoundary.vue（admin App.vue + parent App.vue 共用）與 chunkSelfHeal.ts
        // （admin / public / parent 三端 main.ts 各呼叫一次）皆三端共用且皆 EP-free。
        // 未顯式指派時 Rollup 把兩檔吸進 parent-app chunk → index / public entry 被迫
        // 靜態 import parent-app 整包，連鎖 static-bridge 幾乎全部 chunk（家長 LIFF boot：
        // 殭屍 mount、每次載頁必打 2 支 /api/parent 401、401 後 parent/api/index.ts 改寫
        // location.hash='#/login' 摧毀 deep link → admin 深頁重整被彈首頁、報名連結 hash 被吃）。
        // ⚠ 這是「三端共用的 EP-free 檔漏 pin → 被併進 parent-app」的第二次同型回歸
        //（前次為 design-tokens.css，見下方全域樣式規則的註解）。釘到 shared-common
        //（三端皆載、admin 本就載）即切斷 index/public → parent-app 的靜態橋接。
        id.includes('/src/components/common/ErrorBoundary.vue') ||
        id.includes('/src/utils/chunkSelfHeal.ts') ||
        // sentry：三端 main.ts + ErrorBoundary + admin api/index.ts 皆 import。靜態
        // import 全為 type-only（@sentry/vue 走 await import → sentry chunk 維持
        // lazy），EP-free。未 pin 時被併進 admin-core → shared-common（ErrorBoundary
        // 的 captureException）與 parent-app（parent main.ts 的 initSentry）雙雙
        // 靜態橋接 admin-core。
        id.includes('/src/utils/sentry.ts') ||
        // errorHandler：純錯誤分類（零 import、EP-free），admin api/index.ts 與家長
        // src/parent/api/index.ts 皆用。原列 admin-core，害 parent-app 靜態橋接
        // admin-core（家長端被迫載整包 admin entry utilities）；移入 shared-common
        // 切斷（admin-core 規則的清單已同步移除）。
        id.includes('/src/utils/errorHandler.ts') ||
        // lifecycle / taipeiTime / constants-activity：純常數/純函式（零 import、
        // EP-free），admin/portal 與家長端 eager 元件（ChildrenStrip /
        // useTodayTimeline / activityPayment）皆用。未 pin 時分別落 portal 與
        // activity-admin chunk → parent-app 靜態橋接 portal / activity-admin，
        // 再連鎖 admin-core + element-plus + fullcalendar 全塞進家長首屏。
        // 釘到 shared-common 切斷整條 cascade。
        id.includes('/src/constants/lifecycle.ts') ||
        id.includes('/src/utils/taipeiTime.ts') ||
        id.includes('/src/constants/activity.ts') ||
        // ws / html：WebSocket 重連工具與 HTML escape（皆零 import、EP-free），
        // admin（useInboxNotifications / useBusMonitor / DismissalQueueView）與家長端
        // （useBusTracking / ParentOfflineIndicator）共用。未 pin 時 Rollup 把兩檔併進
        // parent-app chunk → admin index 為了頂欄通知的 ws.ts 靜態橋接 parent-app 整包
        // （首屏 332KB 爆 310KB 預算、check-entry-chunks 紅、staging 部署連續失敗）。
        // 「三端共用 EP-free 檔漏 pin → 被吸進 parent-app」第三次同型回歸。
        id.includes('/src/utils/ws.ts') ||
        id.includes('/src/utils/html.ts') ||
        // weekdaySchedule：上課星期複選的判定/格式化/衝堂純函式（零 import、EP-free），
        // 公開報名頁 useCourseAdvisory 與家長端 parent/utils/activitySchedule 皆用。
        // 未 pin 時被吸進 parent-app chunk → 公開頁的 ActivityPublicView（lazy route，
        // 但 / redirect 到 /activity 故等同首屏）靜態 import parent-app 整包 →
        // src/parent/main.ts 的 top-level 副作用執行：家長 App 也 mount('#app') 搶佔
        // 畫面、guard 判未登入導向 /login → 公開報名網址開出家長端登入（LIFF）。
        // 「三端共用 EP-free 檔漏 pin → 被吸進 parent-app」第四次同型回歸。
        id.includes('/src/utils/weekdaySchedule.ts') ||
        // publicCopy：公開頁行銷文案的粗體解析/一行一條轉換純函式（零 import、
        // EP-free），公開頁 ActivityPublicView 與 admin ActivitySettingsView 共用。
        // 與 weekdaySchedule 同型：跨端共用純函式檔必 pin，防被併進單端 chunk
        // 造成另一端靜態橋接整包（2026-08-03 公開頁接管事故的教訓）。
        id.includes('/src/utils/publicCopy.ts') ||
        // 多租戶品牌（4d/fb）：tenantMeta.ts 是裸 fetch、零 axios 依賴，
        // useTenantBranding.ts 只依賴 vue + tenantMeta。三個 entry 都要讀品牌字串，
        // 家長端的 liff.ts 也 import tenantMeta 取 liff_id。
        // ⛔ **不得改回 admin-core**：admin-core 被 check-entry-chunks.mjs 對 parent
        //    entry 設為 forbidden（家長端不得靜態可達 admin-core），改回去會直接讓
        //    `npm run build` exit 1、CI Build check 紅、出不了 image（CT-F-05 / GAP-01）。
        id.includes('/src/api/tenantMeta.ts') ||
        id.includes('/src/composables/useTenantBranding.ts') ||
        // fc 的租戶解析／儲存隔離／boot 檢查／三態遮罩入口：同樣三端共用且 EP-free。
        // ⚠ tenantBlocked.ts 漏 pin 曾讓 index.html 直接靜態可達 parent-app
        //（「三端共用 EP-free 檔漏 pin → 被吸進 parent-app」的第五次同型回歸），
        // admin 首屏 gz 從 276KB 漂到 337KB 並觸發 check-entry-chunks 的 forbidden 邊。
        id.includes('/src/utils/tenant.ts') ||
        id.includes('/src/utils/tenantStorage.ts') ||
        id.includes('/src/utils/tenantBlocked.ts') ||
        id.includes('/src/utils/tenantBoot.ts') ||
        // surveyQuestionTypes：活動參加調查題型列舉/共用驗證純函式（零 import、
        // EP-free），管理端 surveyFormModel/SurveyDetailView、教師端
        // PortalSurveyDetailView、家長端 SurveyFillSheet 三端皆 import 同一份
        // （2026-08-10 whole-branch review Critical 修復：三端原本各自手抄字面值，
        // 家長端曾誤植不存在的 'single'/'multi'）。與 weekdaySchedule/publicCopy
        // 同型：跨端共用純函式檔未 pin 時會被吸進單端 chunk，讓另一端靜態橋接整包。
        id.includes('/src/constants/surveyQuestionTypes.ts')
    ) {
        return 'shared-common'
    }

    // 全域樣式（design-tokens / a11y）：被三個 entry 的 main.ts 直接 import。
    // 不顯式指派時 Rollup 會把它們併進 parent-app chunk 的 CSS，導致 admin 的
    // main 為了載入這份 CSS 而裸 `import"./parent-app.js"` → 連帶在 admin boot
    // 執行 parent-app 的 LIFF init（liff.init() + 失敗的 /api/parent 401/403 呼叫）。
    // 釘到 shared-common（三端皆載、admin 本就載）即切斷此 admin→parent-app 橋接。
    if (
        id.includes('/src/assets/design-tokens.css') ||
        id.includes('/src/assets/a11y.css')
    ) {
        return 'shared-common'
    }

    // Admin entry 端 static-import 鏈會用到的共用 utilities：
    // 不放任何規則時，Rollup 會把它們合併進第一個共用它的 dynamic chunk
    // （實測：portal / activity-admin），造成 admin index.html 必須回頭 import
    // 那兩個 chunk → modulepreload 把 portal 85KB / activity-admin 55KB（gz）
    // 強制塞入管理端首屏 critical path。
    //
    // 不能放 shared-common：parent.html 也載 shared-common，把 admin-only 的
    // auth/permissions/employees 邏輯給家長端會浪費 bundle 並洩漏權限相關代碼。
    //
    // 必須在 activity-admin / portal 規則之前，否則同樣的 fall-through 路徑
    // 仍會被那兩條規則之外的 Rollup chunking 演算法吸收。
    //
    // ⚠ 加新檔案前先 grep 確認無 element-plus 引用；EP 引用會把 element-plus
    // chunk 拉成 admin-core 的硬依賴，違反 admin-core 的「entry-only」定位。
    if (
        id.includes('/src/api/auth.ts') ||
        id.includes('/src/api/employees.ts') ||
        id.includes('/src/api/studentAssessments.ts') ||
        id.includes('/src/api/studentIncidents.ts') ||
        id.includes('/src/api/classrooms.ts') ||
        id.includes('/src/api/index.ts') ||
        id.includes('/src/stores/_createFetchStore.ts') ||
        id.includes('/src/stores/employee.ts') ||
        id.includes('/src/utils/auth.ts') ||
        id.includes('/src/utils/error.ts') ||
        // errorHandler.ts 已移入 shared-common（家長端 parent/api/index.ts 也 import，
        // 留在 admin-core 會讓 parent-app 靜態橋接 admin-core），見上方 shared-common 註解。
        id.includes('/src/constants/permissions.ts')
    ) {
        return 'admin-core'
    }

    // Activity / Portal 皆已由 router dynamic import 切分。不再把整個來源樹
    // 強制併成 manual chunk：這兩個 feature 與 admin shell 有共用 module，人工
    // 併塊會產生 shell -> feature 的靜態邊，使 Vite 把 portal / activity-admin
    // 以及它們的 fullcalendar / qrcode 依賴全部 modulepreload 到 index 首屏。

    // LIFF：@line/liff SDK + @liff/* + services/liff.ts wrapper，僅 lazy LoginView/MeView
    // 用到（router 兩者皆 () => import(...)）。原本 services/liff.ts 被下方 /src/parent/
    // 規則、@line/liff 被 parent-app 規則指派 → 與 parent 入口 main.ts 同 eager chunk，
    // 家長端每次開機都下載/解析整包 LIFF（~29 KB gz）。抽成獨立 liff chunk（須在 parent-app
    // 規則之前攔截 services/liff.ts），僅 login/me 頁 lazy 載入。
    if (
        id.includes('/src/parent/services/liff.ts') ||
        id.includes('@line/liff') ||
        id.includes('/node_modules/@liff/')
    ) {
        return 'liff'
    }

    // 家長 App（LIFF）獨立 chunk；管理端 / Portal 都不需要載入
    // ⚠ 必須涵蓋 @line/liff 主套件 + @liff/* 所有 sub-package（init / sub-window /
    //   message-bus / share-target-picker / analytics / util / permission / store / ...）
    //   只攔 @line/liff 會讓 sub-package 落到 vendor catch-all → admin / portal 入口
    //   被迫多載 ~25 KB gz。用 /node_modules/@liff/ 而非 @liff/ 避免 src/ 內別名誤命中。
    if (
        // 縮窄：排除 /src/parent/views/，讓 router.ts 已 lazy import 的家長 view
        // 真正 emit per-view chunk（原本被這條過寬規則 collapse 成單一 eager chunk）。
        (id.includes('/src/parent/')
          && !id.includes('/src/parent/views/')
          // assistant/ 元件只被 lazy AssistantView 用，排除讓 marked/dompurify
          // （FaqAnswer 靜態 import）隨 AssistantView 一起 lazy，不進 parent 首屏。
          && !id.includes('/src/parent/components/assistant/'))
        // @line/liff / @liff/* / services/liff.ts 已由上方 liff chunk 規則攔截
    ) {
        return 'parent-app'
    }

    // A2: 公開報名頁（public.html entry）shell + router + design-tokens.
    // 不放 admin / parent；未登入家長不下載 admin-core / activity-admin 整包。
    // views/public/* 由 router lazy dynamic import 落 ActivityPublicView 各自 chunk。
    if (id.includes('/src/public/')) {
        return 'public-app'
    }

    // ──────────────────────────────────────────────────────────────
    // Feature-lib peel：以下套件各自只服務「單一 lazy route / 單一 entry」。
    // 既有程式已用動態 import / lazy route 做隔離，但若 fall through 到下方
    // node_modules catch-all（→ vendor）就會被 admin / parent / public 三個
    // entry 全部 eager 載入，把既有的 code-splitting 默默抵銷掉。比照
    // leaflet / fullcalendar / chart 抽成獨立 chunk，回歸「用到才載」。
    // ⚠ 必須置於下方 node_modules catch-all 之前。

    // Sentry SDK：utils/sentry.ts 以 `await import('@sentry/vue')` 懶載入，
    // 且僅在有 VITE_SENTRY_DSN 時才會載入（無 DSN → SDK 完全不下載）。落進
    // vendor 時會變成預設情境下「三端 eager 載入卻 no-op」的死碼（且為 vendor
    // 最大宗）。抽出後回歸 async chunk：無 DSN = 0 bytes，有 DSN = boot 後
    // 非阻塞載入。全 src 無任何靜態 `@sentry/*` import（axios 攔截器走
    // utils/sentry 的 captureException wrapper，而非直接依賴 @sentry/*），
    // 故此 chunk 不會被任何 eager chunk static-import → 確定為純 async。
    if (
        id.includes('/node_modules/@sentry/') ||
        id.includes('/node_modules/@sentry-internal/')
    ) {
        return 'sentry'
    }

    // vuedraggable（+ 其相依 sortablejs）：僅招生漏斗 FunnelColumn.vue（lazy
    // route）用到拖拉排序。sortablejs 無其他直接 import，隨 vuedraggable 抽出。
    if (
        id.includes('/node_modules/vuedraggable/') ||
        id.includes('/node_modules/sortablejs/')
    ) {
        return 'draggable'
    }

    // qrcode：僅 portal 個人頁 PortalProfileView.vue 產生 QR code 用到。
    if (id.includes('/node_modules/qrcode/')) {
        return 'qrcode'
    }

    // marked + dompurify：僅家長端 FAQ FaqAnswer.vue 渲染 + 消毒 markdown 用到。
    if (
        id.includes('/node_modules/marked/') ||
        id.includes('/node_modules/dompurify/')
    ) {
        return 'markdown'
    }

    // Leaflet 地圖庫只在 RecruitmentAddressHeatmap.vue（招生熱力圖）動態 import 用到。
    // 不抽出時會 fall through 到 vendor catch-all → 所有入口（admin / parent / portal）
    // 都被迫載 150 KB raw / ~50 KB gz。
    // 不放 parent-app：parent 端僅 BusTrackingView.vue（娃娃車追蹤）在 /bus 頁
    // **動態** import leaflet 與其 CSS，仍不得靜態橋接進 parent 首屏 bundle。
    if (
        id.includes('/node_modules/leaflet/') ||
        // leaflet.markercluster（招生熱力圖附近幼兒園聚合，見 D 的改動）隨 leaflet
        // 一起 lazy，避免 fall through vendor catch-all 被三 entry eager 載入。
        id.includes('/node_modules/leaflet.markercluster/')
    ) {
        return 'leaflet'
    }

    // FullCalendar 6 + 4 view plugin (~180 KB raw / ~60 KB gz) 只在 CalendarView.vue
    // 動態 import 用到。抽到獨立 chunk 避免 fall-through 到 vendor，
    // 讓非行事曆頁面（admin home / employees / salary ...）不必載入這包。
    if (id.includes('/node_modules/@fullcalendar/')) {
        return 'fullcalendar'
    }

    if (id.includes('chart.js') || id.includes('vue-chartjs')) {
        return 'chart-vendor'
    }

    if (id.includes('element-plus') || id.includes('@element-plus')) {
        // 不強制合併：Element Plus 元件散布在大量 lazy routes。全部塞進同一塊會讓
        // admin shell 因共用少數元件而首屏載入所有 route 的元件（實測 258.4KB gz）。
        // 提前回傳 undefined 可避開下方 vendor catch-all，交由 Rollup 依 import graph
        // 抽共用塊；首屏降至約 276KB gz，route 專屬元件仍隨 route lazy 載入。
        return undefined
    }

    if (
        id.includes('/node_modules/vue/') ||
        id.includes('/node_modules/@vue/') ||
        id.includes('/node_modules/pinia/') ||
        id.includes('/node_modules/vue-router/')
    ) {
        return 'vue-core'
    }

    if (id.includes('node_modules')) {
        return 'vendor'
    }
}

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        brandTokensDevPlugin(),
        vue(),
        AutoImport({
            resolvers: [ElementPlusResolver()],
            dts: true,
        }),
        Components({
            resolvers: [ElementPlusResolver()],
            // 這兩個名稱各自存在於多個 feature；實際 template 皆顯式 import。
            // 禁止全域 auto-resolve，避免掃描順序決定錯誤元件與每次 build 衝突警告。
            excludeNames: [/^(AttendanceSection|LeaveSection)$/],
            dts: true,
        }),
        VitePWA({
            registerType: 'autoUpdate',          // 有新版本時自動更新 SW
            // 不放 images/ivy-kids-loading.png（324 KB）：放進 includeAssets 會被 SW
            // 在 install 階段搶下載，與首屏 API 競爭頻寬；改 runtime 才載入。
            // 圖檔仍由 vite 自動複製 public/ 下到 dist，App.vue 用到時即可取得。
            //
            // 多租戶（4d/fb，CT-F-04）：**品牌資產全部退出 precache**（原為
            // favicon.ico / LOGO.png / apple-touch-icon-180x180.png / logo.svg）。
            // 理由：precache 的 revision 來自 build 時「預設檔」的內容 hash，而
            // per-tenant 的圖是 nginx 依 $host 從 /brand/<slug>/ overlay 換掉的
            // （dist 內容不變）⇒ revision 永遠不變 ⇒ SW 永遠不重抓，B 校會一直看到
            // A 校的 logo。改走下方 runtimeCaching 的 `brand-assets` SWR 規則。
            includeAssets: [],

            // VitePWA 的 manifest 注入會套用到每個 HTML entry，無法區分
            // admin / parent / public。三個 entry 改由各自 HTML 明確連結 public/
            // 下的靜態 manifest；plugin 仍負責 service worker 產生與註冊。
            manifest: false,

            workbox: {
                // 新 SW 一就緒就接管，避免舊 SW 繼續攔截到已不存在的 chunk hash → 404 白屏。
                // 與 boot-time chunk-fail 自救（main.js）合作：雙保險避免 PWA 升級卡住。
                skipWaiting: true,
                clientsClaim: true,
                // 只預快取 app shell 與核心 vendor；大型 route chunk 與圖片改由 runtime cache 接手
                // multi-page 後管理端 entry 是 main-*.js，家長 App 是 parent-app-*.js（走 runtime cache）
                //
                // 多租戶（CT-F-04）兩處調整：
                //   - **移除三份 *.webmanifest**：它們現在帶 {{TB_*}} token、本就 no-cache，
                //     由 nginx 逐請求注入；留在 precache 只會讓已安裝 PWA 卡住舊品牌。
                //   - **移除 '*.{ico,svg}'**：favicon.ico / logo.svg 是 per-tenant overlay
                //     的品牌資產（理由同 includeAssets），改走 brand-assets SWR。
                //   - **新增 brand-version.json**：內容 = branding/tenants.json 的 hash。
                //     token 化後 dist 對所有租戶內容相同，改品牌只改 nginx map ⇒ 若沒有
                //     這個檔，workbox revision 不變、已安裝 PWA 的三個 HTML 永不重抓。
                //     這是「L1 品牌改動能傳到已安裝 PWA」的唯一機制，勿刪。
                globPatterns: [
                    'index.html',
                    'parent.html',
                    'public.html',
                    'registerSW.js',
                    'brand-version.json',
                    'assets/main-*.css',
                    'assets/main-*.js',
                    'assets/vue-core-*.js',
                    'assets/vendor-*.js',
                    'assets/shared-common-*.js',
                    'assets/shared-common-*.css',
                ],
                // 排除大型 PWA 圖示（由 manifest 按需載入）與 chart-vendor
                globIgnores: [
                    'assets/chart-vendor-*.js',
                    '**/*512*',
                ],

                // hash routing：所有 SPA 內導航回傳 index.html；
                // 家長 App 是另一個獨立 HTML，必須排除避免被導向管理端
                navigateFallback: 'index.html',
                navigateFallbackDenylist: [
                    /^\/parent\.html/, /^\/parent\//,
                    /^\/public\.html/, /^\/public\//,
                ],

                runtimeCaching: [
                    // ─── 品牌資產（L3，per-tenant overlay）───────────────────
                    // 必須排在 app-images 之前：workbox 先匹配先贏，
                    // /images/activity-poster.jpg 同時符合這條與 app-images 的
                    // CacheFirst，順序反了海報就換不掉。
                    //
                    // 用 SWR 而非 CacheFirst：這些 URL 的**內容**會因租戶 overlay 或
                    // 換 logo 而改變，但 URL 永遠不變（被 HTML/template/manifest 四處引用，
                    // 刻意不加 hash）。SWR 讓使用者這次先看到快取、背景更新，下一次導航即新圖。
                    // cache 名不需 tenant 後綴：CacheStorage 本就 per-origin，租戶各自 origin。
                    {
                        urlPattern: ({ url, request }) =>
                            url.origin === self.location.origin &&
                            /^\/(LOGO\.png|logo\.svg|favicon\.ico|apple-touch-icon-180x180\.png|pwa-|maskable-icon-|parent-(pwa-|maskable-)|images\/(activity-poster\.jpg|login-logo\.png|ivy-kids-loading\.png))/.test(url.pathname) &&
                            ['image', ''].includes(request.destination),
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'brand-assets',
                            expiration: {
                                maxEntries: 30,
                                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 天
                            },
                            cacheableResponse: { statuses: [200] },
                        },
                    },
                    {
                        // Google Fonts（跨 origin）：CacheFirst，opaque 回應允許快取
                        urlPattern: ({ url }) =>
                            url.origin === 'https://fonts.googleapis.com' ||
                            url.origin === 'https://fonts.gstatic.com',
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'google-fonts',
                            expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                    {
                        urlPattern: ({ url, request }) =>
                            url.origin === self.location.origin &&
                            url.pathname.startsWith('/assets/') &&
                            ['script', 'style', 'font'].includes(request.destination),
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'app-static-assets',
                            expiration: {
                                maxEntries: 80,
                                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 天
                            },
                            cacheableResponse: { statuses: [200] },
                        },
                    },
                    // /images/*：移出 precache（避免 SW install 卡頻寬）後仍走 cache，
                    // 第一次載入後 reload 不再重抓 324 KB 的 loading 圖。
                    {
                        urlPattern: ({ url, request }) =>
                            url.origin === self.location.origin &&
                            url.pathname.startsWith('/images/') &&
                            request.destination === 'image',
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'app-images',
                            expiration: {
                                maxEntries: 20,
                                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 天
                            },
                            cacheableResponse: { statuses: [200] },
                        },
                    },
                    // ─── 個人化 API ─────────────────────────────────────
                    // Cookie 身分隔離無法成為 CacheStorage key 的一部分；任何 Portal / Parent
                    // response cache 都可能在共享裝置切換帳號後回放前一位的 PII。因此只走網路，
                    // 離線寫入由 IndexedDB owner-partition queue 負責，app shell/靜態資產仍可快取。
                    {
                        urlPattern: ({ url, request }) =>
                            url.origin === self.location.origin &&
                            url.pathname.startsWith('/api/portal') &&
                            request.method === 'GET',
                        handler: 'NetworkOnly',
                    },
                    {
                        urlPattern: ({ url, request }) =>
                            url.origin === self.location.origin &&
                            url.pathname.startsWith('/api/parent') &&
                            request.method === 'GET',
                        handler: 'NetworkOnly',
                    },
                    // 注意：POST（請假/加班申請）由 Workbox 預設排除，不會快取
                ],
            },
        }),
        // Sentry source map 上傳：放最後一個 plugin，確保看到 VitePWA 產出的最終 bundle
        // （PWA 在前能避免 SW precache manifest 把 .map 收進去）。只在
        // SENTRY_AUTH_TOKEN/ORG/PROJECT 三者都設好時實際 upload；disable=true
        // 時 plugin 是 no-op，不會 fail build。
        sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            disable: !SENTRY_UPLOAD_ENABLED,
            silent: !SENTRY_UPLOAD_ENABLED,
            sourcemaps: {
                // 上傳成功後刪掉 .map，避免 dist 包含 source map 外洩程式結構
                filesToDeleteAfterUpload: ['./dist/**/*.map'],
            },
            release: {
                name: process.env.SENTRY_RELEASE,
            },
        }),
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    },
    build: {
        chunkSizeWarningLimit: 500,
        // 缺 SENTRY_AUTH_TOKEN：sourcemap=false（既有行為，避免 dist 含 .map）。
        // 有 token：sourcemap='hidden'（產 map 但 bundle 末尾不寫 //# sourceMappingURL 引用，
        // 之後由 sentryVitePlugin 上傳並依 filesToDeleteAfterUpload 刪除。
        sourcemap: SENTRY_UPLOAD_ENABLED ? 'hidden' : false,
        rollupOptions: {
            // multi-page：管理端 + 家長 LIFF App + 公開報名頁 三個獨立 entry
            // dev/prod 路徑：
            //   - 管理端：/index.html（hash 模式 #/...）
            //   - 家長 App：/parent.html（hash 模式 #/...，方便 LIFF endpoint URL 直接綁這個）
            //   - 公開報名：/public.html（A2 把 /public/activity* 拆出，
            //     未登入家長不下載 admin-core / element-plus / activity-admin 整包）
            input: {
                main: fileURLToPath(new URL('./index.html', import.meta.url)),
                parent: fileURLToPath(new URL('./parent.html', import.meta.url)),
                public: fileURLToPath(new URL('./public.html', import.meta.url)),
            },
            output: {
                manualChunks,
            },
        },
    },
    server: {
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:8088',
                // 多租戶（2026-08）：必須保留原始 Host（如 yihua.localhost:5173）讓後端
                // TenantContextMiddleware 解析 subdomain；後端會自行剝除 port。
                // 單租戶模式後端不讀 Host，false 無副作用。勿改回 true——
                // changeOrigin 會把 Host 改寫成 127.0.0.1:8088，租戶解析必失敗。
                changeOrigin: false,
                ws: true,   // 讓 /api/ws/* WebSocket 也通過 proxy
            }
        }
    }
})
