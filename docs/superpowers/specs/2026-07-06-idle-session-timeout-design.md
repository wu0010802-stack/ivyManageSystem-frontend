# 閒置自動登出設計文件

## 背景與問題

目前管理端／教師 Portal 的自動登出機制以「登入時間」為準：`src/utils/auth.ts` 的 `isLoggedIn()`
比對 `sessionStorage` 記錄的驗證時間戳與 `SESSION_MAX_AGE_MS`（14 分鐘），且僅在**路由切換時被動檢查**，
沒有計時器、沒有任何提示。使用者即使持續操作，只要登入超過 14 分鐘沒有觸發 `refreshSession()` 的路由切換，
就可能被登出；反之若使用者早已離開座位，只要沒有換頁，session 也不會即時失效。這與使用者體感的「閒置」
無關，是本次要修正的核心問題。

後端對應機制：`utils/auth.py` 的 `JWT_EXPIRE_MINUTES = 15`（access token 效期）與
`JWT_ABSOLUTE_LIFETIME_HOURS`（透過 JWT `original_iat` claim 限制整個登入 session 的絕對時數上限，
超過即拒絕 refresh、強制重新登入）。

## 目標

1. 自動登出的判斷基準由「登入時間」改為「使用者閒置時間」（沒有鍵盤/點擊/捲動/觸控操作、且沒有頁面切換；
   純滑鼠移動不算操作，見「需求決議摘要」）。
2. 閒置達逾時前 5 分鐘，跳出提醒 modal，告知使用者「將於 5 分鐘後自動登出」。
3. 使用者可在 modal 中選擇「關閉」（僅隱藏提示，不延長）或「繼續使用」（延長閒置計時、視為活躍）。

## 範圍

- **適用**：管理端 + 教師 Portal（共用 `src/App.vue` root entry、`src/router/index.ts`、`src/utils/auth.ts`）
- **不適用**：家長端（`src/parent/`，完全獨立的 SPA entry，有自己的 App.vue/router，不受本次變更影響）
- **後端不變更**：`JWT_ABSOLUTE_LIFETIME_HOURS` 絕對時數上限機制維持現況，作為本功能之外的最後一道安全網

## 需求決議摘要

| 項目 | 決議 |
|---|---|
| 閒置逾時時長 | 沿用既有 `SESSION_MAX_AGE_MS`（14 分鐘），不新增設定值 |
| 警告 modal 時機 | 逾時前 5 分鐘（即閒置滿 9 分鐘） |
| 使用者活躍時是否同步延續後端 session | 是，節流呼叫既有 `POST /api/auth/refresh`；成功回呼須呼叫 `setUserInfo(res.data.user)`，同步延續 `auth.ts` 的 `auth_session_validated_at`，否則 `isLoggedIn()` 仍會在 14 分鐘後誤判為未登入（即使後端 session 已被延續）——此為實作時發現並修正的真實 bug，非文件臆測 |
| 多分頁（multi-tab）行為 | 每個分頁獨立計時，不跨分頁同步。已知限制：`clearAuth()` 會清除跨分頁共用的 `localStorage`/httpOnly Cookie，因此分頁 A 的閒置登出仍會讓分頁 B 的後端 session 一併失效；本次不處理跨分頁通知，維持現況 |
| 後端絕對時數上限機制 | 保留不動，作為安全網 |
| 前端 `REFRESH_THROTTLE_MS` 的安全定位 | 僅為前端自律節流，非安全防線（可被 XSS/console 繞過）；後端是否需要獨立 rate limit 由後端自行評估，不在本次前端變更範圍內 |
| Modal 顯示期間偵測到頁面其他活動 | 視為活躍：自動關閉 modal 並重置計時（含節流 refresh）。判斷方式：事件來源（`event.target`）若落在 modal 根節點（`.session-idle-modal` class）之外才算「背景活動」；modal 內任何位置（含按鈕、標題、空白處）皆忽略，不需要额外處理遮罩穿透——遮罩本身的點擊事件 target 也在 modal 根節點內，一併被忽略即可，無需讓點擊穿透到底層元素 |
| 「關閉」按鈕 vs 「繼續使用」按鈕 | 「關閉」僅隱藏 modal，不重置計時、不呼叫 refresh；「繼續使用」才會重置計時並立即 refresh |
| 監聽的活動事件範圍 | `keydown`/`click`/`touchstart`/`scroll`（含巢狀 overflow 容器）。**不含 `mousemove`**：純滑鼠移動、未實際點擊或操作不視為活躍，避免滑鼠停在畫面上、螢幕保護程式或視窗晃動等情境被誤判為使用者仍在操作 |

## 技術方案

採用「composable + 全域展示型 modal 元件」：

- `src/composables/useIdleTimeout.ts`：封裝全域活動監聽、逾時計時器排程、節流後的後端 refresh 呼叫
- `src/components/common/SessionIdleModal.vue`：純展示元件，不含計時邏輯
- 於 `src/App.vue` 掛載一次，僅在已登入且非未登入頁面（`/login`、`/portal/login`、`/public/*`）時生效

理由：邏輯與 UI 分離、可用 Vitest fake timer 獨立測試、貼合專案既有 `useXxx.ts` + `Xxx.vue` 慣例、
無需新增第三方依賴。

被否決的替代方案：
- **Pinia store 集中管理計時器**：與 store 慣例（純資料、無 DOM 副作用）不合，且 `clearAuth()` 內的
  `_resetStores()` 會重置所有 store state，計時器需額外手動清理，容易與 store reset 產生競態。
- **導入 VueUse `useIdle`**：專案雖已透過 `@vueuse/core`（其他既有 composable 用其
  `useDebounceFn`）間接具備此依賴，但 `useIdle` 預設的事件集合、掛載目標與本文件「兩段式 timer +
  modal 內容排除規則」的客製化需求有落差，改用仍需大量自訂，未必減少程式碼，故維持手刻 composable。

## 架構總覽

```
App.vue（admin + teacher portal 共用 entry）
 └─ useIdleTimeout()（composable，App.vue 掛載時呼叫一次）
     ├─ 監聽 document 層級活動事件：keydown/click/touchstart（passive；不含 mousemove）；
     │    scroll 另外以 { capture: true } 監聽（見「元件與資料流細節」原因）
     ├─ 內部兩顆 setTimeout：
     │    T-5min（idle 9 分鐘）→ 顯示 SessionIdleModal
     │    T-0（idle 14 分鐘）→ 強制登出：先讀出 getUserInfo()?.role，再呼叫 clearAuth()，
     │      最後依角色導向 /login 或 /portal/login（clearAuth() 會清空 userInfo，順序不可顛倒）
     ├─ 任何合格活動 → 重置這兩顆 timer；節流呼叫 refreshSession() 並同步 setUserInfo()
     │    延續前端驗證時間戳
     └─ 只在「已登入」且「非 /login、/portal/login、/public/*」路由時啟用；離開條件時清空 timer
 └─ <SessionIdleModal :visible :remaining-seconds @close @extend />
```

## 元件與資料流細節

### `src/composables/useIdleTimeout.ts`

- 常數：`WARNING_BEFORE_MS = 5 * 60_000`；`REFRESH_THROTTLE_MS = 2 * 60_000`（後端 refresh 節流間隔）；
  `ACTIVITY_RESET_THROTTLE_MS = 1_000`（高頻活動事件節流，避免頻繁 `clearTimeout`/`setTimeout`）；
  逾時基準沿用 `auth.ts` 已 `export` 的 `SESSION_MAX_AGE_MS`，不重複定義魔法數字
- 響應式狀態：`showWarningModal: Ref<boolean>`、`remainingSeconds: Ref<number>`
- 內部：`warnTimer`/`logoutTimer`（`setTimeout`）、倒數用的 1 秒 `setInterval`（**只在 modal 顯示時
  啟動**，避免平常無謂 tick）、`lastActivityResetAt`（節流 `resetIdleTimer` 本身）、`lastRefreshAt`
  （節流呼叫後端 refresh）、`refreshGeneration`（數字計數器，見下方 race 防護說明）
- `resetIdleTimer(opts?: { immediateRefresh?: boolean })`：
  1. 清除並重新排程 `warnTimer`/`logoutTimer`
  2. 若當下 `showWarningModal` 為 `true`，一併關閉並停止倒數 interval（對應「背景活動 → 自動關閉」決議）
  3. 若 `immediateRefresh` 為 true（來自「繼續使用」按鈕），或距上次 refresh 已超過
     `REFRESH_THROTTLE_MS`：呼叫前先將 `refreshGeneration` `+1` 並記錄呼叫當下的值
     （`callGeneration`），再 fire-and-forget 呼叫 `refreshSession()`；成功回呼須先比對
     `callGeneration === refreshGeneration`，相符才呼叫 `setUserInfo(res.data.user)`——`stop()`
     會將 `refreshGeneration` 再 `+1`，讓任何在 `stop()` 呼叫當下仍在飛行中的 refresh 回呼比對不符
     而略過，避免「使用者已登出後，稍後才抵達的 refresh 回應仍把 `userInfo` 復活」的競態；呼叫失敗
     不特別處理，交由既有 axios 401 攔截器 / 下次路由切換的 `restoreSessionIfNeeded` 導向登入頁
- 全域活動 handler：
  - 監聽 `keydown`/`click`/`touchstart`（`{ passive: true }`）；**不含 `mousemove`**——純滑鼠移動、
    未實際點擊或操作不視為活躍
  - `scroll` 事件額外以 `{ capture: true, passive: true }` 監聽：原生 `scroll` 事件不冒泡，只掛在
    document 且不開 capture 的話，偵測不到內部獨立 overflow 容器（如專案大量使用的 `el-table` 之
    `.el-table__body-wrapper`）的捲動，會讓使用者在長表格內持續滾動瀏覽時被誤判為閒置
  - 若事件來源（`event.target`）落在 modal 根節點（`.session-idle-modal` class，用
    `target.closest(...)` 判斷）內，忽略，不觸發 `resetIdleTimer()`；modal 自身「關閉」「繼續使用」
    按鈕一律透過 `emit` 明確呼叫 `dismiss()`/`extend()`，與此處全域 handler 是兩條獨立路徑
  - 其餘事件依節流呼叫 `resetIdleTimer()`
- `start()`：掛上活動監聽（含 capture 版的 `scroll`）、排程初始 timer
- `stop()`：`refreshGeneration` `+1`（見上方 race 防護說明）、移除監聽、清空所有 timer/interval、
  關閉 modal。移除 `scroll` 監聽時須傳入與新增時相同的 `{ capture: true }`——`removeEventListener`
  以 `(type, listener, capture)` 三者共同判斷，capture 選項不一致會靜默失敗、殘留監聽器
- 內部以 `watch(() => route.path, ...)`（讀取 `vue-router` 的 `useRoute()`）比對 `isLoggedIn()` 與
  是否為未登入頁面（`/login`、`/portal/login`、`/public/*`），自動決定何時 `start()`/`stop()`，
  `App.vue` 不需手動協調；`onBeforeUnmount` 亦呼叫 `stop()`
- `extend()`（供 `App.vue` 綁 modal 的 `@extend`）：等同呼叫 `resetIdleTimer({ immediateRefresh: true })`
- `dismiss()`（供 `App.vue` 綁 modal 的 `@close`）：只設定 `showWarningModal.value = false` 並停止倒數
  interval，**不**呼叫 `resetIdleTimer()`，`logoutTimer` 持續倒數

### `src/components/common/SessionIdleModal.vue`

- Props：`visible: boolean`、`remainingSeconds: number`
- Emits：`close`、`extend`
- 用 `ElDialog` 實作：標題「即將自動登出」，內文「由於閒置過久，系統將於 `mm:ss` 後自動登出。」，
  兩顆按鈕：「繼續使用」（primary，emit `extend`）、「關閉」（emit `close`）
- 根節點帶 `session-idle-modal` class，供 composable 的全域 handler 排除自身互動
- 純展示，不含 `setTimeout`/`setInterval`，倒數文字由父層傳入的 `remainingSeconds` 驅動

### `App.vue` 整合

```html
<script setup lang="ts">
const { showWarningModal, remainingSeconds, dismiss, extend } = useIdleTimeout()
</script>
<template>
  <!-- 既有內容 -->
  <SessionIdleModal
    :visible="showWarningModal"
    :remaining-seconds="remainingSeconds"
    @close="dismiss"
    @extend="extend"
  />
</template>
```

## 錯誤處理與 Edge Case

- `refreshSession()` 失敗（例如後端判定已超過絕對時數上限）：不特別跳錯誤 modal，沿用既有錯誤處理路徑
  （下一次路由切換的 `restoreSessionIfNeeded`、或 API 401 攔截器）導向登入頁
- 瀏覽器分頁切到背景（不可見）：不特別處理 Page Visibility API，計時器持續在背景運作，維持「每分頁獨立
  計時」的決議（背景分頁本身不算活動，也不重置）
- 高頻活動事件（如連續 `scroll`）：`resetIdleTimer` 本身節流至最多每秒一次
- 元件卸載／路由變成未登入頁面／登出：`stop()` 清空所有 listener 與 timer、關閉 modal，避免「已登出後
  才跳提醒 modal」或計時器洩漏
- 強制登出導頁需依角色分流：`forceLogout()` 必須**先**讀 `getUserInfo()?.role`，**再**呼叫
  `clearAuth()`，最後依角色導向 `/login` 或 `/portal/login`；順序顛倒會讓 `clearAuth()` 清空
  `userInfo` 後才讀取角色，一律 fallback 到 `/login`，教師 Portal 使用者會被導到錯誤的登入頁入口

## 測試計畫

- `useIdleTimeout.test.ts`（Vitest + `vi.useFakeTimers()`）：
  - idle 達 9 分鐘 → `showWarningModal` 變 `true`
  - idle 達 14 分鐘 → 觸發登出（`clearAuth` + 導向 `/login`）
  - 教師角色 idle 達 14 分鐘 → 導向 `/portal/login`
  - 活動事件重置計時，且節流呼叫 `refreshSession`（節流間隔內不重複呼叫）
  - `refreshSession` 成功後有呼叫 `setUserInfo`，延續 `isLoggedIn()` 賴以判斷的驗證時間戳
  - 巢狀 overflow 容器內不冒泡的 `scroll` 事件仍會被偵測為活動（驗證 capture 監聽）
  - `stop()` 後才 resolve 的 `refreshSession` 不會呼叫 `setUserInfo`（`refreshGeneration` race 防護）
  - modal 顯示中偵測到背景活動 → 自動關閉並重置
  - `dismiss()` 只關閉、不重置、不呼叫 refresh
  - 事件來源在 modal 根節點內時，全域 handler 不誤觸發重置
- `SessionIdleModal.test.ts`：純 props/emit 測試（倒數文字顯示、按鈕點擊各自 emit 正確事件）
- 後端無改動，不需新增後端測試
