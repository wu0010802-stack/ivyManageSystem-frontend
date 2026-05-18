import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Sentry source map 上傳：只有設好 SENTRY_AUTH_TOKEN/ORG/PROJECT 才實際上傳；
// 缺 token 時 plugin disable，build 也不產 source map（避免 dist 留下 .map）。
const SENTRY_UPLOAD_ENABLED = !!process.env.SENTRY_AUTH_TOKEN

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
        id.includes('/src/utils/format.js') ||
        id.includes('/src/utils/apiDedupe.js') ||
        id.includes('/src/composables/useCachedAsync.js') ||
        id.includes('/src/components/common/MobileErrorRetry.vue')
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
        id.includes('/src/api/auth.js') ||
        id.includes('/src/api/employees.js') ||
        id.includes('/src/api/studentAssessments.js') ||
        id.includes('/src/api/studentIncidents.js') ||
        id.includes('/src/api/classrooms.js') ||
        id.includes('/src/api/index.js') ||
        id.includes('/src/stores/_createFetchStore.js') ||
        id.includes('/src/stores/employee.js') ||
        id.includes('/src/utils/auth.js') ||
        id.includes('/src/utils/error.js') ||
        id.includes('/src/utils/errorHandler.js') ||
        id.includes('/src/constants/permissions.ts')
    ) {
        return 'admin-core'
    }

    if (
        id.includes('/src/views/activity/') ||
        id.includes('/src/api/activity.js') ||
        id.includes('/src/stores/activity.js')
    ) {
        return 'activity-admin'
    }

    // Portal（教師入口）獨立 chunk，管理端不需要下載
    if (
        id.includes('/src/views/portal/') ||
        id.includes('/src/api/portal.js')
    ) {
        return 'portal'
    }

    // 家長 App（LIFF）獨立 chunk；管理端 / Portal 都不需要載入
    // ⚠ 必須涵蓋 @line/liff 主套件 + @liff/* 所有 sub-package（init / sub-window /
    //   message-bus / share-target-picker / analytics / util / permission / store / ...）
    //   只攔 @line/liff 會讓 sub-package 落到 vendor catch-all → admin / portal 入口
    //   被迫多載 ~25 KB gz。用 /node_modules/@liff/ 而非 @liff/ 避免 src/ 內別名誤命中。
    if (
        id.includes('/src/parent/') ||
        id.includes('@line/liff') ||
        id.includes('/node_modules/@liff/')
    ) {
        return 'parent-app'
    }

    // A2: 公開報名頁（public.html entry）shell + router + design-tokens.
    // 不放 admin / parent；未登入家長不下載 admin-core / activity-admin 整包。
    // views/public/* 由 router lazy dynamic import 落 ActivityPublicView 各自 chunk。
    if (id.includes('/src/public/')) {
        return 'public-app'
    }

    // Leaflet 地圖庫只在 RecruitmentAddressHeatmap.vue（招生熱力圖）動態 import 用到。
    // 不抽出時會 fall through 到 vendor catch-all → 所有入口（admin / parent / portal）
    // 都被迫載 150 KB raw / ~50 KB gz。
    // 不放 parent-app：parent 完全不用地圖。
    if (id.includes('/node_modules/leaflet/')) {
        return 'leaflet'
    }

    if (id.includes('chart.js') || id.includes('vue-chartjs')) {
        return 'chart-vendor'
    }

    // A3: echarts 整包約 300 KB raw / ~95 KB gz；MeasurementChart 內部 dynamic import
    // → 落獨立 chunk，不會被 fall-through 推進主 vendor。
    if (
        id.includes('/node_modules/echarts/') ||
        id.includes('/node_modules/zrender/')
    ) {
        return 'echarts'
    }

    if (id.includes('element-plus') || id.includes('@element-plus')) {
        return 'element-plus'
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
        vue(),
        AutoImport({
            resolvers: [ElementPlusResolver()],
            dts: true,
        }),
        Components({
            resolvers: [ElementPlusResolver()],
            dts: true,
        }),
        VitePWA({
            registerType: 'autoUpdate',          // 有新版本時自動更新 SW
            // 不放 images/ivy-kids-loading.png（324 KB）：放進 includeAssets 會被 SW
            // 在 install 階段搶下載，與首屏 API 競爭頻寬；改 runtime 才載入。
            // 圖檔仍由 vite 自動複製 public/ 下到 dist，App.vue 用到時即可取得。
            includeAssets: ['favicon.ico', 'LOGO.png', 'apple-touch-icon-180x180.png', 'logo.svg'],

            manifest: {
                name: '常春藤管理系統',
                short_name: '常春藤管理',
                description: '常春藤幼兒園管理與教師入口系統',
                theme_color: '#3f7d48',
                background_color: '#ffffff',
                display: 'standalone',
                orientation: 'portrait',
                start_url: './',
                scope: './',
                icons: [
                    { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
                    { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
                    { src: 'maskable-icon-512x512.png', sizes: '512x512',
                      type: 'image/png', purpose: 'maskable' },
                ],
            },

            workbox: {
                // 新 SW 一就緒就接管，避免舊 SW 繼續攔截到已不存在的 chunk hash → 404 白屏。
                // 與 boot-time chunk-fail 自救（main.js）合作：雙保險避免 PWA 升級卡住。
                skipWaiting: true,
                clientsClaim: true,
                // 只預快取 app shell 與核心 vendor；大型 route chunk 與圖片改由 runtime cache 接手
                // multi-page 後管理端 entry 是 main-*.js，家長 App 是 parent-app-*.js（走 runtime cache）
                globPatterns: [
                    'index.html',
                    'registerSW.js',
                    'manifest.webmanifest',
                    'assets/main-*.css',
                    'assets/main-*.js',
                    'assets/vue-core-*.js',
                    'assets/vendor-*.js',
                    'assets/shared-common-*.js',
                    'assets/shared-common-*.css',
                    '*.{ico,svg}',
                ],
                // 排除大型 PWA 圖示（由 manifest 按需載入）與 chart-vendor
                globIgnores: [
                    'assets/chart-vendor-*.js',
                    '**/*512*',
                ],

                // hash routing：所有 SPA 內導航回傳 index.html；
                // 家長 App 是另一個獨立 HTML，必須排除避免被導向管理端
                navigateFallback: 'index.html',
                navigateFallbackDenylist: [/^\/parent\.html/, /^\/parent\//],

                runtimeCaching: [
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
                    // Portal 點名 GET：離線仍能看到名單（教師場景主線）
                    {
                        urlPattern: ({ url, request }) =>
                            url.pathname.startsWith('/api/portal/my-class-attendance') &&
                            request.method === 'GET',
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'portal-class-attendance',
                            expiration: {
                                maxEntries: 60,
                                maxAgeSeconds: 60 * 60 * 24, // 1 天（跨日點名用）
                            },
                            cacheableResponse: { statuses: [200] },
                        },
                    },
                    // Portal 班級/學生清單：含學生個資 → NetworkFirst，離線才走快取
                    {
                        urlPattern: ({ url, request }) =>
                            url.pathname === '/api/portal/my-students' &&
                            request.method === 'GET',
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'portal-my-students',
                            networkTimeoutSeconds: 5,
                            expiration: {
                                maxEntries: 5,
                                maxAgeSeconds: 60 * 60 * 24, // 1 天
                            },
                            cacheableResponse: { statuses: [200] },
                        },
                    },
                    // Portal 敏感唯讀資料（薪資、班級出席、個人假別/加班）：NetworkFirst 降低共享裝置殘留
                    {
                        urlPattern: ({ url, request }) => {
                            if (request.method !== 'GET') return false
                            const p = url.pathname
                            return (
                                p.startsWith('/api/portal/salary-preview') ||
                                p.startsWith('/api/portal/attendance-sheet') ||
                                p.startsWith('/api/portal/my-leaves') ||
                                p.startsWith('/api/portal/my-overtimes') ||
                                p.startsWith('/api/portal/my-schedule')
                            )
                        },
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'portal-sensitive',
                            networkTimeoutSeconds: 5,
                            expiration: {
                                maxEntries: 30,
                                maxAgeSeconds: 60 * 60 * 2, // 2 小時
                            },
                            cacheableResponse: { statuses: [200] },  // 不快取 401/403/0
                        },
                    },
                    // 公告、行事曆等低敏內容：保留 StaleWhileRevalidate 提供離線體驗
                    {
                        urlPattern: ({ url, request }) => {
                            if (request.method !== 'GET') return false
                            const p = url.pathname
                            return (
                                p.startsWith('/api/portal/announcements') ||
                                p.startsWith('/api/portal/calendar')
                            )
                        },
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'portal-public',
                            expiration: {
                                maxEntries: 20,
                                maxAgeSeconds: 60 * 60 * 12,
                            },
                            cacheableResponse: { statuses: [200] },
                        },
                    },
                    // 其他 Portal GET API：NetworkFirst，避免未知敏感端點被預設快取
                    {
                        urlPattern: ({ url, request }) =>
                            url.pathname.startsWith('/api/portal') &&
                            request.method === 'GET',
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'portal-api',
                            networkTimeoutSeconds: 5,
                            expiration: {
                                maxEntries: 30,
                                maxAgeSeconds: 60 * 60 * 2,
                            },
                            cacheableResponse: { statuses: [200] },
                        },
                    },
                    // ─── 家長端 /api/parent/* ───────────────────────────
                    // 家長首頁彙總：個資 + 摘要 → NetworkFirst，3 秒 timeout 兜離線
                    {
                        urlPattern: ({ url, request }) =>
                            url.pathname === '/api/parent/home/summary' &&
                            request.method === 'GET',
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'parent-home',
                            networkTimeoutSeconds: 3,
                            expiration: {
                                maxEntries: 5,
                                maxAgeSeconds: 60 * 60 * 2,
                            },
                            cacheableResponse: { statuses: [200] },
                        },
                    },
                    // 家長個資 / 子女清單：含個資 → NetworkFirst
                    {
                        urlPattern: ({ url, request }) => {
                            if (request.method !== 'GET') return false
                            const p = url.pathname
                            return (
                                p === '/api/parent/me' ||
                                p === '/api/parent/my-children'
                            )
                        },
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'parent-profile',
                            networkTimeoutSeconds: 5,
                            expiration: {
                                maxEntries: 5,
                                maxAgeSeconds: 60 * 60 * 24,
                            },
                            cacheableResponse: { statuses: [200] },
                        },
                    },
                    // 家長端敏感唯讀（出席 / 費用 / 請假 / 才藝 / 事件）：NetworkFirst
                    {
                        urlPattern: ({ url, request }) => {
                            if (request.method !== 'GET') return false
                            const p = url.pathname
                            return (
                                p.startsWith('/api/parent/attendance') ||
                                p.startsWith('/api/parent/fees') ||
                                p.startsWith('/api/parent/student-leaves') ||
                                p.startsWith('/api/parent/activity') ||
                                p.startsWith('/api/parent/events')
                            )
                        },
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'parent-sensitive',
                            networkTimeoutSeconds: 5,
                            expiration: {
                                maxEntries: 40,
                                maxAgeSeconds: 60 * 60 * 2,
                            },
                            cacheableResponse: { statuses: [200] },
                        },
                    },
                    // 公告（家長 scope）：StaleWhileRevalidate，離線體驗最優
                    {
                        urlPattern: ({ url, request }) =>
                            url.pathname.startsWith('/api/parent/announcements') &&
                            request.method === 'GET',
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'parent-public',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 12,
                            },
                            cacheableResponse: { statuses: [200] },
                        },
                    },
                    // 其他 /api/parent/* GET：NetworkFirst 兜底（避免新端點意外被預設快取）
                    {
                        urlPattern: ({ url, request }) =>
                            url.pathname.startsWith('/api/parent') &&
                            request.method === 'GET',
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'parent-api-fallback',
                            networkTimeoutSeconds: 5,
                            expiration: {
                                maxEntries: 30,
                                maxAgeSeconds: 60 * 60,
                            },
                            cacheableResponse: { statuses: [200] },
                        },
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
                changeOrigin: true,
                ws: true,   // 讓 /api/ws/* WebSocket 也通過 proxy
            }
        }
    }
})
