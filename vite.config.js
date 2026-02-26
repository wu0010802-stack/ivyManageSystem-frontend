import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

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
                // 預快取：所有打包後靜態資源（JS/CSS/HTML/圖片）
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],

                // hash routing：所有導航請求都回傳 index.html
                navigateFallback: 'index.html',

                runtimeCaching: [
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
    server: {
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:8088',
                changeOrigin: true,
            }
        }
    }
})
