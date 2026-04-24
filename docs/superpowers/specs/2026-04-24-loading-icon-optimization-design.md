# 載入圖示邏輯優化設計

- 日期：2026-04-24
- 範圍：`ivy-frontend`（不動後端）
- 目標：消除載入閃爍、修正 keyed store 併發 bug、建立可共用的載入基建
- 方向：A（修補現況）+ B 前半段（新增共用元件與 composable）

## 1. 背景與現況

全前端盤點結果：

| 層級 | 機制 | 數量 | 主要問題 |
|------|------|------|---------|
| 路由 | `useRouteLoading` + `App.vue` overlay | 1 套 | 120ms debounce 但無最短顯示時間 → 瞬閃 |
| 頁面/表格 | `v-loading` 指令 | 132 處 | 無 min-show-time、命名混亂 |
| 按鈕 | `:loading="..."` | 145 處 | 未同步 `disabled`，可重複點擊 |
| Store | `_createFetchStore` / `_createKeyedFetchStore` | 2 套 | keyed store 全域單一 loading，多 key 併發互蓋 |
| 骨架 | `TableSkeleton` + `ElSkeleton` | 4 處 | 僅少數 view 使用，多數硬閃 v-loading |
| API | axios interceptor | 無 | 無全域 pending counter，重複點擊會發多筆 |

核心問題：

1. **🔴 路由 overlay 瞬閃**：`useRouteLoading` 雖 debounce 120ms，overlay 顯示後若 <50ms resolve 會瞬閃。
2. **🔴 keyed store 全域 loading 互蓋**：同時 fetch 兩個 key，一個回來就把 `loading` 設 false，UI 以為全部結束。
3. **🟡 按鈕重複點擊**：`:loading` 不自動 disable，快速雙擊發兩筆 POST（後端有冪等，但前端仍應防呆）。
4. **🟡 骨架屏未普及**：列表類頁面仍多用 spinner，視覺重量偏高。
5. **🟡 命名不一致**：每個 composable 自訂 `loading` / `loadingStats` / `loadingDetail`，無法抽象。

## 2. 設計目標（Definition of Done）

- 路由切換無瞬閃（顯示則至少 `MIN_SHOW_MS` 毫秒）。
- `_createKeyedFetchStore` 可用 `isLoading(key)` 精準查詢單 key 狀態。
- 提供 `useAsyncState` composable 與 `<LoadingPanel>` 元件，新程式碼直接使用。
- axios 層對 `POST/PUT/PATCH/DELETE` 做同 key 去重，白名單機制可繞過。
- 不強制遷移既有 132 處 `v-loading`（僅提供 top 10 清單）。
- 所有新邏輯有 vitest 單元測試。

## 3. 元件與機制設計

### 3.1 `useRouteLoading` 修補

**檔案**：`src/composables/useRouteLoading.js`

**新增常數**：`MIN_SHOW_MS = 400`

**狀態機**：

```
startRouteLoading()
  ├─ pendingNavigations +1
  ├─ 120ms delay timer 啟動
  └─ timer fired → routeLoading = true, shownAt = Date.now()

finishRouteLoading()
  ├─ pendingNavigations -1
  ├─ if pendingNavigations > 0 → return
  ├─ if overlay 未顯示（timer 未觸發）→ 清 timer, return
  └─ if overlay 已顯示
       ├─ elapsed = Date.now() - shownAt
       ├─ if elapsed >= MIN_SHOW_MS → 立刻關
       └─ else → setTimeout 剩餘時間後關
```

**邊界**：
- 同步導覽（hash change, redirect）：120ms 內 resolve，timer 未觸發，overlay 不顯示。
- 連續多跳：`pendingNavigations` 計數保護，全部完成才走 min-show 關閉邏輯。
- `router.onError`：呼叫 `finishRouteLoading()`，同樣走 min-show（避免錯誤頁瞬閃 overlay）。
- `resetRouteLoading()`（登出時）：立刻關，不受 min-show 限制。

**驗證**：新增 `src/composables/__tests__/useRouteLoading.spec.js`，使用 `vi.useFakeTimers()` 驗四種時序。

### 3.2 `_createKeyedFetchStore` 修正

**檔案**：`src/stores/_createKeyedFetchStore.js`

**內部 state 新增**：`loadingKeys: new Set<string>()`

**暴露介面變更**：

```js
// 既有（保留向後相容）
store.loading  // computed: loadingKeys.size > 0

// 新增
store.isLoading(key)  // => loadingKeys.has(String(key))
```

**實作細節**：
- `fetch(key)` 進入時 `loadingKeys.add(key)`，`finally` 中 `delete`。
- `loading` 改為 Pinia getter（computed），避免手動同步。
- 既有所有 `store.loading` 呼叫點不需改動（行為：任一 key 載入中即為 true，與原單一 flag 在「只一個 key 請求」場景等價）。

**驗證**：`src/stores/__tests__/_createKeyedFetchStore.spec.js` 斷言併發兩 key 時 `isLoading(keyA)` 與 `isLoading(keyB)` 獨立。

### 3.3 新增 `useAsyncState` composable

**檔案**：`src/composables/useAsyncState.js`（新）

**介面**：

```js
const { data, pending, error, execute, reset } = useAsyncState(
  (signal) => api.fetchBonusSummary(params, { signal }),
  {
    immediate: true,      // 預設 false
    minShowMs: 300,       // pending 保證最短顯示時間
    dedupe: true,         // 同一 composable 併發 execute 只發一個
    initialData: null,
  }
)
```

**行為**：
- `pending`：ref<boolean>。進 `execute` 時立刻 true；resolve 後若已顯示 ≥ `minShowMs`，立刻設 false，否則等滿。
- `dedupe`：若前次 `execute` 尚未完成，回傳既有 Promise，不發新請求。
- `execute()` 回傳的 Promise resolve 為 `data`，reject 不拋（錯誤寫進 `error`），避免使用端忘 catch。
- `reset()`：`data = initialData, error = null, pending = false`，取消 inflight。
- fetcher 接收 `AbortSignal`，`reset()` 或元件 unmount 時取消（呼叫者自己 pass 給 axios `{ signal }`）。

**不做**：
- 不內建快取（交給 Pinia store）。
- 不做 polling（單獨另寫 `usePolling`，非本案範圍）。
- 不做 retry（使用端自理）。

**驗證**：`src/composables/__tests__/useAsyncState.spec.js`：
- `minShowMs` 生效（fake timers）
- `dedupe` 生效（同時 execute 兩次，API 只呼叫一次）
- `AbortSignal` 於 reset 時觸發
- error 寫入 `error` ref，不拋出

### 3.4 新增 `<LoadingPanel>` 元件

**檔案**：`src/components/common/LoadingPanel.vue`（新）

**Props**：

| Prop | 型別 | 預設 | 說明 |
|------|------|------|------|
| `loading` | `Boolean` | `false` | 載入中 |
| `empty` | `Boolean` | `false` | 資料為空 |
| `variant` | `'spinner' \| 'skeleton'` | `'spinner'` | 載入視覺 |
| `delay` | `Number` | `120` | 載入 delay（避免首次閃） |
| `minShowMs` | `Number` | `300` | 顯示後最短停留 |

**Slots**：
- 預設 slot：正常內容
- `#skeleton`：自訂骨架（variant=skeleton 時）
- `#empty`：空狀態
- `#spinner`：自訂 spinner（極少用）

**行為**：
- 內部以 `useAsyncState` 同款 delay + min-show 邏輯控制 `displayLoading` 布林。
- 優先順序：`displayLoading`（載入中）→ `empty`（空）→ 預設 slot（內容）。
- variant=skeleton 時顯示 `#skeleton` slot，沒提供則 fallback spinner。

**範例**：

```vue
<LoadingPanel :loading="pending" :empty="!rows.length" variant="skeleton">
  <template #skeleton><TableSkeleton :rows="5" /></template>
  <template #empty><EmptyState text="尚無資料" /></template>
  <el-table :data="rows">...</el-table>
</LoadingPanel>
```

**不做**：不做全螢幕 overlay 變體（那是 `useRouteLoading` 的責任）。

**驗證**：`src/components/common/__tests__/LoadingPanel.spec.js` 驗三種分支渲染（loading/empty/content）。

### 3.5 Axios 去重 Interceptor

**檔案**：`src/api/index.js`（修改，不新建）

**機制**：不使用 interceptor 直接 reject（axios 的 interceptor 生命週期複雜），改以「包裝 axios 實例的 request 方法」實作，流程清楚。

```js
const inflight = new Map()  // key => Promise<AxiosResponse>

function shouldDedupe(config) {
  if (config.meta?.allowConcurrent) return false
  const m = (config.method || 'get').toLowerCase()
  return m === 'post' || m === 'put' || m === 'patch' || m === 'delete'
}

function buildKey(config) {
  const method = (config.method || 'get').toUpperCase()
  const url = config.url || ''
  const body = config.data == null ? '' : stableStringify(config.data)
  return `${method} ${url} ${body}`
}

// 包裝原 axios.request
const originalRequest = axiosInstance.request.bind(axiosInstance)
axiosInstance.request = (config) => {
  if (!shouldDedupe(config)) return originalRequest(config)

  const key = buildKey(config)
  const existing = inflight.get(key)
  if (existing) return existing  // 回傳同一 Promise

  const p = originalRequest(config).finally(() => {
    inflight.delete(key)
  })
  inflight.set(key, p)
  return p
}
```

**key 構成**：
- `method.toUpperCase()` + ` ` + `url` + ` ` + `stableStringify(data ?? '')`
- `stableStringify`：遞迴 sort keys，避免欄位順序影響。

**去重行為**：
- 同 key 進行中 → 第二次 caller 拿到同一 `Promise`，resolve 時得到同一 `AxiosResponse`。
- Promise `.finally` 中 `inflight.delete(key)`，無論成功或失敗都清除。
- 兩個 caller 的 `.then` / `.catch` 都會被觸發（共用同一結果，對呼叫端透明）。

**實作位置**：
- `src/api/index.js` 既有的 `api` axios 實例匯出前套用包裝。
- 若某模組直接用 `axios.create()` 建立獨立實例，需各自套用（目前 grep 結果僅有 `src/api/index.js` 一處，無此問題）。

**白名單**：
- `config.meta.allowConcurrent = true` 繞過（例：故意重試、批次補單）。
- GET 不攔（需要手動 refresh）。

**不擋**：連點「同一按鈕不同參數」（例：兩個學生的不同報名），key 不同自然不重。

**影響評估**：
- POS 結帳：後端有冪等，前端多一層去重保險。
- 薪資 manual-adjust：有雙簽流程，不會在短時間連點，不影響。
- 活動報名 `public_update`：家長快速雙擊只送一筆，預期行為。

**風險**：
- 若某處 UI 需要「按一下、改參數、再按」的極速情境，可能誤擋。由白名單解決。
- 體驗上「按下去沒反應」：按鈕 `:loading` 仍在，對使用者透明。

**驗證**：`src/api/__tests__/dedupe.spec.js`：
- mock adapter 驗同 key 併發只打一次，兩個呼叫拿到相同結果。
- 白名單 `allowConcurrent` 打兩次。
- GET 不攔。
- 不同 body 不攔。

## 4. 遷移清單（Top 10，不強制）

以下頁面建議優先改用 `<LoadingPanel>` + `useAsyncState`，其他 120+ 處 `v-loading` 維持不動，等自然迭代再換：

1. `src/views/HomeView.vue` - 首頁儀表板
2. `src/views/SalaryView.vue` - 薪資列表（兩處 v-loading）
3. `src/views/StudentAttendanceView.vue` - 學生考勤（4 處 v-loading）
4. `src/views/ScheduleView.vue` - 班表
5. `src/views/LeaveView.vue` - 假單（已用 TableSkeleton，可直接包 LoadingPanel）
6. `src/views/OvertimeView.vue` - 加班（同上）
7. `src/views/StudentView.vue` - 學生列表
8. `src/views/EmployeeView.vue` - 員工列表
9. `src/components/recruitment/RecruitmentIvykidsTab.vue` - 4 個獨立 loading，最亂
10. `src/components/student/StudentRecordsQuickDrawer.vue` - Drawer 裡 6 個 loading

## 5. 實作順序與切割

建議 commit 切分（每個獨立可 revert）：

1. **chore(loading): useRouteLoading 加最短顯示時間** + 測試
2. **fix(store): keyed fetch store 支援 isLoading(key)** + 測試
3. **feat(loading): 新增 useAsyncState composable** + 測試
4. **feat(loading): 新增 LoadingPanel 共用元件** + 測試
5. **feat(api): axios 加同 key mutating 請求去重** + 測試
6. **refactor(views): Top 10 頁面遷移至 LoadingPanel**（可再拆多筆 commit）

每步可獨立驗證，不會一次爆炸。

## 6. 測試策略

- **單元測試**：`vitest` + `@vue/test-utils`
  - `useRouteLoading.spec.js`：fake timers 驗四種時序分支
  - `_createKeyedFetchStore.spec.js`：併發 keyA/keyB 獨立斷言
  - `useAsyncState.spec.js`：min-show、dedupe、abort、error 捕捉
  - `LoadingPanel.spec.js`：三分支渲染
  - `api/dedupe.spec.js`：mock adapter 驗去重
- **E2E**：不做（風險不值得）。
- **手動驗證**：`start.sh` 啟動後點一次路由切換、快速連點送出按鈕、同時載入多班級。

## 7. 不做的事（YAGNI）

- ❌ 不替換 `ivy-kids-loading.png` logo 動畫
- ❌ 不加 NProgress 頂部進度條
- ❌ 不做樂觀 UI
- ❌ 不強制遷移全部 132 處 `v-loading`
- ❌ 不做 SCSS 設計 token 系統（用局部常數即可）
- ❌ 不做 polling / retry / 快取（`useAsyncState` 保持純粹）
- ❌ 不改後端

## 8. 風險與回滾

| 風險 | 緩解 | 回滾 |
|------|------|------|
| axios 去重誤擋合法重試 | 白名單 `allowConcurrent` | 單 commit revert |
| `_createKeyedFetchStore` 行為改變影響既有呼叫 | `store.loading` 保持 any-loading 語意 | 單 commit revert |
| `useRouteLoading` min-show 導致操作延遲感 | `MIN_SHOW_MS=400` 調整空間，可設 0 停用 | 改常數即可 |
| 新元件 API 不好用 | 只遷移 10 頁，反饋後再廣推 | 保留舊寫法 |

每步獨立 commit，任一步 revert 不影響其他。
