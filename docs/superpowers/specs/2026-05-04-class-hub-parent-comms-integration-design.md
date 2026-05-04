# 家長溝通整合到班級教務工作台 — 設計文件

- 日期：2026-05-04（**Scope 於 2026-05-04 縮減**：移除公告通知整合，公告獨立到 sidebar）
- 類型：教師端（Portal）資訊架構與 UI 整合
- 範圍：`ivy-frontend`（純前端改動，不動後端 API、不動後端 schema）
- 使用情境：教師端 PWA / 桌面 portal

## 1. 問題與目標

教師端側欄目前把「家園溝通」群組與「班級教務」拆成兩個分組。但業務上：

- 「家長訊息」（`/portal/messages`、`/portal/messages/:threadId`）— **真正的家園溝通**（教師 ↔ 家長）
- 「公告通知」（`/portal/announcements`）— **校內內部通知**（學校 → 教師），不是家園溝通

目標（**已於 2026-05-04 縮減 scope**）：

- 把「家長訊息」深度整合進 `/portal/class-hub`，老師處理班務時可同時處理家長訊息
- 側欄移除「家園溝通」群組
- 「公告通知」獨立成 sidebar 頂層 menu item（與「我的排班」「學校行事曆」並列）；維持原 `/portal/announcements` 路由與 view
- 舊 `/portal/messages*` 路由透過 router 級 redirect 透明導向，避免破壞已發出但未開啟的 deeplink（LINE 推送、PWA 通知、通知中心存量）

非目標（明確排除）：

- 不整合「每日聯絡簿」（`/portal/contact-book`）— 維持現狀
- 不整合「接送通知」（`/portal/dismissal-calls`）— 已在班級教務群組
- **不整合「公告通知」進 class-hub** — 業主反饋校內內部通知不屬於家園溝通範疇
- 不動 `/portal/home`（今日首頁）
- 不動 mobile bottom-nav 結構
- 不動後端 router、Pydantic schema、權限位元
- 不動 `src/api/portalMessages.js`、`src/api/announcements.js`、`src/stores/portalMessages.js`、`src/views/portal/PortalAnnouncementView.vue`

## 2. 使用者決策（brainstorming 結論）

| 決策點 | 選定方案 |
|--------|----------|
| 整合層級 | C：單頁深度整合，沒有獨立 messages 頁 |
| 整合範圍 | **僅 1（家長訊息）**；公告通知獨立 sidebar 入口；不含聯絡簿（**2026-05-04 縮減**） |
| 容器型態 | B：頂端摘要卡 + 既有時段卡，drawer 從右側滑入 |
| 舊路由處理 | A2：刪除 messages view，router 保留 redirect rules（announcements 不動） |
| Drawer 內 thread 切換 | A：雙視圖切換（list ↔ thread），桌面與手機同型 |
| 公告通知擺位 | A：sidebar 頂層獨立 menu item（與「我的排班」「學校行事曆」並列） |

## 3. 資訊架構

### 3.1 側欄（`src/layouts/PortalLayout.vue`）

**移除**：

- 整個 `el-sub-menu#group-comm`（即「家園溝通」群組，目前位於 `PortalLayout.vue` L310-325）

**新增頂層 menu item「公告通知」**：

- 與「我的排班」「學校行事曆」「薪資查詢」並列為 sidebar 頂層獨立項目（不在群組內）
- 路由仍指 `/portal/announcements`
- 保留原本的未讀 badge（`unreadCount`）

**修改「今日工作台」menu item**：

- 「班級教務」群組下「今日工作台」menu item 的 badge 改為聚合值：

  ```text
  totalHubBadge = hubPendingCount + messagesUnreadCount
  ```

  `messagesUnreadCount` 由 `usePortalMessagesStore.unreadCount` 取得（或維持既有 `getMessagesUnreadCount` polling）。**不再**包含 `announcementsUnreadCount`（公告通知已獨立 menu item，自帶 badge）。

**Bottom-nav（mobile）**：

- 結構不動（出勤 / 請假 / 排班 / 薪資 / 更多）
- 「更多」按鈕的 announcement badge **保留**（公告獨立後仍透過「更多」展開可見）

### 3.2 Class Hub 頁面（`src/views/portal/PortalClassHubView.vue`）

```
┌──────────────────────────────────────────────┐
│ ClassHubCommBar  ← 新增（最頂端）            │
│ ┌──────────────────────────────┐             │
│ │ 家長訊息 3 則未讀             │             │
│ └──────────────────────────────┘             │
├──────────────────────────────────────────────┤
│ ClassHubStickyNext   ← 既有                  │
├──────────────────────────────────────────────┤
│ class-hub__header (班級名 + 手動刷新)         │
├──────────────────────────────────────────────┤
│ ClassHubTimeSlotCard × 4   ← 既有            │
│ (morning / forenoon / noon / afternoon)      │
├──────────────────────────────────────────────┤
│ ClassHubAttendanceSheet     ← 既有 sheet     │
│ ClassHubMedicationSheet                       │
│ ClassHubIncidentQuickSheet                    │
│ ClassHubMessagesDrawer        ← 新增 drawer  │
└──────────────────────────────────────────────┘
```

CommBar 只放一張卡（家長訊息）；公告通知不在這頁。

## 4. 元件邊界

### 4.1 新增元件

| 路徑 | 職責 | 依賴 |
|------|------|------|
| `src/components/portal/class-hub/ClassHubCommBar.vue` | 顯示一張置頂摘要卡（家長訊息）並回饋未讀數；點擊發出 `open-panel` 事件 | `usePortalMessagesStore`（取 unread count） |
| `src/components/portal/class-hub/ClassHubMessagesDrawer.vue` | 訊息 drawer 容器；內含雙視圖（list ↔ thread）切換；輸入區（thread view 底部） | `usePortalMessagesStore`（fetchThreads、startThread、發訊）、`getMyStudents` |

### 4.2 修改元件

| 路徑 | 修改內容 |
|------|---------|
| `src/views/portal/PortalClassHubView.vue` | 加入 `<ClassHubCommBar>` 與 messages drawer；新增 `useClassHubPanelQuery` composable 處理 URL `?panel=` `&thread=` 同步 |
| `src/layouts/PortalLayout.vue` | 移除「家園溝通」`el-sub-menu`；新增頂層「公告通知」menu item；class-hub menu item badge 改聚合 hub + messages |
| `src/router/index.js` | 刪除 portal-messages / portal-message-thread 兩條 routes；加入兩條 redirect routes；**保留 portal-announcements 不動** |

### 4.3 刪除檔案

- `src/views/portal/PortalMessagesView.vue`
- `src/views/portal/PortalMessageThreadView.vue`

**保留**：`src/views/portal/PortalAnnouncementView.vue`（仍由獨立 sidebar 入口使用）

注意：`src/components/portal/messages/MessageComposer.vue` 等子元件仍被新 drawer 復用，**不要刪**。

### 4.4 完全不動

- `src/api/portalMessages.js`
- `src/api/announcements.js`
- `src/api/portal.js`（含 `getPortalAnnouncements`、`markAnnouncementRead`、announcements `getUnreadCount`）
- `src/stores/portalMessages.js`
- `src/components/portal/messages/*`（子元件，例如 MessageComposer / MessageList / ThreadHeader 等若有）
- `src/views/portal/PortalAnnouncementView.vue`
- 後端所有 router 與 schema

## 5. URL 與 deeplink 設計

### 5.1 Class Hub 內部狀態以 query 表示

| URL | 行為 |
|-----|------|
| `/portal/class-hub` | 一切 drawer 關閉 |
| `/portal/class-hub?panel=messages` | 開啟訊息 drawer，顯示 list view |
| `/portal/class-hub?panel=messages&thread=42` | 開啟訊息 drawer，進入 thread 42 對話視圖 |

注意：`useClassHubPanelQuery` composable 仍泛化保留 `panel` 概念（為將來擴充預留），但本期實際只有 `messages` 一個 panel 值。

行為規範：

1. 進入 class-hub 時讀取 query → 自動展開對應 drawer
2. 關閉 drawer → `router.replace({ query: {} })` 清掉 panel/thread query（避免 history pollution）
3. drawer 內 list → thread 切換 → `router.push({ query: { panel: 'messages', thread: id } })`（保留 history，方便返回）
4. drawer 內 thread → list 返回 → `router.push({ query: { panel: 'messages' } })`
5. 同一條 query 開兩次（例如重複點同一 thread）→ 不重複 push

### 5.2 Router redirect rules（`src/router/index.js`）

```js
// 取代原本的 portal-messages / portal-message-thread routes
{
  path: 'messages',
  redirect: { name: 'portal-class-hub', query: { panel: 'messages' } },
},
{
  path: 'messages/:threadId',
  redirect: (to) => ({
    name: 'portal-class-hub',
    query: { panel: 'messages', thread: to.params.threadId },
  }),
},

// portal-announcements route 保留不動（不做 redirect）
```

放在原 portal children 區塊內，維持 `requiresAuth` 與 `portal: true` meta（meta 由 parent 繼承）。

### 5.3 Deeplink 兼容矩陣

| 來源 | 舊 URL | 結果 |
|------|--------|------|
| LINE 通知（家長 → 老師） | `/portal/messages/:id` | redirect 自動進入 thread 對話視圖 |
| 通知中心 store 既存 link_to | `/portal/messages` 或 `/portal/messages/:id` | redirect 接住 |
| PWA push payload | 同上 | redirect 接住 |
| 老師瀏覽器書籤 / PWA 主畫面捷徑 | 同上 | redirect 接住 |
| 公告通知 deeplink（如有） | `/portal/announcements` | **不變**，原 view 仍存活 |

不需要更動後端通知 link_to 模板、不需要清通知中心存量、不需要更新 LINE Rich Menu。

## 6. 互動規格

### 6.1 ClassHubCommBar

- 一張寬幅摘要卡（家長訊息）橫貫頂端
- 卡片內容：icon + 標題（家長訊息）+ 未讀數 badge（紅點）+ 副資訊（N 則未讀 / 無未讀）
- 點擊卡 → emit `open-panel` `'messages'`
- 權限：沒 `PARENT_MESSAGES_WRITE` → 整條 CommBar 不渲染（不留空白）

### 6.2 ClassHubMessagesDrawer

- `el-drawer` 從右側滑入，桌面寬 480px，mobile 全寬
- props: `modelValue: boolean`、`threadId?: number`
- emits: `update:modelValue`、`update:threadId`
- 內部 view 由 `currentView` 決定：`'list'` | `'thread'`
- 切換規則：
  - `threadId` 變更為 truthy → `currentView = 'thread'`
  - `threadId` 變為 null → `currentView = 'list'`
- list view：
  - 顯示 thread 列表，沿用 `usePortalMessagesStore.threads`
  - 點 thread → emit `update:threadId`（由 parent 寫進 query）
  - 「+ 新對話」按鈕，沿用既有 startThread 流程
- thread view：
  - header：左上「← 訊息列表」（emit `update:threadId` 為 null），中間 thread 標題（學生名 + 家長名）
  - body：訊息流（沿用既有 MessageList / 子元件）
  - footer：MessageComposer（沿用既有元件）
  - 進入時 fetch thread 詳情並 markRead（沿用既有 `PortalMessageThreadView` 內呼叫 `usePortalMessagesStore` 的實作位置；元件刪除前先把 markRead 邏輯抽進 store action 或 thread view 元件）
- 關閉 drawer：emit `update:modelValue=false` + `update:threadId=null`

### 6.3 (已移除) ClassHubAnnouncementsDrawer

公告通知不再合進 class-hub。獨立 sidebar 入口使用既有 `PortalAnnouncementView.vue`。

## 7. 權限分流

| 權限位元 | 影響元件 |
|---------|---------|
| `PARENT_MESSAGES_WRITE` (1 << 49) | 沒有 → 不渲染訊息摘要卡（CommBar 整條不渲染）與訊息 drawer 入口；redirect `/portal/messages*` 仍指 class-hub，但 drawer 不開 |
| `ANNOUNCEMENTS_READ` (1 << 12) | 沒有 → sidebar「公告通知」menu item 不顯示（沿用既有 router permission rule）|

權限檢查使用 `src/utils/auth.js` 既有 helper（`hasPermission` 之類），不要新增權限位元。

## 8. 資料流

```
PortalClassHubView (parent)
├── reads route.query.panel/thread (computed)
├── owns drawer open/close + thread state
├── ClassHubCommBar
│   └── reads: messagesUnreadCount (via usePortalMessagesStore)
└── ClassHubMessagesDrawer
    ├── reads/writes via usePortalMessagesStore
    ├── 子元件 MessageComposer 沿用
    └── (無新增 store)
```

PortalLayout 維持自己的 unread fetch（`fetchMessagesUnreadCount` / `fetchUnreadCount`）：

- `messagesUnreadCount` 仍驅動「今日工作台」menu item 的聚合 badge（`hub + messages`）
- `unreadCount`（announcement）仍驅動獨立「公告通知」menu item 的 badge

class-hub 內 messages drawer 開啟 / mark read 後，藉由既有 store reactive 機制自動更新 sidebar badge。

**優化建議（非阻塞，可後續處理）：** 評估把 PortalLayout 的 `fetchMessagesUnreadCount` 改為直接 subscribe `usePortalMessagesStore.unreadCount`，避免重複 fetch。本次整合不阻塞，可在後續 PR 處理。

## 9. Composable

新增 `src/composables/useClassHubPanelQuery.js`：

```js
export function useClassHubPanelQuery() {
  const route = useRoute()
  const router = useRouter()

  const panel = computed(() => route.query.panel || null)
  const threadId = computed(() => {
    const t = route.query.thread
    const n = t ? Number(t) : NaN
    return Number.isFinite(n) ? n : null
  })

  // guard：同 panel/thread 重複呼叫不再 push（避免 history 污染）
  function openPanel(name) {
    if (route.query.panel === name && !route.query.thread) return
    router.push({ query: { ...route.query, panel: name, thread: undefined } })
  }
  function closePanel() {
    if (!route.query.panel && !route.query.thread) return
    const { panel: _p, thread: _t, ...rest } = route.query
    router.replace({ query: rest })
  }
  function openThread(id) {
    if (route.query.panel === 'messages' && Number(route.query.thread) === id) return
    router.push({ query: { panel: 'messages', thread: String(id) } })
  }
  function closeThread() {
    if (route.query.panel === 'messages' && !route.query.thread) return
    router.push({ query: { panel: 'messages' } })
  }

  return { panel, threadId, openPanel, closePanel, openThread, closeThread }
}
```

供 PortalClassHubView、CommBar、Drawer 共用。

## 10. 測試策略

### 10.1 Playwright e2e

- `tests/e2e/portal-class-hub-comms.spec.js`（本 PR 改為手動 smoke test，e2e 留作另案）
  - 訪問 `/portal/messages` → URL 落在 `/portal/class-hub?panel=messages`，drawer 自動開啟 list view
  - 訪問 `/portal/messages/123` → drawer 進入 thread view，header 顯示 thread 標題
  - 訪問 `/portal/announcements` → **行為不變**（獨立 view 仍存活）
  - 從 class-hub 直接點訊息卡 → drawer 開
  - drawer 內 list → thread 切換 → URL query 同步更新
  - 關閉 drawer → URL query 清空
  - 沒 `PARENT_MESSAGES_WRITE` 的 user → CommBar 不顯示

### 10.2 Vitest 單元測試

- `tests/unit/composables/useClassHubPanelQuery.test.js`（已新增於 Task 1）
- 既有 messagesStore 測試 → 不動
- `tests/unit/utils/auth-permissions.test.js` → 不動

### 10.3 手動驗證

- LINE 沙箱模擬推送舊 deeplink → 在 PWA 內點開 → 落在 thread 對話視圖
- 通知中心 mock 一筆舊 link_to → 點開 → redirect 接住
- 老師帳號（無 admin 權限）登入 → 側欄無「家園溝通」群組；「公告通知」獨立 menu item 可見

## 11. 風險與相容性

| 風險 | 影響 | 緩解 |
|------|------|------|
| 已發出但未開啟的 LINE 通知 / PWA push 帶舊 messages URL | 點開 404 | router redirect 接住 |
| 通知中心 store 快取舊 link_to | 同上 | redirect 接住 |
| 教師端 PWA Service Worker 快取舊 chunk | 過渡期最後一次離線啟動可能拿到舊 router 但 view 已不存在 | SW 已有版本機制，下次連線自動更新；最壞情況 1 次 reload |
| 「家園溝通」群組消失，老師找不到舊功能 | UX | 在 release notes 與 portal 公告中說明；class-hub CommBar 與獨立「公告通知」menu item 提供清楚指引 |
| `messagesUnreadCount` 來自 store / sidebar polling 不同步點 | badge 短暫不準 | 接受（既有狀況），不額外處理 |
| 公告通知獨立後仍出現「家園溝通」殘留視覺 | 用戶混淆 | release notes 中說明分類調整原因（家園溝通 vs 校內通知） |

## 12. Out of scope（明確不在這個 spec）

- 後端 `class_hub` API 增加 `messages_unread` 聚合欄位（後續 optimization；目前前端聚合）
- 把聯絡簿（contact-book）也整進 class-hub
- 把 `/portal/home` 整併到 class-hub
- 把公告通知整進 class-hub（**已於 2026-05-04 排除**：業主反饋為校內內部通知，不屬家園溝通）
- 重構 mobile bottom-nav 結構（例如改成「工作台 / 訊息 / 排班 / 薪資 / 更多」）
- 後端 LINE Rich Menu / 通知 link_to 模板更新（router redirect 已接住，無需更新）

## 13. 交付物

1. 新增 2 元件、1 composable（CommBar、MessagesDrawer、useClassHubPanelQuery）
2. 修改 3 檔案（`PortalClassHubView.vue` / `PortalLayout.vue` / `router/index.js`）
3. 刪除 2 view 檔（PortalMessagesView、PortalMessageThreadView；**保留** PortalAnnouncementView）
4. 新增 1 unit spec（composable）；e2e 改手動 smoke test
5. PR description 須包含 deeplink 兼容矩陣與截圖（CommBar、drawer list view / thread view、sidebar 新「公告通知」入口）

## 14. 分支策略（依 user CLAUDE.md memory 慣例）

- 前端分支：`feat/portal-comm-classhub-merge-v1`
- 不影響 baseline WIP；commit 用具名 file `git add` 避免帶到其他 working changes
- 一個 PR 完成（規模可控；非 6-phase 大計畫）
