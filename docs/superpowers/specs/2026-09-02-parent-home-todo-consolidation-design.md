# 家長端首屏任務流收斂 — 設計 spec

日期：2026-09-02
範圍：`ivy-frontend/src/parent/`（純前端，零後端變更）
底座：`origin/staging` @ `2fe63c14`
上游文件：`PRODUCT.md`／`DESIGN.md`（workspace 根目錄，家長端產品與設計權威）、`docs/superpowers/specs/2026-08-14-parent-liff-m3-expressive-redesign-design.md`

---

## 1. 背景與目標

`PRODUCT.md` 定義家長端的成功條件是「打開首頁 3 秒內看到孩子當日狀態，不需點開任何 tab」，次要才是繳費、請假、活動。8 月的 M3 Expressive 四期改版已把視覺語言與五 tab 骨架收斂完成，這輪不換皮，只處理首頁與入口的**資訊重複**與**入口斷裂**。

程式碼層已證實的重複（皆讀自 `origin/staging`）：

| 資訊 | 目前出現位置 | 各自讀取來源 |
|------|-------------|-------------|
| 待繳費用 | 首頁 bento 方格、今日動態「晚一些」桶、事務頁列徽章、我的頁 `FeeSummaryCard` 與「費用查詢」項 | `summary.fees` 被 `useHomeSummary`／`TodayView`／`useTodayTimeline`／`MeView` 四處各自 inline 讀取與型別斷言 |
| 待簽（活動簽閱） | 首頁頂部 `PendingSignBanner`、bento 方格「待簽文件」、今日動態事件 | 同一欄位 `pending_event_acks` 三處各自渲染 |
| 待簽（入學文件） | 首頁 bento 方格「入學文件簽署」 | 獨立 API `listMySignRequests()`；事務頁與快捷目錄皆無入口 |
| 臨時接送進行中 | 首頁 bento、事務頁列徽章 | `listPickupAuthorizations({status:'active'})` 兩處各打一次 |
| 孩子離園狀態 | 首頁狀態 pill「已離園」、今日動態「已接送」 | 同一 `dismissal.status === 'completed'` 兩種用詞 |

另外三個結構性訊號：今日動態的「晚一些」桶不是時間分組，是五種待辦事項被寫死塞進去的位置；事務頁缺「入學文件簽署」與「出席紀錄」入口，且「預告接送」徽章寫死為零；常見問題頁 `/assistant` 全站無任何入口。

**目標**：

1. 首頁改為三層：今日卡 → 待辦清單 → 今日動態。孩子狀態只出現一次，每件待辦只出現一次。
2. 所有待辦計數收斂到單一 composable，首頁與事務頁共用。
3. 用詞統一：離園狀態、兩種待簽在首頁、事務頁、快捷目錄三處同名。
4. 事務頁成為完整目錄，我的頁做減法，常見問題頁有入口。
5. 首屏 bundle 只減不增（`parent` entry 預算 245 KB gz，09-01 實測 237.8 KB，餘量約 3%）。

---

## 2. 範圍與非目標

**範圍**：`TodayView`（頂部區塊以下的部分）、`AdminListView`、`MeView`、`useHomeSummary`、`useTodayTimeline`、`ParentLayout` tab 徽章、`router.ts` 一個 meta 欄位；新增兩個元件與一個 composable；刪除三個元件。

**非目標（明確不做）**：

- **首頁頂部區塊整塊不動**（owner 2026-09-02 裁定）：`HomeHeroHeader` 問候列與頭像、姓名與日期班級列、多寶 `ChildContextHeader`、`QuickActionsBar` 全部（「常用功能」標題與編輯、聯絡簿滿版按鈕與狀態 pill、三格快捷、編輯 sheet 與其目錄 `quickActionModules.ts`／`useQuickActionSlots.ts`）。這些檔案的 template、文案、目錄 key 與 label 一律不改。
- 後端零改動。`GET /parent/home/summary` 已含所需欄位；入學文件簽署與臨時接送沿用既有 API。
- 不動 M3 元件、`ParentBottomSheet`／`AppModal`／`ConfirmDialog`／`ParentIcon` 的 props／events／slots（Expressive spec §7 rigid API）。
- 不碰聯絡簿頁、登入與綁定流程（方向 B 另案）、PWA／SW 行為。
- 不新增 icon glyph。家長端 Material Symbols 是自架子集字型（`styles/icons.css`），新增 glyph 要重生子集，本案一律沿用子集內既有 icon。
- 不新增使用行為量測（方向 C 另案）。
- 不做首頁以外頁面的三態補齊（方向 D 另案）。

---

## 3. 設計

### 3.1 首頁結構

新順序（由上到下）：

```
頂部區塊（HomeHeroHeader ＋ 姓名日期列 ＋ ChildContextHeader ＋ QuickActionsBar，整塊不動）
待辦清單（HomeTodoList，新）
今日交通列（HomeBusRow，新；只在有娃娃車進行中或今天不搭時出現）
PushCta（沿用 09-01 決定的位置：待辦之後）
今日動態（SectionHeader ＋ TodayTimeline，瘦身）
多寶 ChildrenStrip、行事曆 footer（沿用）
```

退場：`PendingSignBanner`、`PendingSurveyBanner`（頂部 sticky 橫幅）、bento 內「臨時接送／待繳學費／待簽文件／入學文件簽署」四格、`.today-bento` 容器本身。

「尚未綁定子女」空狀態與三態骨架／錯誤態沿用現有邏輯不動。

### 3.2 待辦清單 `HomeTodoList` 與 `useParentTodos`

**資料模型**（`src/parent/composables/useParentTodos.ts`）：

```ts
interface ParentTodo {
  key: 'fees' | 'signDocs' | 'eventAcks' | 'surveys' | 'promotions'
     | 'pickup' | 'leaveReviews' | 'announcements'
  label: string          // 固定中文，見 §3.5 用詞表
  count: number          // > 0 才產生列
  sub?: string           // 補充文字，例如「逾期 $1,200」「3 筆」
  tone: 'alert' | 'action' | 'info'
  to: string             // 目標路由
}
```

**固定順序與來源**（只在 `count > 0` 時產生該列）：

| 順序 | key | label | 來源 | tone | to |
|------|-----|-------|------|------|----|
| 1 | fees | 待繳學費 | `summary.fees.outstanding_count`；sub 為金額，`overdue > 0` 時 sub 改「逾期 $X」 | `overdue > 0` ? alert : action | `/fees` |
| 2 | signDocs | 入學文件簽署 | `listMySignRequests()` 未簽件數（沿用 `TodayView` 現行 `pendingSignDocCount` 判定） | action | `/sign` |
| 3 | eventAcks | 待簽文件 | `summary.pending_event_acks` | action | `/events` |
| 4 | surveys | 活動調查 | `summary.pending_survey_count` | action | `/surveys` |
| 5 | promotions | 才藝候補確認 | `summary.pending_activity_promotions` | action | `/activity` |
| 6 | pickup | 臨時接送進行中 | `listPickupAuthorizations({status:'active'})` 筆數 | info | `/pickup` |
| 7 | leaveReviews | 請假審核結果 | `summary.recent_leave_reviews` | info | `/leaves` |
| 8 | announcements | 未讀公告 | `summary.unread_announcements` | info | `/announcements` |

順序刻意固定，不做動態排序：家長每天看到的位置穩定，比「最急的浮上來」更符合 `PRODUCT.md`「穩定、可信」的調性。逾期以 tone 表達，不改位置。

**資料流與快取**：

- `summary` 沿用 `useHomeSummary()`（cache key `parent/today/summary`，ttl 60s，與 `TodayView`／`AdminListView` 共用同一條目、dedupe in-flight）。
- 入學文件簽署與臨時接送兩支 API 各以 `useCachedAsync` 註冊固定 key：`parent/sign-requests/mine`、`parent/pickup/active`，ttl 60s。`TodayView` 與 `AdminListView` 都改經 `useParentTodos` 取得，兩頁同時掛載只打一次。
- `useParentTodos()` 回傳 `{ todos, pending, error, refresh }`。`pending` 只在三個來源皆無資料時為真；任一來源失敗時 `error` 帶第一個錯誤，但其餘來源已有的列照常渲染（部分失敗不清空整份清單）。
- `refresh()` 一次刷新三個來源；`PullToRefresh` 與 `ParentLayout.refreshBadges` 改呼叫它。

**元件**（`src/parent/components/home/HomeTodoList.vue`）：

- 標題列用既有 `SectionHeader`：標題「待辦」，副標「N 件」（N 為 action／alert 列的 count 總和；info 列不計入，避免「未讀公告」把數字撐大）。
- 每列用既有 `M3List`／`M3ListItem`：leading `M3Icon`、headline 為 label、supporting 為 sub、trailing 為 `StatusPill`（顯示 count，tone 對應）＋ chevron。整列為 `router-link`，觸控目標 ≥ 44 px。
- `todos` 為空時整個區塊不渲染（不顯示「沒有待辦」空狀態，首頁不需要為「沒事」佔位）。
- 三態：`pending && todos.length === 0` 時顯示 `SkeletonBlock` 兩列；`error && todos.length === 0` 時顯示 `MobileErrorRetry`（`@retry` 接 `refresh`）；部分失敗且已有列時不顯示錯誤態，只在主控台 warn。
- Icon 一律取自子集內既有 glyph：fees `payments`、signDocs `edit_document`、eventAcks `mark_email_read`、surveys `fact_check`、promotions `palette`、pickup `hail`、leaveReviews `event_busy`、announcements `campaign`。

### 3.3 今日動態瘦身

`useTodayTimeline.ts` 移除五種 summary 衍生事件（fees／acks／promotions／announcements／leaveReviews），這些全部改由待辦清單承載。保留逐子女的出席、請假、用藥、接送事件與其時間桶邏輯。

另外移除「尚未到校」占位事件：孩子今天還沒有出席紀錄時，頂部聯絡簿按鈕的狀態 pill 已經寫「尚未到校」，今日動態不再為同一件事再推一列。有實際出席紀錄（含遲到等後端狀態）、請假、用藥、接送時照常顯示。

「later」桶不再有寫死事件，只剩 18:00 後或 06:00 前的真實時間事件；桶標籤由「晚一些」改為「傍晚」。空桶不渲染的既有行為不變。

### 3.4 今日交通列 `HomeBusRow`

從 `TodayView` 抽出娃娃車兩種 tile：「娃娃車」（`getBusToday()` 進行中）與逐子女「今天不搭」（`getRideCancellations()`，點擊開 `BusRideCancellationSheet`）。元件內部沿用 `StatTile`，兩欄格線；資料與 sheet 的 race guard 邏輯原樣搬移，不改行為。整列只在任一 tile 有資料時渲染。

這是純結構抽取，目的是讓 `TodayView`（774 行）縮到可維護，並讓 bus 相關測試有明確落點。

### 3.5 用詞統一表

| 語意 | 現況 | 定案 | 落點 |
|------|------|------|------|
| 孩子離園完成 | 首頁 pill「已離園」、今日動態「已接送」 | **已離園** | `useTodayTimeline.dismissalLabel()` completed 分支（pill 本身不動） |
| 活動簽閱（`/events`） | 「待簽文件」（首頁 bento／快捷目錄）、「待簽紀錄」（事務頁）、「待簽閱事件」（今日動態） | **待簽文件**（遷就不動的快捷目錄現有 label） | 待辦列、事務頁項目 |
| 入學文件電子簽（`/sign`） | 「入學文件簽署」（首頁 bento） | **入學文件簽署**（維持） | 待辦列、事務頁新項目 |
| 時間桶 later | 「晚一些」 | **傍晚** | `useTodayTimeline.BUCKET_LABEL` |

快捷目錄的 label 屬頂部區塊，不改；因此兩種待簽的定名以目錄現有的「待簽文件」為準，入學文件用全名「入學文件簽署」拉開距離。

其餘用詞遵守 `DESIGN.md` 文案守則（不用驚嘆號、不用 em dash、「老師」「簽收」「已讀」等標準片語）。

### 3.6 事務頁 `AdminListView`

項目定案（順序即顯示順序）：

| 項目 | 路由 | 徽章來源 | 異動 |
|------|------|---------|------|
| 請假 | `/leaves` | `recentLeaveReviews` | 不動 |
| 繳費 | `/fees` | `outstandingFees`，逾期時 alert | 不動 |
| 入學文件簽署 | `/sign` | `useParentTodos` signDocs count | **新增** |
| 待簽文件 | `/events` | `pendingEventAcks` | 改名（原「待簽紀錄」，對齊快捷目錄） |
| 活動調查 | `/surveys` | `pendingSurveyCount` | 不動 |
| 課後才藝 | `/activity` | `pendingActivityPromotions` | 不動 |
| 用藥委託 | `/medications` | `activeMedicationOrders` | 不動 |
| 出席紀錄 | `/attendance` | 無 | **新增** |
| 預告接送 | `/pickup-notice` | 無 | 移除寫死為 0 的徽章欄位 |
| 臨時接送 | `/pickup` | `useParentTodos` pickup count | 改共用來源（原自打 API） |

頁面三態邏輯不動。

### 3.7 我的頁 `MeView`

- 移除 `FeeSummaryCard` 區塊與偏好清單中的「費用查詢」項。費用入口只留首頁待辦列與事務頁。
- 偏好清單新增「常見問題」項（hint「登入、綁定、接送與繳費常見問題」）→ `/assistant`。`router.ts` 該路由 meta 補 `tab: 'me'`，讓底部導覽維持在「我的」高亮。
- `FeeSummaryCard.vue` 全站僅 `MeView` 使用，連同兩棵樹的測試一併刪除。
- `MeView` 自己另打一次 `useCachedAsync('parent/today/summary')` 的邏輯隨費用卡移除；hero 的推播狀態改由 `useHomeSummary().summary` 取 `me.can_push`。

### 3.8 快捷模組目錄

不動（見 §2 非目標）。原本考慮的「已抵達」併入「預告接送」與新增「入學文件簽署」進目錄，隨頂部區塊凍結一併取消；入學文件簽署的入口改由待辦列與事務頁承擔。

### 3.9 底部 tab 徽章

`useHomeSummary.adminTabBadge` 加計 `pending_survey_count`（現況事務頁本身有顯示活動調查徽章，tab 卻不計，兩處不一致）。`HomeBadges` interface 補 `pendingSurveyCount` 欄位，`AdminListView` 改讀該欄位而非自行 cast summary。

tab 徽章維持只用 summary 內的計數，不加入入學文件簽署與臨時接送兩支額外 API：`ParentLayout` 在登入頁也掛載，多打兩支 API 對徽章的收益不值。待辦清單與 tab 徽章因此可能相差入學文件簽署那一列，屬刻意取捨，寫進 `useHomeSummary` 註解。

---

## 4. 檔案異動清單

**新增**

- `src/parent/composables/useParentTodos.ts` ＋ `__tests__/useParentTodos.test.ts`
- `src/parent/components/home/HomeTodoList.vue` ＋ `__tests__/HomeTodoList.test.ts`
- `src/parent/components/home/HomeBusRow.vue` ＋ `__tests__/HomeBusRow.test.ts`

**修改**

- `src/parent/views/TodayView.vue`：移除橫幅、bento、四格 tile 與其資料抓取；掛 `HomeTodoList`／`HomeBusRow`；bus 相關 state 與 sheet 搬入 `HomeBusRow`。頂部區塊（`HomeHeroHeader`／姓名日期列／`ChildContextHeader`／`QuickActionsBar` 與傳入它們的 props、`childStatusLabel()`）原樣保留
- `src/parent/composables/useTodayTimeline.ts`：刪五種衍生事件、桶標籤、離園用詞
- `src/parent/composables/useHomeSummary.ts`：`pendingSurveyCount` 欄位、tab 徽章加總、註解
- `src/parent/views/AdminListView.vue`：項目表、共用 `useParentTodos`
- `src/parent/views/MeView.vue`：移除費用卡與費用查詢、新增常見問題
- `src/parent/router.ts`：`/assistant` meta 補 `tab: 'me'`
- `src/parent/styles/globals.css`：刪橫幅專用樣式
- `src/parent/layouts/ParentLayout.vue`：`refreshBadges` 改呼叫 `useParentTodos().refresh`（若既有 `useHomeSummary().refresh` 已足夠則不動，實作時判斷）

**刪除**（含兩棵測試樹對應測試）

- `src/parent/components/home/PendingSignBanner.vue`、`PendingSurveyBanner.vue`
- `src/parent/components/me/FeeSummaryCard.vue`

---

## 5. 約束與不變式

1. **Element-Plus-free**：`src/parent` 禁靜態 import `element-plus`，`tests/unit/parent-public-no-element-plus.test.ts` 會擋；新元件只用 `components/m3/*` 與既有共用元件。
2. **Chunk 邊界**：`scripts/check-entry-chunks.mjs` 強制 `parent` 可達集合不得含 `admin-core-*`；新元件不得引入 `@/components/` 下的 admin 共用元件（`EmptyState` 曾因此拖進 admin-core，見 08-11 記錄）。
3. **TS strict**：禁 `any`／`as any`；summary 型別斷言集中在 `useParentTodos` 一處，其餘消費端不再各自 cast。
4. **Rigid API**：`M3ListItem`／`StatusPill`／`SectionHeader`／`StatTile`／`ParentBottomSheet` 只能用既有 props，不擴 API。
5. **Icon 子集**：只用 §3.2 列出的既有 glyph；新增 glyph 屬非目標。
6. **既有 race guard 不可回退**：`TodayView` 切子女 seq 比對、bus sheet 的 disposed guard，搬入子元件時原樣保留並有測試。
7. **a11y**：待辦列為 `router-link`，`aria-label` 含 label 與 count（例「待繳學費，2 筆」）；`StatusPill` 純裝飾時 `aria-hidden`；觸控目標 ≥ 44 px；動效只用既有 motion token 並尊重 `prefers-reduced-motion`。
8. **文案**：遵守 `DESIGN.md` 文案守則與 §3.5 用詞表。

---

## 6. 測試與防回歸

- `useParentTodos`：八種列的產生條件、固定順序、逾期 tone、部分失敗不清空、三來源快取 key 固定、`refresh` 觸發三支。
- `HomeTodoList`：空陣列不渲染、副標只計 action／alert、骨架與錯誤態、`aria-label` 內容、每列 `to`。
- `HomeBusRow`：兩種 tile 顯示條件、sheet 開關與 race guard（搬移既有 `TodayView.rideCancellation.test.ts` 27 支中 bus 相關案例到此檔）。
- `useTodayTimeline`：五種衍生事件不再出現（反向斷言）、「尚未到校」占位事件不再出現、桶標籤「傍晚」、離園「已離園」。
- 頂部區塊凍結守衛：`HomeHeroHeader.vue`、`QuickActionsBar.vue`、`utils/quickActionModules.ts`、`composables/useQuickActionSlots.ts` 在本分支的 diff 必須為零（收尾以 `git diff --stat origin/staging -- <四檔>` 核對），既有測試不動照跑。
- `AdminListView`：十個項目與徽章來源、無寫死徽章。
- `MeView`：無費用卡、無費用查詢、有常見問題。
- 兩棵樹同步：`src/parent/**/__tests__/` 與 `tests/unit/parent/` 對 `TodayView`／`AdminListView` 的既有測試都要更新，刪除元件的測試兩棵樹都要刪（記憶 `feedback_parent_three_test_trees_sibling_sweep`）。
- 反向守衛：`TodayView.vue` 原始碼不得 import `PendingSignBanner`／`PendingSurveyBanner`／`StatTile`（bento 退場後 `StatTile` 只該出現在 `HomeBusRow`）。

收尾命令：家長端三棵測試樹、`vue-tsc` typecheck、eslint、`npm run build`（不可用 `npx vite build`，會跳過 chunk 守衛）、記錄 `parent` entry gz 大小前後值。

---

## 7. 風險與緩解

| 風險 | 緩解 |
|------|------|
| `TodayView` 兩棵樹共 50 餘支測試依賴 bento／橫幅結構 | 先寫新元件測試，再改 `TodayView`，逐檔更新既有測試；bus 案例整批搬到 `HomeBusRow` 測試 |
| 家長習慣 bento 方格，改成清單後找不到 | 待辦列 label 與事務頁項目同名，三格快捷完全不變；入學文件簽署從「只在有待簽時露出」變成待辦列與事務頁兩個常駐入口 |
| `useTodayTimeline` 既有測試斷言「晚一些」桶內有待繳事件 | 反向斷言改寫，同時確認 `TodayTimeline` 元件對空桶的處理未變 |
| 首屏 bundle 因新元件反增 | 三個元件刪除、bento 與四格 tile 邏輯移除，預期淨減；build 後比對 `parent` entry gz，增加即回頭找原因 |
| 部分來源失敗時清單缺列，家長誤以為沒事 | §3.2 部分失敗策略：已有列照渲染，且 `AdminListView` 保留整頁錯誤態作為第二道提示 |

---

## 8. 驗證方式

1. 本地：三棵測試樹綠、typecheck／lint 綠、`npm run build` 過 chunk 守衛。
2. staging 走查（需管理端簽發一組家長裝置登入碼）：
   - 首頁：頂部區塊與 staging 現況逐像素相同；一位有待繳、有待簽文件、有入學文件簽署的家長，待辦列每件只出現一次、今日動態無待辦事件、無「尚未到校」占位列。
   - 零待辦家長：待辦區塊整個消失，PushCta 與今日動態緊接今日卡。
   - 多寶家長：切換子女後待辦列與交通列跟著刷新。
   - 事務頁：十個項目、入學文件簽署與出席紀錄可進、預告接送無徽章。
   - 我的頁：無費用卡、常見問題可進且底部「我的」高亮。
3. 走查通過後依 `docs/sop/staging-promotion-flow.md` 走 staging 閘門，升 prod 需 owner 授權。

---

## 9. 交付

單一批次，一條 feature branch（`feat/parent-home-todo-consolidation`，worktree `.claude/worktrees/parent-home-todo`，底座 `origin/staging`）。實作計畫由 writing-plans 細化，順序建議：composable → 新元件 → `TodayView` 重排 → 事務頁／我的頁 → 兩棵樹測試收尾 → 頂部區塊零 diff 核對 → build 與 bundle 比對。
