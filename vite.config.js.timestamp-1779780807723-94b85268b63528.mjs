// vite.config.js
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "file:///Users/yilunwu/Desktop/ivy-frontend/node_modules/vite/dist/node/index.js";
import vue from "file:///Users/yilunwu/Desktop/ivy-frontend/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import { VitePWA } from "file:///Users/yilunwu/Desktop/ivy-frontend/node_modules/vite-plugin-pwa/dist/index.js";
import AutoImport from "file:///Users/yilunwu/Desktop/ivy-frontend/node_modules/unplugin-auto-import/dist/vite.mjs";
import Components from "file:///Users/yilunwu/Desktop/ivy-frontend/node_modules/unplugin-vue-components/dist/vite.mjs";
import { ElementPlusResolver } from "file:///Users/yilunwu/Desktop/ivy-frontend/node_modules/unplugin-vue-components/dist/resolvers.mjs";
import { sentryVitePlugin } from "file:///Users/yilunwu/Desktop/ivy-frontend/node_modules/@sentry/vite-plugin/dist/esm/index.mjs";
var __vite_injected_original_import_meta_url = "file:///Users/yilunwu/Desktop/ivy-frontend/vite.config.js";
var SENTRY_UPLOAD_ENABLED = !!process.env.SENTRY_AUTH_TOKEN;
function manualChunks(id) {
  if (id.includes("plugin-vue:export-helper")) {
    return "vue-core";
  }
  if (id.includes("vite/preload-helper")) {
    return "vue-core";
  }
  if (!id.includes("node_modules") && !id.includes("/src/")) {
    return;
  }
  if (id.includes("/src/utils/format.ts") || id.includes("/src/utils/apiDedupe.ts") || id.includes("/src/composables/useCachedAsync.ts") || id.includes("/src/components/common/MobileErrorRetry.vue")) {
    return "shared-common";
  }
  if (id.includes("/src/api/auth.ts") || id.includes("/src/api/employees.ts") || id.includes("/src/api/studentAssessments.ts") || id.includes("/src/api/studentIncidents.ts") || id.includes("/src/api/classrooms.ts") || id.includes("/src/api/index.ts") || id.includes("/src/stores/_createFetchStore.ts") || id.includes("/src/stores/employee.ts") || id.includes("/src/utils/auth.ts") || id.includes("/src/utils/error.ts") || id.includes("/src/utils/errorHandler.ts") || id.includes("/src/constants/permissions.ts")) {
    return "admin-core";
  }
  if (id.includes("/src/views/activity/") || id.includes("/src/api/activity.ts") || id.includes("/src/stores/activity.ts")) {
    return "activity-admin";
  }
  if (id.includes("/src/views/portal/") || id.includes("/src/api/portal.ts")) {
    return "portal";
  }
  if (id.includes("/src/parent/") || id.includes("@line/liff") || id.includes("/node_modules/@liff/")) {
    return "parent-app";
  }
  if (id.includes("/src/public/")) {
    return "public-app";
  }
  if (id.includes("/node_modules/leaflet/")) {
    return "leaflet";
  }
  if (id.includes("/node_modules/@fullcalendar/")) {
    return "fullcalendar";
  }
  if (id.includes("chart.js") || id.includes("vue-chartjs")) {
    return "chart-vendor";
  }
  if (id.includes("/node_modules/echarts/") || id.includes("/node_modules/zrender/")) {
    return "echarts";
  }
  if (id.includes("element-plus") || id.includes("@element-plus")) {
    return "element-plus";
  }
  if (id.includes("/node_modules/vue/") || id.includes("/node_modules/@vue/") || id.includes("/node_modules/pinia/") || id.includes("/node_modules/vue-router/")) {
    return "vue-core";
  }
  if (id.includes("node_modules")) {
    return "vendor";
  }
}
var vite_config_default = defineConfig({
  plugins: [
    vue(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
      dts: true
    }),
    Components({
      resolvers: [ElementPlusResolver()],
      dts: true
    }),
    VitePWA({
      registerType: "autoUpdate",
      // 有新版本時自動更新 SW
      // 不放 images/ivy-kids-loading.png（324 KB）：放進 includeAssets 會被 SW
      // 在 install 階段搶下載，與首屏 API 競爭頻寬；改 runtime 才載入。
      // 圖檔仍由 vite 自動複製 public/ 下到 dist，App.vue 用到時即可取得。
      includeAssets: ["favicon.ico", "LOGO.png", "apple-touch-icon-180x180.png", "logo.svg"],
      manifest: {
        name: "\u5E38\u6625\u85E4\u7BA1\u7406\u7CFB\u7D71",
        short_name: "\u5E38\u6625\u85E4\u7BA1\u7406",
        description: "\u5E38\u6625\u85E4\u5E7C\u5152\u5712\u7BA1\u7406\u8207\u6559\u5E2B\u5165\u53E3\u7CFB\u7D71",
        theme_color: "#3f7d48",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        // 新 SW 一就緒就接管，避免舊 SW 繼續攔截到已不存在的 chunk hash → 404 白屏。
        // 與 boot-time chunk-fail 自救（main.js）合作：雙保險避免 PWA 升級卡住。
        skipWaiting: true,
        clientsClaim: true,
        // 只預快取 app shell 與核心 vendor；大型 route chunk 與圖片改由 runtime cache 接手
        // multi-page 後管理端 entry 是 main-*.js，家長 App 是 parent-app-*.js（走 runtime cache）
        globPatterns: [
          "index.html",
          "registerSW.js",
          "manifest.webmanifest",
          "assets/main-*.css",
          "assets/main-*.js",
          "assets/vue-core-*.js",
          "assets/vendor-*.js",
          "assets/shared-common-*.js",
          "assets/shared-common-*.css",
          "*.{ico,svg}"
        ],
        // 排除大型 PWA 圖示（由 manifest 按需載入）與 chart-vendor
        globIgnores: [
          "assets/chart-vendor-*.js",
          "**/*512*"
        ],
        // hash routing：所有 SPA 內導航回傳 index.html；
        // 家長 App 是另一個獨立 HTML，必須排除避免被導向管理端
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/parent\.html/, /^\/parent\//],
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) => url.origin === self.location.origin && url.pathname.startsWith("/assets/") && ["script", "style", "font"].includes(request.destination),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "app-static-assets",
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 60 * 60 * 24 * 7
                // 7 天
              },
              cacheableResponse: { statuses: [200] }
            }
          },
          // /images/*：移出 precache（避免 SW install 卡頻寬）後仍走 cache，
          // 第一次載入後 reload 不再重抓 324 KB 的 loading 圖。
          {
            urlPattern: ({ url, request }) => url.origin === self.location.origin && url.pathname.startsWith("/images/") && request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "app-images",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 30
                // 30 天
              },
              cacheableResponse: { statuses: [200] }
            }
          },
          // Portal 點名 GET：離線仍能看到名單（教師場景主線）
          {
            urlPattern: ({ url, request }) => url.pathname.startsWith("/api/portal/my-class-attendance") && request.method === "GET",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "portal-class-attendance",
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24
                // 1 天（跨日點名用）
              },
              cacheableResponse: { statuses: [200] }
            }
          },
          // Portal 班級/學生清單：含學生個資 → NetworkFirst，離線才走快取
          {
            urlPattern: ({ url, request }) => url.pathname === "/api/portal/my-students" && request.method === "GET",
            handler: "NetworkFirst",
            options: {
              cacheName: "portal-my-students",
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 5,
                maxAgeSeconds: 60 * 60 * 24
                // 1 天
              },
              cacheableResponse: { statuses: [200] }
            }
          },
          // Portal 敏感唯讀資料（薪資、班級出席、個人假別/加班）：NetworkFirst 降低共享裝置殘留
          {
            urlPattern: ({ url, request }) => {
              if (request.method !== "GET") return false;
              const p = url.pathname;
              return p.startsWith("/api/portal/salary-preview") || p.startsWith("/api/portal/attendance-sheet") || p.startsWith("/api/portal/my-leaves") || p.startsWith("/api/portal/my-overtimes") || p.startsWith("/api/portal/my-schedule");
            },
            handler: "NetworkFirst",
            options: {
              cacheName: "portal-sensitive",
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 2
                // 2 小時
              },
              cacheableResponse: { statuses: [200] }
              // 不快取 401/403/0
            }
          },
          // 公告、行事曆等低敏內容：保留 StaleWhileRevalidate 提供離線體驗
          {
            urlPattern: ({ url, request }) => {
              if (request.method !== "GET") return false;
              const p = url.pathname;
              return p.startsWith("/api/portal/announcements") || p.startsWith("/api/portal/calendar");
            },
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "portal-public",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 12
              },
              cacheableResponse: { statuses: [200] }
            }
          },
          // 其他 Portal GET API：NetworkFirst，避免未知敏感端點被預設快取
          {
            urlPattern: ({ url, request }) => url.pathname.startsWith("/api/portal") && request.method === "GET",
            handler: "NetworkFirst",
            options: {
              cacheName: "portal-api",
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 2
              },
              cacheableResponse: { statuses: [200] }
            }
          },
          // ─── 家長端 /api/parent/* ───────────────────────────
          // 家長首頁彙總：個資 + 摘要 → NetworkFirst，3 秒 timeout 兜離線
          {
            urlPattern: ({ url, request }) => url.pathname === "/api/parent/home/summary" && request.method === "GET",
            handler: "NetworkFirst",
            options: {
              cacheName: "parent-home",
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 5,
                maxAgeSeconds: 60 * 60 * 2
              },
              cacheableResponse: { statuses: [200] }
            }
          },
          // 家長個資 / 子女清單：含個資 → NetworkFirst
          {
            urlPattern: ({ url, request }) => {
              if (request.method !== "GET") return false;
              const p = url.pathname;
              return p === "/api/parent/me" || p === "/api/parent/my-children";
            },
            handler: "NetworkFirst",
            options: {
              cacheName: "parent-profile",
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 5,
                maxAgeSeconds: 60 * 60 * 24
              },
              cacheableResponse: { statuses: [200] }
            }
          },
          // 家長端敏感唯讀（出席 / 費用 / 請假 / 才藝 / 事件）：NetworkFirst
          {
            urlPattern: ({ url, request }) => {
              if (request.method !== "GET") return false;
              const p = url.pathname;
              return p.startsWith("/api/parent/attendance") || p.startsWith("/api/parent/fees") || p.startsWith("/api/parent/student-leaves") || p.startsWith("/api/parent/activity") || p.startsWith("/api/parent/events");
            },
            handler: "NetworkFirst",
            options: {
              cacheName: "parent-sensitive",
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 40,
                maxAgeSeconds: 60 * 60 * 2
              },
              cacheableResponse: { statuses: [200] }
            }
          },
          // 公告（家長 scope）：StaleWhileRevalidate，離線體驗最優
          {
            urlPattern: ({ url, request }) => url.pathname.startsWith("/api/parent/announcements") && request.method === "GET",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "parent-public",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 12
              },
              cacheableResponse: { statuses: [200] }
            }
          },
          // 其他 /api/parent/* GET：NetworkFirst 兜底（避免新端點意外被預設快取）
          {
            urlPattern: ({ url, request }) => url.pathname.startsWith("/api/parent") && request.method === "GET",
            handler: "NetworkFirst",
            options: {
              cacheName: "parent-api-fallback",
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60
              },
              cacheableResponse: { statuses: [200] }
            }
          }
          // 注意：POST（請假/加班申請）由 Workbox 預設排除，不會快取
        ]
      }
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
        filesToDeleteAfterUpload: ["./dist/**/*.map"]
      },
      release: {
        name: process.env.SENTRY_RELEASE
      }
    })
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", __vite_injected_original_import_meta_url))
    }
  },
  build: {
    chunkSizeWarningLimit: 500,
    // 缺 SENTRY_AUTH_TOKEN：sourcemap=false（既有行為，避免 dist 含 .map）。
    // 有 token：sourcemap='hidden'（產 map 但 bundle 末尾不寫 //# sourceMappingURL 引用，
    // 之後由 sentryVitePlugin 上傳並依 filesToDeleteAfterUpload 刪除。
    sourcemap: SENTRY_UPLOAD_ENABLED ? "hidden" : false,
    rollupOptions: {
      // multi-page：管理端 + 家長 LIFF App + 公開報名頁 三個獨立 entry
      // dev/prod 路徑：
      //   - 管理端：/index.html（hash 模式 #/...）
      //   - 家長 App：/parent.html（hash 模式 #/...，方便 LIFF endpoint URL 直接綁這個）
      //   - 公開報名：/public.html（A2 把 /public/activity* 拆出，
      //     未登入家長不下載 admin-core / element-plus / activity-admin 整包）
      input: {
        main: fileURLToPath(new URL("./index.html", __vite_injected_original_import_meta_url)),
        parent: fileURLToPath(new URL("./parent.html", __vite_injected_original_import_meta_url)),
        public: fileURLToPath(new URL("./public.html", __vite_injected_original_import_meta_url))
      },
      output: {
        manualChunks
      }
    }
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8088",
        changeOrigin: true,
        ws: true
        // 讓 /api/ws/* WebSocket 也通過 proxy
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMveWlsdW53dS9EZXNrdG9wL2l2eS1mcm9udGVuZFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL3lpbHVud3UvRGVza3RvcC9pdnktZnJvbnRlbmQvdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL3lpbHVud3UvRGVza3RvcC9pdnktZnJvbnRlbmQvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBmaWxlVVJMVG9QYXRoLCBVUkwgfSBmcm9tICdub2RlOnVybCdcbmltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gJ3ZpdGUnXG5pbXBvcnQgdnVlIGZyb20gJ0B2aXRlanMvcGx1Z2luLXZ1ZSdcbmltcG9ydCB7IFZpdGVQV0EgfSBmcm9tICd2aXRlLXBsdWdpbi1wd2EnXG5pbXBvcnQgQXV0b0ltcG9ydCBmcm9tICd1bnBsdWdpbi1hdXRvLWltcG9ydC92aXRlJ1xuaW1wb3J0IENvbXBvbmVudHMgZnJvbSAndW5wbHVnaW4tdnVlLWNvbXBvbmVudHMvdml0ZSdcbmltcG9ydCB7IEVsZW1lbnRQbHVzUmVzb2x2ZXIgfSBmcm9tICd1bnBsdWdpbi12dWUtY29tcG9uZW50cy9yZXNvbHZlcnMnXG5pbXBvcnQgeyBzZW50cnlWaXRlUGx1Z2luIH0gZnJvbSAnQHNlbnRyeS92aXRlLXBsdWdpbidcblxuLy8gU2VudHJ5IHNvdXJjZSBtYXAgXHU0RTBBXHU1MEIzXHVGRjFBXHU1M0VBXHU2NzA5XHU4QTJEXHU1OTdEIFNFTlRSWV9BVVRIX1RPS0VOL09SRy9QUk9KRUNUIFx1NjI0RFx1NUJFNlx1OTY5Qlx1NEUwQVx1NTBCM1x1RkYxQlxuLy8gXHU3RjNBIHRva2VuIFx1NjY0MiBwbHVnaW4gZGlzYWJsZVx1RkYwQ2J1aWxkIFx1NEU1Rlx1NEUwRFx1NzUyMiBzb3VyY2UgbWFwXHVGRjA4XHU5MDdGXHU1MTREIGRpc3QgXHU3NTU5XHU0RTBCIC5tYXBcdUZGMDlcdTMwMDJcbmNvbnN0IFNFTlRSWV9VUExPQURfRU5BQkxFRCA9ICEhcHJvY2Vzcy5lbnYuU0VOVFJZX0FVVEhfVE9LRU5cblxuZnVuY3Rpb24gbWFudWFsQ2h1bmtzKGlkKSB7XG4gICAgLy8gVml0ZSBTRkMgaGVscGVyXHVGRjA4cGx1Z2luLXZ1ZTpleHBvcnQtaGVscGVyXHVGRjA5XHU1NkZBXHU1QjlBXHU1MjMwIHZ1ZS1jb3JlXHUzMDAyXG4gICAgLy8gXHU0RTBEXHU5Mzk2XHU3Njg0XHU4QTcxIFJvbGx1cCBcdTY3MDNcdTYyOEFcdTVCODNcdTYzQThcdTUyMzBcdTdCMkNcdTRFMDBcdTUwMEJcdTc1MjggU0ZDIFx1NzY4NCBjaHVua1x1RkYwOFx1NjZGRVx1OEREMVx1NTNCQiBwYXJlbnQtYXBwXHVGRjA5XHVGRjBDXG4gICAgLy8gXHU5MDIwXHU2MjEwIHNoYXJlZC1jb21tb24gXHUyMTk0IHBhcmVudC1hcHAgXHU1RkFBXHU3NEIwXHU0RjlEXHU4Q0Y0IFx1MjE5MiBURFpcdUZGMUFcbiAgICAvLyAgIENhbm5vdCBhY2Nlc3MgJ0InIGJlZm9yZSBpbml0aWFsaXphdGlvblxuICAgIC8vIFx1NUZDNVx1OTgwOFx1NTcyOCBub2RlX21vZHVsZXMgLyBzcmMgXHU5MDRFXHU2RkZFXHU0RTRCXHU1MjREXHU1MjI0XHU2NUI3XHVGRjBDXHU1NkUwXHU3MEJBXHU1QjgzXHU2NjJGIHZpcnR1YWwgbW9kdWxlXHUzMDAyXG4gICAgaWYgKGlkLmluY2x1ZGVzKCdwbHVnaW4tdnVlOmV4cG9ydC1oZWxwZXInKSkge1xuICAgICAgICByZXR1cm4gJ3Z1ZS1jb3JlJ1xuICAgIH1cblxuICAgIC8vIEEyIGJhc2VsaW5lIGJ1ZyBmaXhcdUZGMUFWaXRlIFx1NTJENVx1NjE0QiBpbXBvcnQgXHU3Njg0IF9fdml0ZVByZWxvYWQgcnVudGltZSBoZWxwZXJcbiAgICAvLyBcdTk4MTBcdThBMkRcdTY3MDNcdTg4QUIgcm9sbHVwIFx1ODFFQVx1NTJENVx1NjUzRVx1OTAzMlx1MzAwQ1x1N0IyQ1x1NEUwMFx1NTAwQlx1NzUyOFx1NTIzMFx1NUI4M1x1NzY4NCBjaHVua1x1MzAwRFx1RkYwOFx1NUJFNlx1NkUyQ1x1ODQzRFx1NTcyOCBwYXJlbnQtYXBwXHVGRjA5XHVGRjBDXG4gICAgLy8gXHU1QzBFXHU4MUY0IGFkbWluLWNvcmUgLyBwdWJsaWMtYXBwIFx1N0I0OVx1NTE3Nlx1NEVENlx1NzUyOCBkeW5hbWljIGltcG9ydCBcdTc2ODQgY2h1bmsgXHU1RkM1XHU5ODA4XG4gICAgLy8gc3RhdGljLWltcG9ydCBwYXJlbnQtYXBwIFx1NTNENlx1NUY5NyBoZWxwZXIgXHUyMTkyIFx1NTQwNCBlbnRyeSBIVE1MIFx1ODhBQlx1OEZFQiBwcmVsb2FkXG4gICAgLy8gcGFyZW50LWFwcCBcdTY1NzRcdTUzMDVcdUZGMDhcdTVCQjZcdTk1NzdcdTdBRUZcdTc2ODQgTElGRiBTREsgLyBzdHlsZXMgXHU3QjQ5XHVGRjA5XHUzMDAyXG4gICAgLy8gXHU1NkZBXHU1QjlBXHU1MjMwIHZ1ZS1jb3JlIFx1NUY4Q1x1NEUwOVx1NTAwQiBlbnRyeSBcdTkwRkRcdTUxNzFcdTRFQUJcdTU0MENcdTRFMDBcdTRFRkQgaGVscGVyXHVGRjBDXG4gICAgLy8gXHU0RTBEXHU1MThEXHU5MDIzXHU5Mzk2XHU2MkM5XHU1MTY1XHU1RjdDXHU2QjY0XHU3Njg0IGNodW5rXHUzMDAyXG4gICAgaWYgKGlkLmluY2x1ZGVzKCd2aXRlL3ByZWxvYWQtaGVscGVyJykpIHtcbiAgICAgICAgcmV0dXJuICd2dWUtY29yZSdcbiAgICB9XG5cbiAgICBpZiAoIWlkLmluY2x1ZGVzKCdub2RlX21vZHVsZXMnKSAmJiAhaWQuaW5jbHVkZXMoJy9zcmMvJykpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgLy8gXHU1MTcxXHU3NTI4XHU1REU1XHU1MTc3XHVGRjFBYWRtaW4gJiBcdTVCQjZcdTk1NzdcdTUxNjlcdTdBRUZcdTc2ODZcdTY3MDNcdTVGMTVcdTc1MjhcdTMwMDFcdTRFMTRcdTRFMERcdTgwRkRcdTRGOURcdThDRjQgZWxlbWVudC1wbHVzIC8gYWN0aXZpdHktYWRtaW5cdTMwMDJcbiAgICAvLyBcdTVGQzVcdTk4MDhcdTUxNDhcdTY1QkMgYWN0aXZpdHktYWRtaW4gLyBwYXJlbnQtYXBwIFx1ODk4Rlx1NTI0N1x1RkYwQ1x1OTA3Rlx1NTE0RFx1ODhBQiByb2xsdXAgXHU4MUVBXHU1MkQ1XHU1NDA4XHU0Rjc1XHU5MDMyXG4gICAgLy8gYWN0aXZpdHktYWRtaW4gY2h1bmtcdUZGMDhcdTY2RkVcdTc2N0NcdTc1MUYgcGFyZW50Lmh0bWwgXHU1NkUwIGZvcm1hdC5qcyBcdTg4QUJcdTU0MDhcdTRGNzVcdTgwMENcdTg4QUJcdThGRUJcdThGMDlcdTUxNjVcbiAgICAvLyBhY3Rpdml0eS1hZG1pbiBcdTY1NzRcdTUzMDVcdTc2ODRcdTU2REVcdTZCNzhcdUZGMDlcdTMwMDJcbiAgICAvLyBcdTI2QTAgXHU1M0VBXHU2NTNFIGVsZW1lbnQtcGx1cy1mcmVlIFx1NzY4NFx1NkE5NFx1Njg0OFx1RkYxQmRvd25sb2FkLmpzIC8gdXNlQ29uZmlybURlbGV0ZS5qcyBcdTdCNDlcdTc1MjggRWxNZXNzYWdlXG4gICAgLy8gXHU3Njg0XHU2QTk0XHU2ODQ4XHU0RTBEXHU4MEZEXHU2NTNFXHU5MDMyXHU0Rjg2XHVGRjBDXHU1NDI2XHU1MjQ3XHU1QkI2XHU5NTc3IGJ1bmRsZSBcdTY3MDNcdTg4QUJcdThGRUJcdTYyQzkgZWxlbWVudC1wbHVzIGNodW5rXHUzMDAyXG4gICAgaWYgKFxuICAgICAgICBpZC5pbmNsdWRlcygnL3NyYy91dGlscy9mb3JtYXQudHMnKSB8fFxuICAgICAgICBpZC5pbmNsdWRlcygnL3NyYy91dGlscy9hcGlEZWR1cGUudHMnKSB8fFxuICAgICAgICBpZC5pbmNsdWRlcygnL3NyYy9jb21wb3NhYmxlcy91c2VDYWNoZWRBc3luYy50cycpIHx8XG4gICAgICAgIGlkLmluY2x1ZGVzKCcvc3JjL2NvbXBvbmVudHMvY29tbW9uL01vYmlsZUVycm9yUmV0cnkudnVlJylcbiAgICApIHtcbiAgICAgICAgcmV0dXJuICdzaGFyZWQtY29tbW9uJ1xuICAgIH1cblxuICAgIC8vIEFkbWluIGVudHJ5IFx1N0FFRiBzdGF0aWMtaW1wb3J0IFx1OTNDOFx1NjcwM1x1NzUyOFx1NTIzMFx1NzY4NFx1NTE3MVx1NzUyOCB1dGlsaXRpZXNcdUZGMUFcbiAgICAvLyBcdTRFMERcdTY1M0VcdTRFRkJcdTRGNTVcdTg5OEZcdTUyNDdcdTY2NDJcdUZGMENSb2xsdXAgXHU2NzAzXHU2MjhBXHU1QjgzXHU1MDExXHU1NDA4XHU0Rjc1XHU5MDMyXHU3QjJDXHU0RTAwXHU1MDBCXHU1MTcxXHU3NTI4XHU1QjgzXHU3Njg0IGR5bmFtaWMgY2h1bmtcbiAgICAvLyBcdUZGMDhcdTVCRTZcdTZFMkNcdUZGMUFwb3J0YWwgLyBhY3Rpdml0eS1hZG1pblx1RkYwOVx1RkYwQ1x1OTAyMFx1NjIxMCBhZG1pbiBpbmRleC5odG1sIFx1NUZDNVx1OTgwOFx1NTZERVx1OTgyRCBpbXBvcnRcbiAgICAvLyBcdTkwQTNcdTUxNjlcdTUwMEIgY2h1bmsgXHUyMTkyIG1vZHVsZXByZWxvYWQgXHU2MjhBIHBvcnRhbCA4NUtCIC8gYWN0aXZpdHktYWRtaW4gNTVLQlx1RkYwOGd6XHVGRjA5XG4gICAgLy8gXHU1RjM3XHU1MjM2XHU1ODVFXHU1MTY1XHU3QkExXHU3NDA2XHU3QUVGXHU5OTk2XHU1QzRGIGNyaXRpY2FsIHBhdGhcdTMwMDJcbiAgICAvL1xuICAgIC8vIFx1NEUwRFx1ODBGRFx1NjUzRSBzaGFyZWQtY29tbW9uXHVGRjFBcGFyZW50Lmh0bWwgXHU0RTVGXHU4RjA5IHNoYXJlZC1jb21tb25cdUZGMENcdTYyOEEgYWRtaW4tb25seSBcdTc2ODRcbiAgICAvLyBhdXRoL3Blcm1pc3Npb25zL2VtcGxveWVlcyBcdTkwOEZcdThGMkZcdTdENjZcdTVCQjZcdTk1NzdcdTdBRUZcdTY3MDNcdTZENkFcdThDQkIgYnVuZGxlIFx1NEUyNlx1NkQyOVx1NkYwRlx1NkIwQVx1OTY1MFx1NzZGOFx1OTVEQ1x1NEVFM1x1NzhCQ1x1MzAwMlxuICAgIC8vXG4gICAgLy8gXHU1RkM1XHU5ODA4XHU1NzI4IGFjdGl2aXR5LWFkbWluIC8gcG9ydGFsIFx1ODk4Rlx1NTI0N1x1NEU0Qlx1NTI0RFx1RkYwQ1x1NTQyNlx1NTI0N1x1NTQwQ1x1NkEyM1x1NzY4NCBmYWxsLXRocm91Z2ggXHU4REVGXHU1RjkxXG4gICAgLy8gXHU0RUNEXHU2NzAzXHU4OEFCXHU5MEEzXHU1MTY5XHU2ODlEXHU4OThGXHU1MjQ3XHU0RTRCXHU1OTE2XHU3Njg0IFJvbGx1cCBjaHVua2luZyBcdTZGMTRcdTdCOTdcdTZDRDVcdTU0MzhcdTY1MzZcdTMwMDJcbiAgICAvL1xuICAgIC8vIFx1MjZBMCBcdTUyQTBcdTY1QjBcdTZBOTRcdTY4NDhcdTUyNERcdTUxNDggZ3JlcCBcdTc4QkFcdThBOERcdTcxMjEgZWxlbWVudC1wbHVzIFx1NUYxNVx1NzUyOFx1RkYxQkVQIFx1NUYxNVx1NzUyOFx1NjcwM1x1NjI4QSBlbGVtZW50LXBsdXNcbiAgICAvLyBjaHVuayBcdTYyQzlcdTYyMTAgYWRtaW4tY29yZSBcdTc2ODRcdTc4NkNcdTRGOURcdThDRjRcdUZGMENcdTkwNTVcdTUzQ0QgYWRtaW4tY29yZSBcdTc2ODRcdTMwMENlbnRyeS1vbmx5XHUzMDBEXHU1QjlBXHU0RjREXHUzMDAyXG4gICAgaWYgKFxuICAgICAgICBpZC5pbmNsdWRlcygnL3NyYy9hcGkvYXV0aC50cycpIHx8XG4gICAgICAgIGlkLmluY2x1ZGVzKCcvc3JjL2FwaS9lbXBsb3llZXMudHMnKSB8fFxuICAgICAgICBpZC5pbmNsdWRlcygnL3NyYy9hcGkvc3R1ZGVudEFzc2Vzc21lbnRzLnRzJykgfHxcbiAgICAgICAgaWQuaW5jbHVkZXMoJy9zcmMvYXBpL3N0dWRlbnRJbmNpZGVudHMudHMnKSB8fFxuICAgICAgICBpZC5pbmNsdWRlcygnL3NyYy9hcGkvY2xhc3Nyb29tcy50cycpIHx8XG4gICAgICAgIGlkLmluY2x1ZGVzKCcvc3JjL2FwaS9pbmRleC50cycpIHx8XG4gICAgICAgIGlkLmluY2x1ZGVzKCcvc3JjL3N0b3Jlcy9fY3JlYXRlRmV0Y2hTdG9yZS50cycpIHx8XG4gICAgICAgIGlkLmluY2x1ZGVzKCcvc3JjL3N0b3Jlcy9lbXBsb3llZS50cycpIHx8XG4gICAgICAgIGlkLmluY2x1ZGVzKCcvc3JjL3V0aWxzL2F1dGgudHMnKSB8fFxuICAgICAgICBpZC5pbmNsdWRlcygnL3NyYy91dGlscy9lcnJvci50cycpIHx8XG4gICAgICAgIGlkLmluY2x1ZGVzKCcvc3JjL3V0aWxzL2Vycm9ySGFuZGxlci50cycpIHx8XG4gICAgICAgIGlkLmluY2x1ZGVzKCcvc3JjL2NvbnN0YW50cy9wZXJtaXNzaW9ucy50cycpXG4gICAgKSB7XG4gICAgICAgIHJldHVybiAnYWRtaW4tY29yZSdcbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICAgIGlkLmluY2x1ZGVzKCcvc3JjL3ZpZXdzL2FjdGl2aXR5LycpIHx8XG4gICAgICAgIGlkLmluY2x1ZGVzKCcvc3JjL2FwaS9hY3Rpdml0eS50cycpIHx8XG4gICAgICAgIGlkLmluY2x1ZGVzKCcvc3JjL3N0b3Jlcy9hY3Rpdml0eS50cycpXG4gICAgKSB7XG4gICAgICAgIHJldHVybiAnYWN0aXZpdHktYWRtaW4nXG4gICAgfVxuXG4gICAgLy8gUG9ydGFsXHVGRjA4XHU2NTU5XHU1RTJCXHU1MTY1XHU1M0UzXHVGRjA5XHU3MzY4XHU3QUNCIGNodW5rXHVGRjBDXHU3QkExXHU3NDA2XHU3QUVGXHU0RTBEXHU5NzAwXHU4OTgxXHU0RTBCXHU4RjA5XG4gICAgaWYgKFxuICAgICAgICBpZC5pbmNsdWRlcygnL3NyYy92aWV3cy9wb3J0YWwvJykgfHxcbiAgICAgICAgaWQuaW5jbHVkZXMoJy9zcmMvYXBpL3BvcnRhbC50cycpXG4gICAgKSB7XG4gICAgICAgIHJldHVybiAncG9ydGFsJ1xuICAgIH1cblxuICAgIC8vIFx1NUJCNlx1OTU3NyBBcHBcdUZGMDhMSUZGXHVGRjA5XHU3MzY4XHU3QUNCIGNodW5rXHVGRjFCXHU3QkExXHU3NDA2XHU3QUVGIC8gUG9ydGFsIFx1OTBGRFx1NEUwRFx1OTcwMFx1ODk4MVx1OEYwOVx1NTE2NVxuICAgIC8vIFx1MjZBMCBcdTVGQzVcdTk4MDhcdTZEQjVcdTg0Q0IgQGxpbmUvbGlmZiBcdTRFM0JcdTU5NTdcdTRFRjYgKyBAbGlmZi8qIFx1NjI0MFx1NjcwOSBzdWItcGFja2FnZVx1RkYwOGluaXQgLyBzdWItd2luZG93IC9cbiAgICAvLyAgIG1lc3NhZ2UtYnVzIC8gc2hhcmUtdGFyZ2V0LXBpY2tlciAvIGFuYWx5dGljcyAvIHV0aWwgLyBwZXJtaXNzaW9uIC8gc3RvcmUgLyAuLi5cdUZGMDlcbiAgICAvLyAgIFx1NTNFQVx1NjUxNCBAbGluZS9saWZmIFx1NjcwM1x1OEI5MyBzdWItcGFja2FnZSBcdTg0M0RcdTUyMzAgdmVuZG9yIGNhdGNoLWFsbCBcdTIxOTIgYWRtaW4gLyBwb3J0YWwgXHU1MTY1XHU1M0UzXG4gICAgLy8gICBcdTg4QUJcdThGRUJcdTU5MUFcdThGMDkgfjI1IEtCIGd6XHUzMDAyXHU3NTI4IC9ub2RlX21vZHVsZXMvQGxpZmYvIFx1ODAwQ1x1OTc1RSBAbGlmZi8gXHU5MDdGXHU1MTREIHNyYy8gXHU1MTY3XHU1MjI1XHU1NDBEXHU4QUE0XHU1NDdEXHU0RTJEXHUzMDAyXG4gICAgaWYgKFxuICAgICAgICBpZC5pbmNsdWRlcygnL3NyYy9wYXJlbnQvJykgfHxcbiAgICAgICAgaWQuaW5jbHVkZXMoJ0BsaW5lL2xpZmYnKSB8fFxuICAgICAgICBpZC5pbmNsdWRlcygnL25vZGVfbW9kdWxlcy9AbGlmZi8nKVxuICAgICkge1xuICAgICAgICByZXR1cm4gJ3BhcmVudC1hcHAnXG4gICAgfVxuXG4gICAgLy8gQTI6IFx1NTE2Q1x1OTU4Qlx1NTgzMVx1NTQwRFx1OTgwMVx1RkYwOHB1YmxpYy5odG1sIGVudHJ5XHVGRjA5c2hlbGwgKyByb3V0ZXIgKyBkZXNpZ24tdG9rZW5zLlxuICAgIC8vIFx1NEUwRFx1NjUzRSBhZG1pbiAvIHBhcmVudFx1RkYxQlx1NjcyQVx1NzY3Qlx1NTE2NVx1NUJCNlx1OTU3N1x1NEUwRFx1NEUwQlx1OEYwOSBhZG1pbi1jb3JlIC8gYWN0aXZpdHktYWRtaW4gXHU2NTc0XHU1MzA1XHUzMDAyXG4gICAgLy8gdmlld3MvcHVibGljLyogXHU3NTMxIHJvdXRlciBsYXp5IGR5bmFtaWMgaW1wb3J0IFx1ODQzRCBBY3Rpdml0eVB1YmxpY1ZpZXcgXHU1NDA0XHU4MUVBIGNodW5rXHUzMDAyXG4gICAgaWYgKGlkLmluY2x1ZGVzKCcvc3JjL3B1YmxpYy8nKSkge1xuICAgICAgICByZXR1cm4gJ3B1YmxpYy1hcHAnXG4gICAgfVxuXG4gICAgLy8gTGVhZmxldCBcdTU3MzBcdTU3MTZcdTVFQUJcdTUzRUFcdTU3MjggUmVjcnVpdG1lbnRBZGRyZXNzSGVhdG1hcC52dWVcdUZGMDhcdTYyREJcdTc1MUZcdTcxQjFcdTUyOUJcdTU3MTZcdUZGMDlcdTUyRDVcdTYxNEIgaW1wb3J0IFx1NzUyOFx1NTIzMFx1MzAwMlxuICAgIC8vIFx1NEUwRFx1NjJCRFx1NTFGQVx1NjY0Mlx1NjcwMyBmYWxsIHRocm91Z2ggXHU1MjMwIHZlbmRvciBjYXRjaC1hbGwgXHUyMTkyIFx1NjI0MFx1NjcwOVx1NTE2NVx1NTNFM1x1RkYwOGFkbWluIC8gcGFyZW50IC8gcG9ydGFsXHVGRjA5XG4gICAgLy8gXHU5MEZEXHU4OEFCXHU4RkVCXHU4RjA5IDE1MCBLQiByYXcgLyB+NTAgS0IgZ3pcdTMwMDJcbiAgICAvLyBcdTRFMERcdTY1M0UgcGFyZW50LWFwcFx1RkYxQXBhcmVudCBcdTVCOENcdTUxNjhcdTRFMERcdTc1MjhcdTU3MzBcdTU3MTZcdTMwMDJcbiAgICBpZiAoaWQuaW5jbHVkZXMoJy9ub2RlX21vZHVsZXMvbGVhZmxldC8nKSkge1xuICAgICAgICByZXR1cm4gJ2xlYWZsZXQnXG4gICAgfVxuXG4gICAgLy8gRnVsbENhbGVuZGFyIDYgKyA0IHZpZXcgcGx1Z2luICh+MTgwIEtCIHJhdyAvIH42MCBLQiBneikgXHU1M0VBXHU1NzI4IENhbGVuZGFyVmlldy52dWVcbiAgICAvLyBcdTUyRDVcdTYxNEIgaW1wb3J0IFx1NzUyOFx1NTIzMFx1MzAwMlx1NjJCRFx1NTIzMFx1NzM2OFx1N0FDQiBjaHVuayBcdTkwN0ZcdTUxNEQgZmFsbC10aHJvdWdoIFx1NTIzMCB2ZW5kb3JcdUZGMENcbiAgICAvLyBcdThCOTNcdTk3NUVcdTg4NENcdTRFOEJcdTY2QzZcdTk4MDFcdTk3NjJcdUZGMDhhZG1pbiBob21lIC8gZW1wbG95ZWVzIC8gc2FsYXJ5IC4uLlx1RkYwOVx1NEUwRFx1NUZDNVx1OEYwOVx1NTE2NVx1OTAxOVx1NTMwNVx1MzAwMlxuICAgIGlmIChpZC5pbmNsdWRlcygnL25vZGVfbW9kdWxlcy9AZnVsbGNhbGVuZGFyLycpKSB7XG4gICAgICAgIHJldHVybiAnZnVsbGNhbGVuZGFyJ1xuICAgIH1cblxuICAgIGlmIChpZC5pbmNsdWRlcygnY2hhcnQuanMnKSB8fCBpZC5pbmNsdWRlcygndnVlLWNoYXJ0anMnKSkge1xuICAgICAgICByZXR1cm4gJ2NoYXJ0LXZlbmRvcidcbiAgICB9XG5cbiAgICAvLyBBMzogZWNoYXJ0cyBcdTY1NzRcdTUzMDVcdTdEMDQgMzAwIEtCIHJhdyAvIH45NSBLQiBnelx1RkYxQk1lYXN1cmVtZW50Q2hhcnQgXHU1MTY3XHU5MEU4IGR5bmFtaWMgaW1wb3J0XG4gICAgLy8gXHUyMTkyIFx1ODQzRFx1NzM2OFx1N0FDQiBjaHVua1x1RkYwQ1x1NEUwRFx1NjcwM1x1ODhBQiBmYWxsLXRocm91Z2ggXHU2M0E4XHU5MDMyXHU0RTNCIHZlbmRvclx1MzAwMlxuICAgIGlmIChcbiAgICAgICAgaWQuaW5jbHVkZXMoJy9ub2RlX21vZHVsZXMvZWNoYXJ0cy8nKSB8fFxuICAgICAgICBpZC5pbmNsdWRlcygnL25vZGVfbW9kdWxlcy96cmVuZGVyLycpXG4gICAgKSB7XG4gICAgICAgIHJldHVybiAnZWNoYXJ0cydcbiAgICB9XG5cbiAgICBpZiAoaWQuaW5jbHVkZXMoJ2VsZW1lbnQtcGx1cycpIHx8IGlkLmluY2x1ZGVzKCdAZWxlbWVudC1wbHVzJykpIHtcbiAgICAgICAgcmV0dXJuICdlbGVtZW50LXBsdXMnXG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgICBpZC5pbmNsdWRlcygnL25vZGVfbW9kdWxlcy92dWUvJykgfHxcbiAgICAgICAgaWQuaW5jbHVkZXMoJy9ub2RlX21vZHVsZXMvQHZ1ZS8nKSB8fFxuICAgICAgICBpZC5pbmNsdWRlcygnL25vZGVfbW9kdWxlcy9waW5pYS8nKSB8fFxuICAgICAgICBpZC5pbmNsdWRlcygnL25vZGVfbW9kdWxlcy92dWUtcm91dGVyLycpXG4gICAgKSB7XG4gICAgICAgIHJldHVybiAndnVlLWNvcmUnXG4gICAgfVxuXG4gICAgaWYgKGlkLmluY2x1ZGVzKCdub2RlX21vZHVsZXMnKSkge1xuICAgICAgICByZXR1cm4gJ3ZlbmRvcidcbiAgICB9XG59XG5cbi8vIGh0dHBzOi8vdml0ZWpzLmRldi9jb25maWcvXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICAgIHBsdWdpbnM6IFtcbiAgICAgICAgdnVlKCksXG4gICAgICAgIEF1dG9JbXBvcnQoe1xuICAgICAgICAgICAgcmVzb2x2ZXJzOiBbRWxlbWVudFBsdXNSZXNvbHZlcigpXSxcbiAgICAgICAgICAgIGR0czogdHJ1ZSxcbiAgICAgICAgfSksXG4gICAgICAgIENvbXBvbmVudHMoe1xuICAgICAgICAgICAgcmVzb2x2ZXJzOiBbRWxlbWVudFBsdXNSZXNvbHZlcigpXSxcbiAgICAgICAgICAgIGR0czogdHJ1ZSxcbiAgICAgICAgfSksXG4gICAgICAgIFZpdGVQV0Eoe1xuICAgICAgICAgICAgcmVnaXN0ZXJUeXBlOiAnYXV0b1VwZGF0ZScsICAgICAgICAgIC8vIFx1NjcwOVx1NjVCMFx1NzI0OFx1NjcyQ1x1NjY0Mlx1ODFFQVx1NTJENVx1NjZGNFx1NjVCMCBTV1xuICAgICAgICAgICAgLy8gXHU0RTBEXHU2NTNFIGltYWdlcy9pdnkta2lkcy1sb2FkaW5nLnBuZ1x1RkYwODMyNCBLQlx1RkYwOVx1RkYxQVx1NjUzRVx1OTAzMiBpbmNsdWRlQXNzZXRzIFx1NjcwM1x1ODhBQiBTV1xuICAgICAgICAgICAgLy8gXHU1NzI4IGluc3RhbGwgXHU5NjhFXHU2QkI1XHU2NDM2XHU0RTBCXHU4RjA5XHVGRjBDXHU4MjA3XHU5OTk2XHU1QzRGIEFQSSBcdTdBRjZcdTcyMkRcdTk4M0JcdTVCRUNcdUZGMUJcdTY1MzkgcnVudGltZSBcdTYyNERcdThGMDlcdTUxNjVcdTMwMDJcbiAgICAgICAgICAgIC8vIFx1NTcxNlx1NkE5NFx1NEVDRFx1NzUzMSB2aXRlIFx1ODFFQVx1NTJENVx1ODkwN1x1ODhGRCBwdWJsaWMvIFx1NEUwQlx1NTIzMCBkaXN0XHVGRjBDQXBwLnZ1ZSBcdTc1MjhcdTUyMzBcdTY2NDJcdTUzNzNcdTUzRUZcdTUzRDZcdTVGOTdcdTMwMDJcbiAgICAgICAgICAgIGluY2x1ZGVBc3NldHM6IFsnZmF2aWNvbi5pY28nLCAnTE9HTy5wbmcnLCAnYXBwbGUtdG91Y2gtaWNvbi0xODB4MTgwLnBuZycsICdsb2dvLnN2ZyddLFxuXG4gICAgICAgICAgICBtYW5pZmVzdDoge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdcdTVFMzhcdTY2MjVcdTg1RTRcdTdCQTFcdTc0MDZcdTdDRkJcdTdENzEnLFxuICAgICAgICAgICAgICAgIHNob3J0X25hbWU6ICdcdTVFMzhcdTY2MjVcdTg1RTRcdTdCQTFcdTc0MDYnLFxuICAgICAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnXHU1RTM4XHU2NjI1XHU4NUU0XHU1RTdDXHU1MTUyXHU1NzEyXHU3QkExXHU3NDA2XHU4MjA3XHU2NTU5XHU1RTJCXHU1MTY1XHU1M0UzXHU3Q0ZCXHU3RDcxJyxcbiAgICAgICAgICAgICAgICB0aGVtZV9jb2xvcjogJyMzZjdkNDgnLFxuICAgICAgICAgICAgICAgIGJhY2tncm91bmRfY29sb3I6ICcjZmZmZmZmJyxcbiAgICAgICAgICAgICAgICBkaXNwbGF5OiAnc3RhbmRhbG9uZScsXG4gICAgICAgICAgICAgICAgb3JpZW50YXRpb246ICdwb3J0cmFpdCcsXG4gICAgICAgICAgICAgICAgc3RhcnRfdXJsOiAnLi8nLFxuICAgICAgICAgICAgICAgIHNjb3BlOiAnLi8nLFxuICAgICAgICAgICAgICAgIGljb25zOiBbXG4gICAgICAgICAgICAgICAgICAgIHsgc3JjOiAncHdhLTY0eDY0LnBuZycsIHNpemVzOiAnNjR4NjQnLCB0eXBlOiAnaW1hZ2UvcG5nJyB9LFxuICAgICAgICAgICAgICAgICAgICB7IHNyYzogJ3B3YS0xOTJ4MTkyLnBuZycsIHNpemVzOiAnMTkyeDE5MicsIHR5cGU6ICdpbWFnZS9wbmcnIH0sXG4gICAgICAgICAgICAgICAgICAgIHsgc3JjOiAncHdhLTUxMng1MTIucG5nJywgc2l6ZXM6ICc1MTJ4NTEyJywgdHlwZTogJ2ltYWdlL3BuZycgfSxcbiAgICAgICAgICAgICAgICAgICAgeyBzcmM6ICdtYXNrYWJsZS1pY29uLTUxMng1MTIucG5nJywgc2l6ZXM6ICc1MTJ4NTEyJyxcbiAgICAgICAgICAgICAgICAgICAgICB0eXBlOiAnaW1hZ2UvcG5nJywgcHVycG9zZTogJ21hc2thYmxlJyB9LFxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICB3b3JrYm94OiB7XG4gICAgICAgICAgICAgICAgLy8gXHU2NUIwIFNXIFx1NEUwMFx1NUMzMVx1N0REMlx1NUMzMVx1NjNBNVx1N0JBMVx1RkYwQ1x1OTA3Rlx1NTE0RFx1ODIwQSBTVyBcdTdFN0NcdTdFOENcdTY1MTRcdTYyMkFcdTUyMzBcdTVERjJcdTRFMERcdTVCNThcdTU3MjhcdTc2ODQgY2h1bmsgaGFzaCBcdTIxOTIgNDA0IFx1NzY3RFx1NUM0Rlx1MzAwMlxuICAgICAgICAgICAgICAgIC8vIFx1ODIwNyBib290LXRpbWUgY2h1bmstZmFpbCBcdTgxRUFcdTY1NTFcdUZGMDhtYWluLmpzXHVGRjA5XHU1NDA4XHU0RjVDXHVGRjFBXHU5NkQ5XHU0RkREXHU5NkFBXHU5MDdGXHU1MTREIFBXQSBcdTUzNDdcdTdEMUFcdTUzNjFcdTRGNEZcdTMwMDJcbiAgICAgICAgICAgICAgICBza2lwV2FpdGluZzogdHJ1ZSxcbiAgICAgICAgICAgICAgICBjbGllbnRzQ2xhaW06IHRydWUsXG4gICAgICAgICAgICAgICAgLy8gXHU1M0VBXHU5ODEwXHU1RkVCXHU1M0Q2IGFwcCBzaGVsbCBcdTgyMDdcdTY4MzhcdTVGQzMgdmVuZG9yXHVGRjFCXHU1OTI3XHU1NzhCIHJvdXRlIGNodW5rIFx1ODIwN1x1NTcxNlx1NzI0N1x1NjUzOVx1NzUzMSBydW50aW1lIGNhY2hlIFx1NjNBNVx1NjI0QlxuICAgICAgICAgICAgICAgIC8vIG11bHRpLXBhZ2UgXHU1RjhDXHU3QkExXHU3NDA2XHU3QUVGIGVudHJ5IFx1NjYyRiBtYWluLSouanNcdUZGMENcdTVCQjZcdTk1NzcgQXBwIFx1NjYyRiBwYXJlbnQtYXBwLSouanNcdUZGMDhcdThENzAgcnVudGltZSBjYWNoZVx1RkYwOVxuICAgICAgICAgICAgICAgIGdsb2JQYXR0ZXJuczogW1xuICAgICAgICAgICAgICAgICAgICAnaW5kZXguaHRtbCcsXG4gICAgICAgICAgICAgICAgICAgICdyZWdpc3RlclNXLmpzJyxcbiAgICAgICAgICAgICAgICAgICAgJ21hbmlmZXN0LndlYm1hbmlmZXN0JyxcbiAgICAgICAgICAgICAgICAgICAgJ2Fzc2V0cy9tYWluLSouY3NzJyxcbiAgICAgICAgICAgICAgICAgICAgJ2Fzc2V0cy9tYWluLSouanMnLFxuICAgICAgICAgICAgICAgICAgICAnYXNzZXRzL3Z1ZS1jb3JlLSouanMnLFxuICAgICAgICAgICAgICAgICAgICAnYXNzZXRzL3ZlbmRvci0qLmpzJyxcbiAgICAgICAgICAgICAgICAgICAgJ2Fzc2V0cy9zaGFyZWQtY29tbW9uLSouanMnLFxuICAgICAgICAgICAgICAgICAgICAnYXNzZXRzL3NoYXJlZC1jb21tb24tKi5jc3MnLFxuICAgICAgICAgICAgICAgICAgICAnKi57aWNvLHN2Z30nLFxuICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgLy8gXHU2MzkyXHU5NjY0XHU1OTI3XHU1NzhCIFBXQSBcdTU3MTZcdTc5M0FcdUZGMDhcdTc1MzEgbWFuaWZlc3QgXHU2MzA5XHU5NzAwXHU4RjA5XHU1MTY1XHVGRjA5XHU4MjA3IGNoYXJ0LXZlbmRvclxuICAgICAgICAgICAgICAgIGdsb2JJZ25vcmVzOiBbXG4gICAgICAgICAgICAgICAgICAgICdhc3NldHMvY2hhcnQtdmVuZG9yLSouanMnLFxuICAgICAgICAgICAgICAgICAgICAnKiovKjUxMionLFxuICAgICAgICAgICAgICAgIF0sXG5cbiAgICAgICAgICAgICAgICAvLyBoYXNoIHJvdXRpbmdcdUZGMUFcdTYyNDBcdTY3MDkgU1BBIFx1NTE2N1x1NUMwRVx1ODIyQVx1NTZERVx1NTBCMyBpbmRleC5odG1sXHVGRjFCXG4gICAgICAgICAgICAgICAgLy8gXHU1QkI2XHU5NTc3IEFwcCBcdTY2MkZcdTUzRTZcdTRFMDBcdTUwMEJcdTczNjhcdTdBQ0IgSFRNTFx1RkYwQ1x1NUZDNVx1OTgwOFx1NjM5Mlx1OTY2NFx1OTA3Rlx1NTE0RFx1ODhBQlx1NUMwRVx1NTQxMVx1N0JBMVx1NzQwNlx1N0FFRlxuICAgICAgICAgICAgICAgIG5hdmlnYXRlRmFsbGJhY2s6ICdpbmRleC5odG1sJyxcbiAgICAgICAgICAgICAgICBuYXZpZ2F0ZUZhbGxiYWNrRGVueWxpc3Q6IFsvXlxcL3BhcmVudFxcLmh0bWwvLCAvXlxcL3BhcmVudFxcLy9dLFxuXG4gICAgICAgICAgICAgICAgcnVudGltZUNhY2hpbmc6IFtcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXJsUGF0dGVybjogKHsgdXJsLCByZXF1ZXN0IH0pID0+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXJsLm9yaWdpbiA9PT0gc2VsZi5sb2NhdGlvbi5vcmlnaW4gJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cmwucGF0aG5hbWUuc3RhcnRzV2l0aCgnL2Fzc2V0cy8nKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsnc2NyaXB0JywgJ3N0eWxlJywgJ2ZvbnQnXS5pbmNsdWRlcyhyZXF1ZXN0LmRlc3RpbmF0aW9uKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGhhbmRsZXI6ICdTdGFsZVdoaWxlUmV2YWxpZGF0ZScsXG4gICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FjaGVOYW1lOiAnYXBwLXN0YXRpYy1hc3NldHMnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4cGlyYXRpb246IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWF4RW50cmllczogODAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCAqIDcsIC8vIDcgXHU1OTI5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWNoZWFibGVSZXNwb25zZTogeyBzdGF0dXNlczogWzIwMF0gfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIC8vIC9pbWFnZXMvKlx1RkYxQVx1NzlGQlx1NTFGQSBwcmVjYWNoZVx1RkYwOFx1OTA3Rlx1NTE0RCBTVyBpbnN0YWxsIFx1NTM2MVx1OTgzQlx1NUJFQ1x1RkYwOVx1NUY4Q1x1NEVDRFx1OEQ3MCBjYWNoZVx1RkYwQ1xuICAgICAgICAgICAgICAgICAgICAvLyBcdTdCMkNcdTRFMDBcdTZCMjFcdThGMDlcdTUxNjVcdTVGOEMgcmVsb2FkIFx1NEUwRFx1NTE4RFx1OTFDRFx1NjI5MyAzMjQgS0IgXHU3Njg0IGxvYWRpbmcgXHU1NzE2XHUzMDAyXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHVybFBhdHRlcm46ICh7IHVybCwgcmVxdWVzdCB9KSA9PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVybC5vcmlnaW4gPT09IHNlbGYubG9jYXRpb24ub3JpZ2luICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXJsLnBhdGhuYW1lLnN0YXJ0c1dpdGgoJy9pbWFnZXMvJykgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXF1ZXN0LmRlc3RpbmF0aW9uID09PSAnaW1hZ2UnLFxuICAgICAgICAgICAgICAgICAgICAgICAgaGFuZGxlcjogJ0NhY2hlRmlyc3QnLFxuICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9uczoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhY2hlTmFtZTogJ2FwcC1pbWFnZXMnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4cGlyYXRpb246IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWF4RW50cmllczogMjAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCAqIDMwLCAvLyAzMCBcdTU5MjlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhY2hlYWJsZVJlc3BvbnNlOiB7IHN0YXR1c2VzOiBbMjAwXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgLy8gUG9ydGFsIFx1OUVERVx1NTQwRCBHRVRcdUZGMUFcdTk2RTJcdTdEREFcdTRFQ0RcdTgwRkRcdTc3MEJcdTUyMzBcdTU0MERcdTU1QUVcdUZGMDhcdTY1NTlcdTVFMkJcdTU4MzRcdTY2NkZcdTRFM0JcdTdEREFcdUZGMDlcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXJsUGF0dGVybjogKHsgdXJsLCByZXF1ZXN0IH0pID0+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXJsLnBhdGhuYW1lLnN0YXJ0c1dpdGgoJy9hcGkvcG9ydGFsL215LWNsYXNzLWF0dGVuZGFuY2UnKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlcXVlc3QubWV0aG9kID09PSAnR0VUJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGhhbmRsZXI6ICdTdGFsZVdoaWxlUmV2YWxpZGF0ZScsXG4gICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FjaGVOYW1lOiAncG9ydGFsLWNsYXNzLWF0dGVuZGFuY2UnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4cGlyYXRpb246IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWF4RW50cmllczogNjAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCwgLy8gMSBcdTU5MjlcdUZGMDhcdThERThcdTY1RTVcdTlFREVcdTU0MERcdTc1MjhcdUZGMDlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhY2hlYWJsZVJlc3BvbnNlOiB7IHN0YXR1c2VzOiBbMjAwXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgLy8gUG9ydGFsIFx1NzNFRFx1N0QxQS9cdTVCNzhcdTc1MUZcdTZFMDVcdTU1QUVcdUZGMUFcdTU0MkJcdTVCNzhcdTc1MUZcdTUwMEJcdThDQzcgXHUyMTkyIE5ldHdvcmtGaXJzdFx1RkYwQ1x1OTZFMlx1N0REQVx1NjI0RFx1OEQ3MFx1NUZFQlx1NTNENlxuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1cmxQYXR0ZXJuOiAoeyB1cmwsIHJlcXVlc3QgfSkgPT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cmwucGF0aG5hbWUgPT09ICcvYXBpL3BvcnRhbC9teS1zdHVkZW50cycgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXF1ZXN0Lm1ldGhvZCA9PT0gJ0dFVCcsXG4gICAgICAgICAgICAgICAgICAgICAgICBoYW5kbGVyOiAnTmV0d29ya0ZpcnN0JyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWNoZU5hbWU6ICdwb3J0YWwtbXktc3R1ZGVudHMnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldHdvcmtUaW1lb3V0U2Vjb25kczogNSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1heEVudHJpZXM6IDUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCwgLy8gMSBcdTU5MjlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhY2hlYWJsZVJlc3BvbnNlOiB7IHN0YXR1c2VzOiBbMjAwXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgLy8gUG9ydGFsIFx1NjU0Rlx1NjExRlx1NTUyRlx1OEI4MFx1OENDN1x1NjU5OVx1RkYwOFx1ODVBQVx1OENDN1x1MzAwMVx1NzNFRFx1N0QxQVx1NTFGQVx1NUUyRFx1MzAwMVx1NTAwQlx1NEVCQVx1NTA0N1x1NTIyNS9cdTUyQTBcdTczRURcdUZGMDlcdUZGMUFOZXR3b3JrRmlyc3QgXHU5NjREXHU0RjRFXHU1MTcxXHU0RUFCXHU4OEREXHU3RjZFXHU2Qjk4XHU3NTU5XG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHVybFBhdHRlcm46ICh7IHVybCwgcmVxdWVzdCB9KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlcXVlc3QubWV0aG9kICE9PSAnR0VUJykgcmV0dXJuIGZhbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcCA9IHVybC5wYXRobmFtZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHAuc3RhcnRzV2l0aCgnL2FwaS9wb3J0YWwvc2FsYXJ5LXByZXZpZXcnKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwLnN0YXJ0c1dpdGgoJy9hcGkvcG9ydGFsL2F0dGVuZGFuY2Utc2hlZXQnKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwLnN0YXJ0c1dpdGgoJy9hcGkvcG9ydGFsL215LWxlYXZlcycpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHAuc3RhcnRzV2l0aCgnL2FwaS9wb3J0YWwvbXktb3ZlcnRpbWVzJykgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcC5zdGFydHNXaXRoKCcvYXBpL3BvcnRhbC9teS1zY2hlZHVsZScpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGhhbmRsZXI6ICdOZXR3b3JrRmlyc3QnLFxuICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9uczoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhY2hlTmFtZTogJ3BvcnRhbC1zZW5zaXRpdmUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldHdvcmtUaW1lb3V0U2Vjb25kczogNSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1heEVudHJpZXM6IDMwLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXhBZ2VTZWNvbmRzOiA2MCAqIDYwICogMiwgLy8gMiBcdTVDMEZcdTY2NDJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhY2hlYWJsZVJlc3BvbnNlOiB7IHN0YXR1c2VzOiBbMjAwXSB9LCAgLy8gXHU0RTBEXHU1RkVCXHU1M0Q2IDQwMS80MDMvMFxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgLy8gXHU1MTZDXHU1NDRBXHUzMDAxXHU4ODRDXHU0RThCXHU2NkM2XHU3QjQ5XHU0RjRFXHU2NTRGXHU1MTY3XHU1QkI5XHVGRjFBXHU0RkREXHU3NTU5IFN0YWxlV2hpbGVSZXZhbGlkYXRlIFx1NjNEMFx1NEY5Qlx1OTZFMlx1N0REQVx1OUFENFx1OUE1N1xuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1cmxQYXR0ZXJuOiAoeyB1cmwsIHJlcXVlc3QgfSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXF1ZXN0Lm1ldGhvZCAhPT0gJ0dFVCcpIHJldHVybiBmYWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHAgPSB1cmwucGF0aG5hbWVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwLnN0YXJ0c1dpdGgoJy9hcGkvcG9ydGFsL2Fubm91bmNlbWVudHMnKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwLnN0YXJ0c1dpdGgoJy9hcGkvcG9ydGFsL2NhbGVuZGFyJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgaGFuZGxlcjogJ1N0YWxlV2hpbGVSZXZhbGlkYXRlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWNoZU5hbWU6ICdwb3J0YWwtcHVibGljJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1heEVudHJpZXM6IDIwLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXhBZ2VTZWNvbmRzOiA2MCAqIDYwICogMTIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWNoZWFibGVSZXNwb25zZTogeyBzdGF0dXNlczogWzIwMF0gfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIC8vIFx1NTE3Nlx1NEVENiBQb3J0YWwgR0VUIEFQSVx1RkYxQU5ldHdvcmtGaXJzdFx1RkYwQ1x1OTA3Rlx1NTE0RFx1NjcyQVx1NzdFNVx1NjU0Rlx1NjExRlx1N0FFRlx1OUVERVx1ODhBQlx1OTgxMFx1OEEyRFx1NUZFQlx1NTNENlxuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICB1cmxQYXR0ZXJuOiAoeyB1cmwsIHJlcXVlc3QgfSkgPT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cmwucGF0aG5hbWUuc3RhcnRzV2l0aCgnL2FwaS9wb3J0YWwnKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlcXVlc3QubWV0aG9kID09PSAnR0VUJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGhhbmRsZXI6ICdOZXR3b3JrRmlyc3QnLFxuICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9uczoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhY2hlTmFtZTogJ3BvcnRhbC1hcGknLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldHdvcmtUaW1lb3V0U2Vjb25kczogNSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1heEVudHJpZXM6IDMwLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXhBZ2VTZWNvbmRzOiA2MCAqIDYwICogMixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhY2hlYWJsZVJlc3BvbnNlOiB7IHN0YXR1c2VzOiBbMjAwXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIFx1NUJCNlx1OTU3N1x1N0FFRiAvYXBpL3BhcmVudC8qIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuICAgICAgICAgICAgICAgICAgICAvLyBcdTVCQjZcdTk1NzdcdTk5OTZcdTk4MDFcdTVGNTlcdTdFM0RcdUZGMUFcdTUwMEJcdThDQzcgKyBcdTY0NThcdTg5ODEgXHUyMTkyIE5ldHdvcmtGaXJzdFx1RkYwQzMgXHU3OUQyIHRpbWVvdXQgXHU1MTVDXHU5NkUyXHU3RERBXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHVybFBhdHRlcm46ICh7IHVybCwgcmVxdWVzdCB9KSA9PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVybC5wYXRobmFtZSA9PT0gJy9hcGkvcGFyZW50L2hvbWUvc3VtbWFyeScgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXF1ZXN0Lm1ldGhvZCA9PT0gJ0dFVCcsXG4gICAgICAgICAgICAgICAgICAgICAgICBoYW5kbGVyOiAnTmV0d29ya0ZpcnN0JyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWNoZU5hbWU6ICdwYXJlbnQtaG9tZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV0d29ya1RpbWVvdXRTZWNvbmRzOiAzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4cGlyYXRpb246IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWF4RW50cmllczogNSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWF4QWdlU2Vjb25kczogNjAgKiA2MCAqIDIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWNoZWFibGVSZXNwb25zZTogeyBzdGF0dXNlczogWzIwMF0gfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIC8vIFx1NUJCNlx1OTU3N1x1NTAwQlx1OENDNyAvIFx1NUI1MFx1NTk3M1x1NkUwNVx1NTVBRVx1RkYxQVx1NTQyQlx1NTAwQlx1OENDNyBcdTIxOTIgTmV0d29ya0ZpcnN0XG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHVybFBhdHRlcm46ICh7IHVybCwgcmVxdWVzdCB9KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlcXVlc3QubWV0aG9kICE9PSAnR0VUJykgcmV0dXJuIGZhbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcCA9IHVybC5wYXRobmFtZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHAgPT09ICcvYXBpL3BhcmVudC9tZScgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcCA9PT0gJy9hcGkvcGFyZW50L215LWNoaWxkcmVuJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBoYW5kbGVyOiAnTmV0d29ya0ZpcnN0JyxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWNoZU5hbWU6ICdwYXJlbnQtcHJvZmlsZScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV0d29ya1RpbWVvdXRTZWNvbmRzOiA1LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4cGlyYXRpb246IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWF4RW50cmllczogNSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWF4QWdlU2Vjb25kczogNjAgKiA2MCAqIDI0LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FjaGVhYmxlUmVzcG9uc2U6IHsgc3RhdHVzZXM6IFsyMDBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAvLyBcdTVCQjZcdTk1NzdcdTdBRUZcdTY1NEZcdTYxMUZcdTU1MkZcdThCODBcdUZGMDhcdTUxRkFcdTVFMkQgLyBcdThDQkJcdTc1MjggLyBcdThBQ0JcdTUwNDcgLyBcdTYyNERcdTg1REQgLyBcdTRFOEJcdTRFRjZcdUZGMDlcdUZGMUFOZXR3b3JrRmlyc3RcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXJsUGF0dGVybjogKHsgdXJsLCByZXF1ZXN0IH0pID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVxdWVzdC5tZXRob2QgIT09ICdHRVQnKSByZXR1cm4gZmFsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwID0gdXJsLnBhdGhuYW1lXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcC5zdGFydHNXaXRoKCcvYXBpL3BhcmVudC9hdHRlbmRhbmNlJykgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcC5zdGFydHNXaXRoKCcvYXBpL3BhcmVudC9mZWVzJykgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcC5zdGFydHNXaXRoKCcvYXBpL3BhcmVudC9zdHVkZW50LWxlYXZlcycpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHAuc3RhcnRzV2l0aCgnL2FwaS9wYXJlbnQvYWN0aXZpdHknKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwLnN0YXJ0c1dpdGgoJy9hcGkvcGFyZW50L2V2ZW50cycpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGhhbmRsZXI6ICdOZXR3b3JrRmlyc3QnLFxuICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9uczoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhY2hlTmFtZTogJ3BhcmVudC1zZW5zaXRpdmUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldHdvcmtUaW1lb3V0U2Vjb25kczogNSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1heEVudHJpZXM6IDQwLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXhBZ2VTZWNvbmRzOiA2MCAqIDYwICogMixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhY2hlYWJsZVJlc3BvbnNlOiB7IHN0YXR1c2VzOiBbMjAwXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgLy8gXHU1MTZDXHU1NDRBXHVGRjA4XHU1QkI2XHU5NTc3IHNjb3BlXHVGRjA5XHVGRjFBU3RhbGVXaGlsZVJldmFsaWRhdGVcdUZGMENcdTk2RTJcdTdEREFcdTlBRDRcdTlBNTdcdTY3MDBcdTUxMkFcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXJsUGF0dGVybjogKHsgdXJsLCByZXF1ZXN0IH0pID0+XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXJsLnBhdGhuYW1lLnN0YXJ0c1dpdGgoJy9hcGkvcGFyZW50L2Fubm91bmNlbWVudHMnKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlcXVlc3QubWV0aG9kID09PSAnR0VUJyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGhhbmRsZXI6ICdTdGFsZVdoaWxlUmV2YWxpZGF0ZScsXG4gICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FjaGVOYW1lOiAncGFyZW50LXB1YmxpYycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhwaXJhdGlvbjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXhFbnRyaWVzOiAxMCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWF4QWdlU2Vjb25kczogNjAgKiA2MCAqIDEyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FjaGVhYmxlUmVzcG9uc2U6IHsgc3RhdHVzZXM6IFsyMDBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAvLyBcdTUxNzZcdTRFRDYgL2FwaS9wYXJlbnQvKiBHRVRcdUZGMUFOZXR3b3JrRmlyc3QgXHU1MTVDXHU1RTk1XHVGRjA4XHU5MDdGXHU1MTREXHU2NUIwXHU3QUVGXHU5RURFXHU2MTBGXHU1OTE2XHU4OEFCXHU5ODEwXHU4QTJEXHU1RkVCXHU1M0Q2XHVGRjA5XG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHVybFBhdHRlcm46ICh7IHVybCwgcmVxdWVzdCB9KSA9PlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVybC5wYXRobmFtZS5zdGFydHNXaXRoKCcvYXBpL3BhcmVudCcpICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVxdWVzdC5tZXRob2QgPT09ICdHRVQnLFxuICAgICAgICAgICAgICAgICAgICAgICAgaGFuZGxlcjogJ05ldHdvcmtGaXJzdCcsXG4gICAgICAgICAgICAgICAgICAgICAgICBvcHRpb25zOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FjaGVOYW1lOiAncGFyZW50LWFwaS1mYWxsYmFjaycsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV0d29ya1RpbWVvdXRTZWNvbmRzOiA1LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4cGlyYXRpb246IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWF4RW50cmllczogMzAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1heEFnZVNlY29uZHM6IDYwICogNjAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWNoZWFibGVSZXNwb25zZTogeyBzdGF0dXNlczogWzIwMF0gfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIC8vIFx1NkNFOFx1NjEwRlx1RkYxQVBPU1RcdUZGMDhcdThBQ0JcdTUwNDcvXHU1MkEwXHU3M0VEXHU3NTMzXHU4QUNCXHVGRjA5XHU3NTMxIFdvcmtib3ggXHU5ODEwXHU4QTJEXHU2MzkyXHU5NjY0XHVGRjBDXHU0RTBEXHU2NzAzXHU1RkVCXHU1M0Q2XG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0pLFxuICAgICAgICAvLyBTZW50cnkgc291cmNlIG1hcCBcdTRFMEFcdTUwQjNcdUZGMUFcdTY1M0VcdTY3MDBcdTVGOENcdTRFMDBcdTUwMEIgcGx1Z2luXHVGRjBDXHU3OEJBXHU0RkREXHU3NzBCXHU1MjMwIFZpdGVQV0EgXHU3NTIyXHU1MUZBXHU3Njg0XHU2NzAwXHU3RDQyIGJ1bmRsZVxuICAgICAgICAvLyBcdUZGMDhQV0EgXHU1NzI4XHU1MjREXHU4MEZEXHU5MDdGXHU1MTREIFNXIHByZWNhY2hlIG1hbmlmZXN0IFx1NjI4QSAubWFwIFx1NjUzNlx1OTAzMlx1NTNCQlx1RkYwOVx1MzAwMlx1NTNFQVx1NTcyOFxuICAgICAgICAvLyBTRU5UUllfQVVUSF9UT0tFTi9PUkcvUFJPSkVDVCBcdTRFMDlcdTgwMDVcdTkwRkRcdThBMkRcdTU5N0RcdTY2NDJcdTVCRTZcdTk2OUIgdXBsb2FkXHVGRjFCZGlzYWJsZT10cnVlXG4gICAgICAgIC8vIFx1NjY0MiBwbHVnaW4gXHU2NjJGIG5vLW9wXHVGRjBDXHU0RTBEXHU2NzAzIGZhaWwgYnVpbGRcdTMwMDJcbiAgICAgICAgc2VudHJ5Vml0ZVBsdWdpbih7XG4gICAgICAgICAgICBvcmc6IHByb2Nlc3MuZW52LlNFTlRSWV9PUkcsXG4gICAgICAgICAgICBwcm9qZWN0OiBwcm9jZXNzLmVudi5TRU5UUllfUFJPSkVDVCxcbiAgICAgICAgICAgIGF1dGhUb2tlbjogcHJvY2Vzcy5lbnYuU0VOVFJZX0FVVEhfVE9LRU4sXG4gICAgICAgICAgICBkaXNhYmxlOiAhU0VOVFJZX1VQTE9BRF9FTkFCTEVELFxuICAgICAgICAgICAgc2lsZW50OiAhU0VOVFJZX1VQTE9BRF9FTkFCTEVELFxuICAgICAgICAgICAgc291cmNlbWFwczoge1xuICAgICAgICAgICAgICAgIC8vIFx1NEUwQVx1NTBCM1x1NjIxMFx1NTI5Rlx1NUY4Q1x1NTIyQVx1NjM4OSAubWFwXHVGRjBDXHU5MDdGXHU1MTREIGRpc3QgXHU1MzA1XHU1NDJCIHNvdXJjZSBtYXAgXHU1OTE2XHU2RDI5XHU3QTBCXHU1RjBGXHU3RDUwXHU2OUNCXG4gICAgICAgICAgICAgICAgZmlsZXNUb0RlbGV0ZUFmdGVyVXBsb2FkOiBbJy4vZGlzdC8qKi8qLm1hcCddLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHJlbGVhc2U6IHtcbiAgICAgICAgICAgICAgICBuYW1lOiBwcm9jZXNzLmVudi5TRU5UUllfUkVMRUFTRSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0pLFxuICAgIF0sXG4gICAgcmVzb2x2ZToge1xuICAgICAgICBhbGlhczoge1xuICAgICAgICAgICAgJ0AnOiBmaWxlVVJMVG9QYXRoKG5ldyBVUkwoJy4vc3JjJywgaW1wb3J0Lm1ldGEudXJsKSlcbiAgICAgICAgfVxuICAgIH0sXG4gICAgYnVpbGQ6IHtcbiAgICAgICAgY2h1bmtTaXplV2FybmluZ0xpbWl0OiA1MDAsXG4gICAgICAgIC8vIFx1N0YzQSBTRU5UUllfQVVUSF9UT0tFTlx1RkYxQXNvdXJjZW1hcD1mYWxzZVx1RkYwOFx1NjVFMlx1NjcwOVx1ODg0Q1x1NzBCQVx1RkYwQ1x1OTA3Rlx1NTE0RCBkaXN0IFx1NTQyQiAubWFwXHVGRjA5XHUzMDAyXG4gICAgICAgIC8vIFx1NjcwOSB0b2tlblx1RkYxQXNvdXJjZW1hcD0naGlkZGVuJ1x1RkYwOFx1NzUyMiBtYXAgXHU0RjQ2IGJ1bmRsZSBcdTY3MkJcdTVDM0VcdTRFMERcdTVCRUIgLy8jIHNvdXJjZU1hcHBpbmdVUkwgXHU1RjE1XHU3NTI4XHVGRjBDXG4gICAgICAgIC8vIFx1NEU0Qlx1NUY4Q1x1NzUzMSBzZW50cnlWaXRlUGx1Z2luIFx1NEUwQVx1NTBCM1x1NEUyNlx1NEY5RCBmaWxlc1RvRGVsZXRlQWZ0ZXJVcGxvYWQgXHU1MjJBXHU5NjY0XHUzMDAyXG4gICAgICAgIHNvdXJjZW1hcDogU0VOVFJZX1VQTE9BRF9FTkFCTEVEID8gJ2hpZGRlbicgOiBmYWxzZSxcbiAgICAgICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgICAgICAgLy8gbXVsdGktcGFnZVx1RkYxQVx1N0JBMVx1NzQwNlx1N0FFRiArIFx1NUJCNlx1OTU3NyBMSUZGIEFwcCArIFx1NTE2Q1x1OTU4Qlx1NTgzMVx1NTQwRFx1OTgwMSBcdTRFMDlcdTUwMEJcdTczNjhcdTdBQ0IgZW50cnlcbiAgICAgICAgICAgIC8vIGRldi9wcm9kIFx1OERFRlx1NUY5MVx1RkYxQVxuICAgICAgICAgICAgLy8gICAtIFx1N0JBMVx1NzQwNlx1N0FFRlx1RkYxQS9pbmRleC5odG1sXHVGRjA4aGFzaCBcdTZBMjFcdTVGMEYgIy8uLi5cdUZGMDlcbiAgICAgICAgICAgIC8vICAgLSBcdTVCQjZcdTk1NzcgQXBwXHVGRjFBL3BhcmVudC5odG1sXHVGRjA4aGFzaCBcdTZBMjFcdTVGMEYgIy8uLi5cdUZGMENcdTY1QjlcdTRGQkYgTElGRiBlbmRwb2ludCBVUkwgXHU3NkY0XHU2M0E1XHU3RDgxXHU5MDE5XHU1MDBCXHVGRjA5XG4gICAgICAgICAgICAvLyAgIC0gXHU1MTZDXHU5NThCXHU1ODMxXHU1NDBEXHVGRjFBL3B1YmxpYy5odG1sXHVGRjA4QTIgXHU2MjhBIC9wdWJsaWMvYWN0aXZpdHkqIFx1NjJDNlx1NTFGQVx1RkYwQ1xuICAgICAgICAgICAgLy8gICAgIFx1NjcyQVx1NzY3Qlx1NTE2NVx1NUJCNlx1OTU3N1x1NEUwRFx1NEUwQlx1OEYwOSBhZG1pbi1jb3JlIC8gZWxlbWVudC1wbHVzIC8gYWN0aXZpdHktYWRtaW4gXHU2NTc0XHU1MzA1XHVGRjA5XG4gICAgICAgICAgICBpbnB1dDoge1xuICAgICAgICAgICAgICAgIG1haW46IGZpbGVVUkxUb1BhdGgobmV3IFVSTCgnLi9pbmRleC5odG1sJywgaW1wb3J0Lm1ldGEudXJsKSksXG4gICAgICAgICAgICAgICAgcGFyZW50OiBmaWxlVVJMVG9QYXRoKG5ldyBVUkwoJy4vcGFyZW50Lmh0bWwnLCBpbXBvcnQubWV0YS51cmwpKSxcbiAgICAgICAgICAgICAgICBwdWJsaWM6IGZpbGVVUkxUb1BhdGgobmV3IFVSTCgnLi9wdWJsaWMuaHRtbCcsIGltcG9ydC5tZXRhLnVybCkpLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIG91dHB1dDoge1xuICAgICAgICAgICAgICAgIG1hbnVhbENodW5rcyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgfSxcbiAgICBzZXJ2ZXI6IHtcbiAgICAgICAgcHJveHk6IHtcbiAgICAgICAgICAgICcvYXBpJzoge1xuICAgICAgICAgICAgICAgIHRhcmdldDogJ2h0dHA6Ly8xMjcuMC4wLjE6ODA4OCcsXG4gICAgICAgICAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgICAgICAgICAgIHdzOiB0cnVlLCAgIC8vIFx1OEI5MyAvYXBpL3dzLyogV2ViU29ja2V0IFx1NEU1Rlx1OTAxQVx1OTA0RSBwcm94eVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufSlcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBMlIsU0FBUyxlQUFlLFdBQVc7QUFDOVQsU0FBUyxvQkFBb0I7QUFDN0IsT0FBTyxTQUFTO0FBQ2hCLFNBQVMsZUFBZTtBQUN4QixPQUFPLGdCQUFnQjtBQUN2QixPQUFPLGdCQUFnQjtBQUN2QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHdCQUF3QjtBQVA2SSxJQUFNLDJDQUEyQztBQVcvTixJQUFNLHdCQUF3QixDQUFDLENBQUMsUUFBUSxJQUFJO0FBRTVDLFNBQVMsYUFBYSxJQUFJO0FBTXRCLE1BQUksR0FBRyxTQUFTLDBCQUEwQixHQUFHO0FBQ3pDLFdBQU87QUFBQSxFQUNYO0FBU0EsTUFBSSxHQUFHLFNBQVMscUJBQXFCLEdBQUc7QUFDcEMsV0FBTztBQUFBLEVBQ1g7QUFFQSxNQUFJLENBQUMsR0FBRyxTQUFTLGNBQWMsS0FBSyxDQUFDLEdBQUcsU0FBUyxPQUFPLEdBQUc7QUFDdkQ7QUFBQSxFQUNKO0FBUUEsTUFDSSxHQUFHLFNBQVMsc0JBQXNCLEtBQ2xDLEdBQUcsU0FBUyx5QkFBeUIsS0FDckMsR0FBRyxTQUFTLG9DQUFvQyxLQUNoRCxHQUFHLFNBQVMsNkNBQTZDLEdBQzNEO0FBQ0UsV0FBTztBQUFBLEVBQ1g7QUFnQkEsTUFDSSxHQUFHLFNBQVMsa0JBQWtCLEtBQzlCLEdBQUcsU0FBUyx1QkFBdUIsS0FDbkMsR0FBRyxTQUFTLGdDQUFnQyxLQUM1QyxHQUFHLFNBQVMsOEJBQThCLEtBQzFDLEdBQUcsU0FBUyx3QkFBd0IsS0FDcEMsR0FBRyxTQUFTLG1CQUFtQixLQUMvQixHQUFHLFNBQVMsa0NBQWtDLEtBQzlDLEdBQUcsU0FBUyx5QkFBeUIsS0FDckMsR0FBRyxTQUFTLG9CQUFvQixLQUNoQyxHQUFHLFNBQVMscUJBQXFCLEtBQ2pDLEdBQUcsU0FB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
