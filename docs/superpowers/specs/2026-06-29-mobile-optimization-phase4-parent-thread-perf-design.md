# 手機端優化 Phase 4 — 家長對話頁修復（T10）+ 純前端首屏效能（T11）

- **日期**：2026-06-29
- **狀態**：設計待審
- **總綱**：`2026-06-26-mobile-optimization-roadmap.md`（破口修復軌；本檔為 Phase 4，roadmap 最後一期）
- **前置**：Phase 1（共用基建）/ Phase 2（接送+AA）/ Phase 3（drawer+卡片化）已併入 FE main。
- **互補軌**：RWD 軌已落地 P0/P1/P3。

---

## 1. 範圍界定

roadmap Phase 4 原含 T7（家長設計系統收斂）/ T10（對話頁）/ T11（首屏效能）三主題。經對當前 main 重核 + 性質評估，**T7 暫緩、本 Phase 只做 T10 + T11 純前端部分**：

- **T7 設計系統收斂暫緩**：M3Button 全端用 1 次、M3TextField 0 次、7 檔手刻按鈕、`.pt-card` 仍重複定義、Bento 冷改色溫衝突仍在。但「整端是否全冷調」是**業主美學決策**（冷藍灰底 vs 暖奶油黃綠卡片），視覺風險高、掃 24 檔 —— 不宜由 AI 擅自拍板。留待業主定調後獨立進行。
- **T11 需後端的部分排除**：admin login 圖 / public 海報縮圖需後端產 WebP+srcset，本 Phase 不做（純前端）。

已重核仍成立的 finding（當前 main `0d0e0638`）：對話頁 route `:51` 仍只 `showBack` 無 `hideTabBar`、`.thread-view` 仍 `margin:-16px`+`calc(100dvh-64px)`、`.messages` 無 ref；parent.html 字型仍 render-blocking、`refreshUnread` 仍 `watch(route.fullPath)` 無節流、ChildPhotos 仍一次渲染 200 縮圖。

---

## 2. T10 — 家長對話頁三重破壞修復

家長最常用的「跟老師對話」頁 `MessageThreadView`（`src/parent/views/MessageThreadView.vue`）。

### T10-1 版面（route + 容器）
- **現況**：`src/parent/router.ts:51` `/messages/:threadId` meta 只有 `showBack` 沒 `hideTabBar`；`MessageThreadView` `.thread-view`（:172-178）`height: calc(100dvh - 64px); margin: -16px`。`.parent-main`（ParentLayout）**無水平 padding**，故 `margin:-16px` 抵銷不存在的內距 → 左右溢出 32px；`calc(100dvh-64px)` 硬算未扣 navbar。
- **改**：
  - router `:51` meta 加 `hideTabBar: true`（機制已存在：ParentLayout `hideTabBar` computed → `M3NavigationBar v-if="!hideTabBar"` 不渲染 + `.parent-main` 不加 `with-tabbar` 的 80px padding-bottom）。
  - `.thread-view` 移除 `margin: -16px`；`height: calc(100dvh - 64px)` → `flex: 1; min-height: 0`（`.parent-main` 是 flex column，thread-view 用 `flex:1` 自然填滿剩餘高度，M3TopAppBar 返回鍵 bar 由 flexbox 自動扣除，不硬算）。

### T10-2 自動捲底
- **現況**：`.messages`（:199）無 ref；`init()`/送收訊息後不捲動 → 停在最舊訊息、送出看不到自己泡泡。
- **改**：`.messages` 加 template ref；新增 `scrollToBottom()`（`nextTick` 後設 `el.scrollTop = el.scrollHeight`）；`onMounted`（init 後）+ `watch(messages)` 後呼叫。`loadMore`（載入更早訊息）**不**捲底（保留閱讀位置）。

### T10-3 鍵盤補償（visualViewport）
- **現況**：`.thread-view` 固定高度無 visualViewport 處理；鍵盤彈出後 layout viewport 不變但 visualViewport 縮小 → composer/送出鍵被鍵盤蓋住。ParentBottomSheet（`src/parent/components/ParentBottomSheet.vue:151-162`）有完整 visualViewport 正解但此全頁視圖沒用。
- **改**：抽輕量 composable `src/parent/composables/useKeyboardInset.ts`（從 ParentBottomSheet 的 visualViewport 邏輯萃取）：
  ```ts
  // 回傳鍵盤佔用高度（px）；無鍵盤/不支援為 0。監聽 visualViewport resize，
  // delta = initialHeight - currentHeight，> 門檻（如 80px）視為鍵盤開啟。
  export function useKeyboardInset(): { keyboardInset: Ref<number> }
  ```
  `MessageThreadView` 用 `keyboardInset` 在鍵盤開啟時讓容器/composer 上移（`.thread-view` `padding-bottom: {keyboardInset}px` 或容器高扣 inset），使 composer 浮在鍵盤上方；並在鍵盤開啟後 `scrollToBottom()` 維持最新訊息可見。
- **不重構 ParentBottomSheet**（已運作、低風險）；其內聯 visualViewport 邏輯之後再 DRY 收斂到此 composable（follow-up）。

---

## 3. T11 — 純前端首屏效能

### T11-1 字型非阻塞（`parent.html`）
- **現況**（`parent.html:23-25`）：兩條 render-blocking Google Fonts——Noto Sans TC 4 weight（`display=swap`）、Material Symbols（`display=block` → FOIT，弱網下 114 處 icon 含底部 tab/返回鍵隱形最長 3s）；SW 無 gstatic runtimeCaching。
- **改**：
  - Material Symbols `display=block` → `display=swap`（icon 字型載入前顯示 fallback 而非隱形）。
  - 兩條 `<link rel="stylesheet">` 改非阻塞 pattern：`media="print" onload="this.media='all'"`（+ `<noscript>` fallback 保留同步載入）。`preconnect` 已有。
  - SW workbox 加 gstatic/googleapis 跨 origin `runtimeCaching`（`CacheFirst`，`cacheableResponse.statuses:[0,200]`，opaque 跨域回應）—— `vite.config.js` workbox（admin/parent 共用 SW；謹慎不破壞既有 runtimeCaching）。

### T11-2 unread 節流（`ParentLayout`）
- **現況**（`src/parent/layouts/ParentLayout.vue:80,94-95`）：`refreshUnread` 在 `onMounted` + `watch(route.fullPath)` → 每次路由切換都重打 2 支 unread API，無節流。
- **改**：`refreshUnread` 加 TTL（如 45s）：記上次成功時間，未逾 TTL 的路由切換跳過重打（強制刷新另留參數供需要處）。

### T11-3 ChildPhotos 漸進渲染
- **現況**（`src/parent/views/ChildPhotosView.vue:33,106`）：`fetchChildPhotos(limit:200)` 後 `v-for item in items` 一次渲染全部 200 縮圖。
- **改**：接既有 `useIncrementalRender(itemsRef, {pageSize})`（`src/parent/composables/useIncrementalRender.ts`，已被 ContactBook/Announcements/Leaves 用）：`v-for` 改用 `visible`，捲到底 IntersectionObserver 自動 `loadMore`。

---

## 4. 兩軌 / 平行協調
- 本 Phase 觸及 `MessageThreadView`/`router.ts`/`ParentLayout`/`ChildPhotosView`/`parent.html`/`vite.config.js`（家長端為主 + 共用 SW config）。
- **隔離 worktree 實作**，最後對 live main `git merge` 讀當前 tip、衝突即停手。
- 不碰 RWD token / dark-mode token / T7 設計系統 / ParentBottomSheet。

## 5. 測試策略
- **T10-1**：router 測試斷言 `/messages/:threadId` meta `hideTabBar===true`；`MessageThreadView` 元件測試斷言無 `margin:-16px`（樣式 guard）。
- **T10-2**：`MessageThreadView` 元件測試 mock messages，斷言 mount 後 / messages 變動後 `.messages` 元素 `scrollTop` 被設為 `scrollHeight`（mock element 尺寸）。
- **T10-3**：`useKeyboardInset` 單元測試（mock `window.visualViewport` + dispatch resize，斷言 `keyboardInset` 反映 delta）。
- **T11-1**：`parent.html` guard 測試（`display=swap`、`media="print"` onload 屬性存在）。
- **T11-2**：`refreshUnread` TTL 單元測試（連續呼叫在 TTL 內只打一次 API）。
- **T11-3**：`ChildPhotosView` 測試斷言初始只渲染 pageSize 張、`loadMore` 後增加（mock IntersectionObserver）。
- **回歸**：全量 `npm run test`（**家長三測試樹** `src/parent`/`tests/unit/parent`/`tests/parent`——本 Phase 大量觸及家長元件，sibling sweep）+ `npm run typecheck` + `npm run build`。
- **實機**：dev server 390px 截圖核對放 DoD（對話頁鍵盤彈出 composer 可見、捲底、字型 fallback）。

## 6. 交付定義（DoD）
- T10：對話頁 hideTabBar 生效（無底部 tab + 無溢出）、進頁/送出自動捲底、鍵盤彈出 composer 不被蓋；元件 + composable 測試綠。
- T11：parent.html 字型非阻塞 + SW gstatic 快取、unread TTL 節流、ChildPhotos 漸進渲染；測試綠。
- 全量 `npm run test`（含家長三樹）/ `typecheck` / `build` 全綠。
- 隔離 worktree；commit 分開、Conventional Commits、繁中、`Co-Authored-By` trailer；併 live main（未 push，由 user 決定 push 時機）；實機 390px 截圖核對列 DoD。
