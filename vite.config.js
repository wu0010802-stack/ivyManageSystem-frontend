import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

function manualChunks(id) {
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
    if (id.includes('/src/parent/') || id.includes('@line/liff')) {
        return 'parent-app'
    }

    if (id.includes('chart.js') || id.includes('vue-chartjs')) {
        return 'chart-vendor'
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
        }),
        Components({
            resolvers: [ElementPlusResolver()],
        }),
        VitePWA({
            registerType: 'autoUpdate',          // 有新版本時自動更新 SW
            includeAssets: ['favicon.ico', 'LOGO.png', 'apple-touch-icon-180x180.png', 'logo.svg', 'images/ivy-kids-loading.png'],

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
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    },
    build: {
        chunkSizeWarningLimit: 500,
        sourcemap: false, // 避免正式環境外洩程式碼結構與原始檔路徑
        rollupOptions: {
            // multi-page：管理端 + 家長 LIFF App 兩個獨立 entry
            // dev/prod 路徑：
            //   - 管理端：/index.html（hash 模式 #/...）
            //   - 家長 App：/parent.html（hash 模式 #/...，方便 LIFF endpoint URL 直接綁這個）
            input: {
                main: fileURLToPath(new URL('./index.html', import.meta.url)),
                parent: fileURLToPath(new URL('./parent.html', import.meta.url)),
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
