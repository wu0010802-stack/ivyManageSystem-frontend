import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

function manualChunks(id) {
    if (!id.includes('node_modules') && !id.includes('/src/')) {
        return
    }

    if (
        id.includes('/src/views/activity/') ||
        id.includes('/src/api/activity.js') ||
        id.includes('/src/stores/activity.js')
    ) {
        return 'activity-admin'
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
        VitePWA({
            registerType: 'autoUpdate',          // 有新版本時自動更新 SW
            includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],

            manifest: {
                name: '常春藤教師入口',
                short_name: '常春藤 Portal',
                description: '常春藤幼兒園教職員考勤與請假自助系統',
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
                // 只預快取 app shell 與核心 vendor；大型 route chunk 改由 runtime cache 接手
                globPatterns: [
                    'index.html',
                    'registerSW.js',
                    'manifest.webmanifest',
                    'assets/index-*.css',
                    'assets/index-*.js',
                    'assets/vue-core-*.js',
                    'assets/vendor-*.js',
                    '**/*.{ico,png,svg,woff2}',
                ],

                // hash routing：所有導航請求都回傳 index.html
                navigateFallback: 'index.html',

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
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                    // Portal GET API：stale-while-revalidate，離線可看舊資料
                    {
                        urlPattern: ({ url, request }) =>
                            url.pathname.startsWith('/api/portal') &&
                            request.method === 'GET',
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'portal-api',
                            expiration: {
                                maxEntries: 30,
                                maxAgeSeconds: 60 * 60 * 2,   // 2 小時
                            },
                            cacheableResponse: { statuses: [0, 200] },
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
        rollupOptions: {
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
