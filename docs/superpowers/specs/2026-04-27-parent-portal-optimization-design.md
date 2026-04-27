# 家長端效能優化 — Design

**日期**：2026-04-27
**範圍**：跨前後端（`ivy-frontend/src/parent/` + `ivy-backend/api/parent_portal/`）
**前置討論**：用戶選擇「全部都優化」，採方案 A「先 audit 再規劃」，但隨後授權自主執行；本 spec 將 audit 簡化為內嵌量測、把 5 個優化 phase 一次規劃完。

---

## Baseline 量測（2026-04-27 build 結果）

| chunk | size | gzip |
|---|---|---|
| `parent-app` (含 9 view + LIFF SDK + 所有 store/api/composables) | 44.60 kB | **15.29 kB** |
| `vue-core` | 110.88 kB | 43.19 kB |
| `vendor` | 429.21 kB | 134.29 kB（管理端依賴，家長 App 不全載） |

**結論**：parent-app 已經很小（gzip 15kB），**chunk 細拆與 LIFF lazy load 沒必要做**——細拆只會增加 chunk overhead，反而拖慢首屏。spec 內相關章節移除。

---

## 已驗證的後端能力（advisor 點出後確認）

- ✅ `/api/parent/announcements/unread-count` 已存在（用 `AnnouncementParentRead` 表追蹤已讀）
- ✅ `/api/parent/fees/summary` 已存在（含 totals.outstanding / overdue / due_soon）
- ✅ `/api/parent/events` 回傳含 `need_ack_student_ids`，可推 pending count
- 結論：home/summary 端點仍有意義（從 3-4 RTT 合併成 1 RTT），但實作上**抽 helper reuse 既有 query**，不重新實作

---

## 已驗證的前端基建（不重造輪子）

- ✅ `src/composables/useAsyncState.js` 已有：dedupe + minShowMs + AbortController + inflight 去重
  - 我要做的 SWR cache **wrap 它**而不是另寫一套
- ✅ `src/components/common/LoadingPanel.vue` 行動端可用（無 element-plus 依賴）
- ⚠️ `src/components/common/EmptyState.vue` 用 `<el-icon>`，**家長 App 沒 import element-plus**（main.js 確認），不能直接用
  - → 寫 `MobileEmptyState.vue` + `MobileErrorRetry.vue`（家長與其他無 element-plus 環境共用）
- 測試慣例：`tests/unit/...test.js`（不是 `tests/parent/...spec.js`）

---

## 目標

1. **首屏更快**：parent-app bundle 細拆，HomeView 不必等 LIFF SDK / 才藝/費用模組
2. **切頁更快**：SWR 快取（切回已開過的頁瞬間顯示舊資料 + 背景刷新）、route prefetch
3. **API 更精簡**：彙總端點 `/api/parent/home/summary`，HomeView 一支 API 取代多支
4. **弱網更穩**：vite-plugin-pwa workbox 補上 `/api/parent/*` runtime cache 規則
5. **體驗統一**：抽 `ParentSkeleton` / `ParentEmptyState` / `ParentErrorRetry`，替換 9 個 view 的 inline state-block
6. **後端可觀測**：parent_portal 加 timing middleware（永久保留，dev 印 console、prod 寫 logger.debug），SQL N+1 修補

## 不做（Out of Scope）

- 視覺改版（color / typography / 整體 UI redesign）
- 新功能（推播設定中心、聯絡簿等）
- 教師端 (portal) 與管理端 (admin) 的優化
- 真實 LIFF 環境量測（VITE_LIFF_ID 未填，不具備條件）
- CI 自動跑 Lighthouse（過度設計）

---

## 既有現況（已盤點）

**前端 `src/parent/`**
- 9 view：Login / Bind / BindAdditional / Home / Announcements / Events / Activity / Attendance / Fees / Leaves / More
- 已整合 LIFF（services/liff.js）、有 children store / parentAuth store / ChildSelector
- HomeView 還寫「其他功能開發中」（過期文案）
- 樣式手刻、無共用 design tokens / loading / empty / error pattern
- vite manualChunks 把 `parent-app` 整個一包（含 @line/liff），未按 view 細拆
- vite PWA runtime cache 只覆蓋 `/api/portal/*`（教師端），完全沒 `/api/parent/*` 規則

**後端 `api/parent_portal/`**
- 11 router：activity / announcements / attendance / auth / binding_admin / events / fees / leaves / profile + _shared
- 無 timing middleware、無 N+1 偵測、無彙總端點

---

## 架構

### Phase 0：量測 baseline（簡化）

**A. Bundle 視覺化**
- 加 `rollup-plugin-visualizer` 為 devDep
- vite.config 內 build 時產出 `dist/stats.html`（gzip + brotli size 樹圖）
- 跑 `npm run build` 記錄 baseline：parent-app chunk gzip size

**B. 前端 axios timing**
- `src/parent/api/index.js` axios interceptor：req 進來打 `performance.now()`，response 出去 diff，dev 模式 console.debug、prod 寫 sessionStorage（只保留最後 50 筆，方便 LIFF 內叫出查看）
- 永久保留，無 feature flag 切換成本

**C. 後端 timing middleware**
- 新增 `api/parent_portal/_timing.py`：FastAPI dependency / middleware，計算每 request duration_ms 並 logger.debug
- 落地方式：在 `api/parent_portal/__init__.py` 上注入 router-level dependency，作用範圍限 parent_portal
- 永久保留（不破壞既有測試、不影響 prod 行為）

**驗收**：build 後能看到 `dist/stats.html`、開家長 App 在 console 能看到 `[parent-api] GET /api/parent/me 87ms`、後端 log 能看到 `[parent-timing] GET /api/parent/me/children 42ms`

---

### Phase 1：後端優化

**A. 彙總端點 `/api/parent/home/summary`**

回傳：
```json
{
  "me": { ... },                 // 等同 /api/parent/me
  "children": [ ... ],           // 等同 /api/parent/me/children
  "summary": {
    "unpaid_fees_count": 2,      // 跨所有 children 累計
    "unpaid_fees_total": 12000,
    "unread_announcements_count": 3,
    "pending_events_count": 1    // 待簽閱
  }
}
```

實作：
- 新增 `api/parent_portal/home.py`，注入既有 `_shared.get_current_parent` dependency
- 內部用 SQLAlchemy 一次 query：me + children（既有 helper）+ 三個 count 子查詢（fees / announcements / events）
- pytest：`test_parent_home_summary.py` 涵蓋（家長綁多子女、未繳費 / 公告 / 事件 count 正確、IDOR 阻擋他人 home/summary）

**B. N+1 修補**

掃 11 個 router 的 query：
- `attendance.py` 列表類 query 是否 lazy load student / classroom → 改 `selectinload` / `joinedload`
- `fees.py` 帳單列表載入 student → 同上
- `leaves.py`、`activity.py` 同樣檢查
- 修補後 commit timing middleware log 取一次「修前 / 修後」對照

**C. timing middleware**（Phase 0 已落）

---

### Phase 2：前端切頁體驗

**A. Bundle 細拆**

`vite.config.js` `manualChunks` 內把 parent 拆成：

```js
// 取代原本「parent-app 一包到底」
if (id.includes('@line/liff')) return 'liff-sdk'  // 獨立、HomeView 不必載入
if (id.includes('/src/parent/views/HomeView') ||
    id.includes('/src/parent/views/LoginView') ||
    id.includes('/src/parent/views/BindView')) return 'parent-shell'
if (id.includes('/src/parent/views/AttendanceView')) return 'parent-attendance'
if (id.includes('/src/parent/views/AnnouncementsView') ||
    id.includes('/src/parent/views/EventsView') ||
    id.includes('/src/parent/views/LeavesView')) return 'parent-comm'
if (id.includes('/src/parent/views/FeesView')) return 'parent-fees'
if (id.includes('/src/parent/views/ActivityView')) return 'parent-activity'
if (id.includes('/src/parent/views/MoreView') ||
    id.includes('/src/parent/views/BindAdditionalView')) return 'parent-misc'
if (id.includes('/src/parent/')) return 'parent-shell'  // store / api / layouts / composables
```

LIFF SDK 在 `services/liff.js` 內目前是 top-level import；改為**動態 import + 僅在 LIFF 環境執行**（檢測 `window.liff` 不存在時 lazy load）。

**B. SWR cache composable `useParentResource`**

API：
```js
const { data, loading, error, refresh, isStale } = useParentResource(
  'home/summary',                  // cache key
  () => getHomeSummary(),          // fetcher
  { ttl: 60_000 }                  // 60 秒內視為 fresh
)
```

行為：
- 首次：loading=true、fetch、cache 入 store
- 切回：cache 命中 → 立刻返回舊資料、loading=false、background refetch
- 失敗：保留舊資料 + error 物件、不清空 UI
- store：`stores/parentCache.js`（pinia），key → `{ data, fetchedAt }`，logout 時 clear

**C. 共用元件**

新增 `src/parent/components/`：
- `ParentSkeleton.vue` — props: `lines` (number) / `variant` (`card` / `list` / `text`)
- `ParentEmptyState.vue` — props: `icon`、`message`、slot 額外 action
- `ParentErrorRetry.vue` — props: `error`、`onRetry`，顯示 displayMessage + 重試按鈕

替換 9 個 view 內現存的 `<div class="state-block">` / `<div class="empty">` 重複 pattern。

**D. Route prefetch**

`ParentLayout.vue` tabBar 上每個 tab：
- `@touchstart` / `@mouseenter` 觸發對應 route 的 dynamic import（`router.resolve(name).matched[0].components.default()`）
- 防重複觸發（用 weakset 記已 prefetch）

---

### Phase 3：PWA cache for `/api/parent/*`

`vite.config.js` workbox.runtimeCaching 加：

```js
// 家長首頁彙總：NetworkFirst（含個資與摘要）
{
  urlPattern: ({ url, request }) =>
    url.pathname === '/api/parent/home/summary' && request.method === 'GET',
  handler: 'NetworkFirst',
  options: {
    cacheName: 'parent-home',
    networkTimeoutSeconds: 3,
    expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 2 },
    cacheableResponse: { statuses: [200] },
  },
}
// 家長個資 / 子女：NetworkFirst
{
  urlPattern: ({ url, request }) => {
    if (request.method !== 'GET') return false
    const p = url.pathname
    return p === '/api/parent/me' || p === '/api/parent/me/children' || p.startsWith('/api/parent/profile')
  },
  handler: 'NetworkFirst',
  options: {
    cacheName: 'parent-profile',
    networkTimeoutSeconds: 5,
    expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 },
    cacheableResponse: { statuses: [200] },
  },
}
// 出席 / 費用 / 請假 / 才藝 / 事件：NetworkFirst（含學生個資 / 金錢敏感）
{
  urlPattern: ({ url, request }) => {
    if (request.method !== 'GET') return false
    const p = url.pathname
    return /^\/api\/parent\/(attendance|fees|leaves|activity|events)/.test(p)
  },
  handler: 'NetworkFirst',
  options: {
    cacheName: 'parent-sensitive',
    networkTimeoutSeconds: 5,
    expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 2 },
    cacheableResponse: { statuses: [200] },
  },
}
// 公告：StaleWhileRevalidate
{
  urlPattern: ({ url, request }) =>
    url.pathname.startsWith('/api/parent/announcements') && request.method === 'GET',
  handler: 'StaleWhileRevalidate',
  options: {
    cacheName: 'parent-public',
    expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 12 },
    cacheableResponse: { statuses: [200] },
  },
}
// 其他 /api/parent/* GET：NetworkFirst 兜底（避免新端點意外被預設快取）
{
  urlPattern: ({ url, request }) =>
    url.pathname.startsWith('/api/parent') && request.method === 'GET',
  handler: 'NetworkFirst',
  options: {
    cacheName: 'parent-api-fallback',
    networkTimeoutSeconds: 5,
    expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 },
    cacheableResponse: { statuses: [200] },
  },
}
```

POST（請假申請、活動報名）由 Workbox 預設不快取，無須額外處理。

navigateFallbackDenylist 已正確（不變）。

---

### Phase 4：HomeView 重構

- 移除 footer-note「其他功能開發中」過期文案
- 改用 `useParentResource('home/summary', getHomeSummary)` 取代既有 `Promise.all([getMe, getMyChildren])`
- 新增摘要卡片（在子女區塊之前）：

```
┌─────────────────────────────┐
│  💴 待繳費 2 筆 / NT$ 12,000 │ → /fees
├─────────────────────────────┤
│  📢 未讀公告 3 則            │ → /announcements
├─────────────────────────────┤
│  📝 待簽閱事件 1 件          │ → /events
└─────────────────────────────┘
```

count = 0 時該行隱藏；全 0 時整張卡片隱藏並顯示「目前沒有待辦」靜態訊息。

子女清單區塊改用 ParentSkeleton 在 loading 時顯示。

---

## 資料流

```
parent.html
  ↓
main.js
  ↓ load: vue-core + parent-shell（含 LoginView / HomeView 同層）
  ↓ NOT loaded yet: liff-sdk / parent-attendance / parent-fees / ...
HomeView mount
  ↓ useParentResource('home/summary', getHomeSummary, { ttl: 60s })
    ↓ cache hit + fresh → 立刻 render
    ↓ cache hit + stale → render 舊資料 + 背景 refetch
    ↓ cache miss → ParentSkeleton + fetch
ParentLayout tabBar
  ↓ user touches "費用" tab
  ↓ prefetch parent-fees chunk（dynamic import）
  ↓ user clicks → router push → 已下載完，瞬間切換
```

---

## 錯誤處理

| 場景 | 行為 |
|---|---|
| API 5xx / network error | `useParentResource` 保留舊 data、暴露 error 物件給 UI；UI 顯示 toast 或 ParentErrorRetry |
| 401 | axios interceptor 既有邏輯：清 store + redirect /login |
| 弱網 timeout | SW NetworkFirst 觸發 cache fallback；axios timeout 由 SWR 接住 |
| 首次進站 + 離線 | SW navigate fallback to parent.html；parent-shell 載入後沒 cache → ParentErrorRetry |

---

## 測試

**後端 pytest**
- `tests/test_parent_home_summary.py` — 單支端點：成功路徑、IDOR、跨子女彙總、count 邊界（0 / 多）
- 既有 11 router 測試不破壞（timing middleware 不應影響）

**前端 vitest**
- `tests/parent/useParentResource.spec.js` — cache hit / miss / stale / error path / logout clear
- `tests/parent/ParentSkeleton.spec.js`、`ParentErrorRetry.spec.js` — 渲染斷言

**手動驗收**
- `start.sh` 跑起來，DevTools throttle Mobile Slow 4G
- 量測 9 個 view 切換流暢度（切回的頁應該瞬間顯示舊資料）
- DevTools Application → Service Worker → Update on reload，看 `/api/parent/*` runtime cache 有 hit
- 離線（DevTools Offline）開家長 App，能看到上次 cache 的內容 + 適當錯誤提示

---

## 驗收條件

| 指標 | 目標 |
|---|---|
| parent-app 相關 chunk 總 gzip | 比 baseline 小（細拆後 HomeView 路徑不必下載 fees / activity） |
| HomeView API 請求數（首次） | 從 2 支 → 1 支（home/summary） |
| 切回已開過的頁體感 | 瞬間顯示舊資料（不再看到 spinner） |
| 離線開啟家長 App | 仍能看到上次資料（NetworkFirst cache fallback） |
| `/api/parent/*` PWA cache 規則 | 5 條都生效（DevTools 可見對應 cacheName） |
| 後端 timing log | 每 parent_portal request 都印 duration_ms |

---

## 工作切分（建議 commit 順序）

1. **後端**（一個 commit）：彙總端點 + timing middleware + N+1 修補（如有）+ pytest
2. **前端 Phase 0**（一個 commit）：rollup-plugin-visualizer + axios timing interceptor
3. **前端 Phase 2-A**（一個 commit）：bundle 細拆 + LIFF lazy load
4. **前端 Phase 2-B/C**（一個 commit）：useParentResource composable + parentCache store + Skeleton/Empty/ErrorRetry 元件 + vitest
5. **前端 Phase 2-D**（一個 commit）：route prefetch in ParentLayout
6. **前端 Phase 3**（一個 commit）：PWA runtime cache rules
7. **前端 Phase 4**（一個 commit）：HomeView 重構 + 套用 useParentResource + 摘要卡片

實際 commit 由用戶執行（本次 session 不自動 commit，避免夾帶 in-progress 後端修改）。
