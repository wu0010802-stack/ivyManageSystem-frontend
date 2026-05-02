# 家長端優化批次 A+C+D 設計（2026-05-02）

## 背景

家長入口在 4/29（家園溝通平台 v2.0）→ 5/1（15 項 polish）→ 5/2（Soft UI Evolution token 化）連續三輪迭代後，視覺基底已穩定。本輪聚焦三件未盡事：

- **A — 上輪未做的 follow-up**：抽 `ParentBottomSheet` 共用元件、3 個大 view（Leaves/Fees/Activity）套 hero 卡
- **C — 大檔案拆分**：LeavesView 811 / HomeView 729 / MoreView 573 / ActivityView 547 / FeesView 476 行，拆 sub-component + composable，對齊 EmployeeView 的拆法
- **D — 效能與可靠性深挖**：today-status 跨 tab 快取 / 圖片 lazy-load / 連線狀態統一回饋

**Why**：A 與 C 在大檔案上自然交織（拆 LeavesView 時順便引入 BottomSheet），D 為 home/layout 加入新 primitives；三者統合在一輪交付，避免重複進出同一個檔案。

**Out of scope（明確不做）**：
- B 案家長 write-side（匯款回報、收據 PDF、子女檔案修改申請）— 留下一輪
- E 案前端錯誤上報 — 留下一輪
- 路由/權限/API 行為任何變更 — 純前端重構與 UI 增強
- 不引入新 npm 依賴、不引入新字型

---

## 架構總覽

6-phase 漸進交付，每個 phase 一條 frontend feature branch（依 `feedback_branch_workflow.md` 慣例：`feat/parent-acd-v1-<phase>`），各自獨立可 review、可 revert。

| Phase | 主題 | 範圍 | 檔案產出 |
|---|---|---|---|
| 1 | 基礎建設 | 4 個共用元件 / composable | `ParentBottomSheet.vue`、`LazyImage.vue`、`ConnectionBanner.vue`、`useTodayStatusCache.js`、`useConnectionStatus.js` |
| 2 | LeavesView 拆解 | 811 → <200 行 + hero + bottom sheet | `LeaveHero.vue`、`LeaveForm.vue`、`LeaveListCard.vue`、`LeaveDetailSheet.vue`、`LeaveAttachments.vue` |
| 3 | HomeView 拆解 | 729 → <150 行 + 快取 + lazy 圖 | `HomeHero.vue`、`TodayStatusCards.vue`、`TodoCenter.vue`、`ChildrenStrip.vue`、`QuickActions.vue` |
| 4 | FeesView 拆解 | 476 → <200 行 + hero + bottom sheet | `FeeHero.vue`、`FeeListGroup.vue`、`FeeReceiptSheet.vue` |
| 5 | ActivityView 拆解 | 547 → <200 行 + hero + bottom sheet + lazy 圖 | `ActivityHero.vue`、`ActivityCardList.vue`、`ActivityRegisterSheet.vue`、`RegistrationStatusList.vue` |
| 6 | MoreView 拆解 | 573 → <200 行 | `UserHeroCard.vue`、`MoreMenuGroup.vue`、`A11ySettingsSection.vue` |

每個 view 被拆出的子元件放在 `src/parent/components/<viewName>/` 對應子目錄（例：`components/leaves/`），讓元件樹和路由樹結構對齊。

---

## Phase 1 — 基礎建設

### 1.1 `ParentBottomSheet.vue`（進階版 snap points）

**檔案**：`src/parent/components/ParentBottomSheet.vue`

**Props**：

| Prop | Type | Default | 說明 |
|---|---|---|---|
| `modelValue` | `Boolean` | — | v-model 控制開關 |
| `title` | `String` | `''` | 表頭顯示 |
| `snapPoints` | `Array<'peek' \| 'mid' \| 'full'>` | `['mid', 'full']` | 開放的吸附點 |
| `defaultSnap` | `'peek' \| 'mid' \| 'full'` | `'mid'` | 開啟時預設吸附點 |
| `dismissible` | `Boolean` | `true` | 點 backdrop / drag-down 是否可關閉 |
| `showHandle` | `Boolean` | `true` | 顯示頂部 drag handle 把手 |

**吸附點高度規則**（vh = viewport height，會排除 safe area）：

- `peek`：30vh — 用於僅顯示摘要 + 一個主要動作
- `mid`：60vh — 預設值，足以放表單與短列表
- `full`：92vh — 留 8vh 給 status bar 視覺呼吸

**手勢行為**：

1. 拖曳期間：dialog 跟隨手指 Y 位置（用 `transform: translateY()`，不重排）
2. 放開時依速度與位置判定：
   - 速度 > 600px/s 且向下 → 跳到下一個 lower snap（或關閉）
   - 速度 > 600px/s 且向上 → 跳到下一個 higher snap
   - 否則吸附到距離最近的 snap point
3. 用 `transition: transform 280ms cubic-bezier(0.32, 0.72, 0, 1)` 做慣性吸附（spring-easing）
4. 當前 snap 是 `peek` 且向下拖超過 100px → 關閉
5. 當 keyboard 開啟（`visualViewport` 縮小 > 100px）→ 強制吸附到 `full` 並改成不可拖曳，避免遮輸入

**結構（slots）**：

```
+--------------------------------+
| [drag handle]                  |
| [header: title + close button] | ← slot="header"（未提供時用 title prop）
+--------------------------------+
|                                |
|  default slot (滾動區)          |
|                                |
+--------------------------------+
| [footer slot]（可選，固定底）   | ← slot="footer"
+--------------------------------+
```

**樣式**：

- 用 `--pt-elev-3` + hairline，圓角 `border-radius: 16px 16px 0 0`
- backdrop 用 `var(--pt-scrim)` + `backdrop-filter: var(--pt-backdrop-blur)`
- safe-area-inset-bottom 用 `padding-bottom: env(safe-area-inset-bottom)`

**A11y**：

- `role="dialog"` + `aria-modal="true"` + `aria-labelledby="..."` 對應 header
- 開啟時 focus trap（用 onMounted/onBeforeUnmount 管理 tabindex），關閉時還焦點給開啟者
- ESC 關閉（呼叫 `dismissible` 為 true 才生效）
- handle 給 `role="button"` + `aria-label="拖曳調整高度"` + `tabindex="0"`，鍵盤 ↑/↓ 可切換 snap

**測試**：`tests/parent/components/ParentBottomSheet.spec.js`（Vitest + happy-dom）：

1. props 預設值渲染正確（`modelValue=true` 顯示、`false` 隱藏）
2. 點 backdrop 在 `dismissible=true` 時 emit `update:modelValue=false`
3. 點 backdrop 在 `dismissible=false` 時不 emit
4. ESC 關閉行為正確
5. snap point 切換改變 `transform`（mock `getBoundingClientRect`）
6. `visualViewport` resize 觸發 keyboard 模式（mock `window.visualViewport`）

### 1.2 `LazyImage.vue`

**檔案**：`src/parent/components/LazyImage.vue`

**Props**：

| Prop | Type | Default | 說明 |
|---|---|---|---|
| `src` | `String` | — | 真實圖片 URL |
| `alt` | `String` | `''` | a11y |
| `aspectRatio` | `String` | `'1 / 1'` | CSS aspect-ratio，避免載入時跳版 |
| `rootMargin` | `String` | `'200px'` | IntersectionObserver rootMargin |
| `placeholder` | `String` | `'shimmer'` | `'shimmer' \| 'solid'` |

**行為**：

1. mount 時建 `IntersectionObserver`，`rootMargin` 預設 `200px`（提早載入避免閃白）
2. 進入視窗才設 `<img src="…">`，並加 native `loading="lazy"` 作 fallback
3. 載入中顯示 `.pt-shimmer` placeholder
4. `onerror` 顯示 fallback icon（可由 `<slot name="error">` 覆寫，預設用 `ParentIcon` 的 `image-off`）
5. unmount 自動 disconnect observer

**測試**：`tests/parent/components/LazyImage.spec.js`：

1. mount 後不立即下載（`<img>` 無 src 屬性或為空）
2. mock IntersectionObserver 觸發 `intersectionRatio > 0` 後 src 被設定
3. `onerror` 顯示 fallback slot/icon
4. unmount 後 observer disconnect

### 1.3 `useTodayStatusCache.js`

**檔案**：`src/parent/composables/useTodayStatusCache.js`

**API**：

```js
const { status, loading, error, refresh, markStale } = useTodayStatusCache()
```

**行為**：

1. **快取 key**：`parent:today-status:v1`（bump v 號當 schema 改）
2. **儲存層**：`sessionStorage`（單 tab persist 但關閉 tab 即清，符合家長使用習慣）
3. **TTL**：60 秒。讀取時若 `now - cachedAt < 60s` 直接 return cache 不打 API
4. **Stale-while-revalidate**：若 cache 在 `[60s, 300s]` 區間，先 emit cache，背景再 fetch
5. **跨 tab 同步**：用 `BroadcastChannel('parent-today-status')`：
   - 任一 tab `refresh` 成功後 `postMessage({ type: 'updated', payload, ts })`
   - 其他 tab 收到後直接更新 ref（不再打 API），並更新自己 sessionStorage
6. **可見性觸發**：`document.addEventListener('visibilitychange', ...)`，回到前景且 cache age > 60s 時自動 refresh
7. **markStale()**：手動標 stale（例如家長剛送出一筆請假回到首頁），強制下次讀重打
8. 若瀏覽器不支援 `BroadcastChannel`，自動降級為「無跨 tab 同步」（不 throw）

**測試**：`tests/parent/composables/useTodayStatusCache.spec.js`（用 fake-indexeddb 不需要，但要 mock sessionStorage 與 BroadcastChannel）：

1. 首次呼叫打 API
2. 60s 內第二次呼叫不打 API
3. 60-300s 期間 emit cache 後再次打 API（SWR）
4. `markStale()` 後下次讀必打
5. BroadcastChannel postMessage 同步更新另一 instance（用兩個 composable instance 模擬）
6. visibilityState='visible' 觸發 refresh（cache age > 60s 時）
7. 環境無 BroadcastChannel 不 crash

### 1.4 `useConnectionStatus.js`

**檔案**：`src/parent/composables/useConnectionStatus.js`

**API**：

```js
const { online, wsConnected, lastDisconnectAt, registerWs } = useConnectionStatus()
```

**行為**：

1. monitors `navigator.onLine` + `online`/`offline` event
2. WS 連線管理：`registerWs(wsInstance)` 註冊，自動掛 `onopen`/`onclose`/`onerror` 更新 `wsConnected`
3. 全域 singleton（`useConnectionStatus()` 多次呼叫共用同一 ref）
4. `lastDisconnectAt` 紀錄最近斷線時間（用於 ConnectionBanner 顯示「斷線 X 秒」）

### 1.5 `ConnectionBanner.vue`

**檔案**：`src/parent/components/ConnectionBanner.vue`

**行為**：

1. 掛在 `ParentLayout.vue` 內，視覺位置在 `<AppHeader>` 之下、`<router-view>` 之上（`position: sticky; top: <header-height>; z-index: 50`），離線/WS 斷線時把後續內容向下推 36px
2. **離線時**：顯示橘色 banner「目前離線，部分功能受限」+ 重連 retry 按鈕
3. **WS 斷線時**（online 但 wsConnected=false 超過 3 秒）：顯示淺灰 banner「即時通知暫停，正在重連...」
4. 進場用 `transform: translateY(-100%)` → `0`，280ms ease
5. 用 `--pt-tint-money`（橘暖）做離線、`--pt-tint-event`（藍）做 WS 斷線
6. ARIA `role="status"` + `aria-live="polite"`

**測試**：mock `navigator.onLine` 與 dispatch event 驗證 banner 出現/消失。

### Phase 1 驗收

- [ ] 5 個新檔案建立，所有 props/events 文件化（JSDoc 標頭）
- [ ] Vitest 全綠，覆蓋率 ≥ 80%
- [ ] `npm run build` 成功，parent app bundle gzip 增量 < 8 KB
- [ ] 手動驗證：暫時掛在現有 LeavesView detail modal 位置試開 BottomSheet（peek/mid/full 切換 + 拖曳 + ESC + backdrop），驗證後 revert，正式掛接在 Phase 2
- [ ] 切離 / 連回 wifi，ConnectionBanner 正確顯示與消失

---

## Phase 2 — LeavesView 拆解

**目標**：`src/parent/views/LeavesView.vue` 從 811 行降至 <200 行，僅剩路由 orchestration 與資料 fetch。

### 元件結構

```
src/parent/components/leaves/
├── LeaveHero.vue          # 本學期請假天數彙總卡（用 --pt-gradient-hero）
├── LeaveForm.vue           # 申請表單（日期/原因/附件）
├── LeaveListCard.vue       # 列表單筆卡片
├── LeaveDetailSheet.vue   # 詳情 BottomSheet（接 ParentBottomSheet, defaultSnap='mid'）
└── LeaveAttachments.vue   # 附件上傳/檢視/刪除（pending only）
```

### 各檔職責

- **LeaveHero.vue**：
  - Props: `summary: { total_used, by_type: { sick, personal, ... }, semester_label }`
  - 顯示左：「本學期已請 N 天」大字；右：分項 chips（病假 X / 事假 Y / 其他 Z）
  - 漸層用 `--pt-gradient-hero`，文字白色，blob 裝飾兩個（與 HomeHero 風格一致）
  - 提供 `<slot name="action">` 讓父層放「申請請假」CTA

- **LeaveForm.vue**：
  - 純表單，emit `submit(payload)`、`cancel`
  - 含日期區段、假別 select、原因 textarea、附件 input
  - 表單驗證在元件內（必填欄、開始日期 ≤ 結束日期）

- **LeaveListCard.vue**：
  - Props: `leave`，emit `click(leave)`
  - status badge / 假別 / 期間 / 天數
  - 用 `.pt-card` + `--pt-elev-1`

- **LeaveDetailSheet.vue**：
  - Props: `modelValue`, `leave`
  - 包 `<ParentBottomSheet>` `defaultSnap='mid'` `snapPoints=['mid', 'full']`
  - 內含 timeline（已送出/校方審核/完成）+ `<LeaveAttachments />`
  - cancel 按鈕（pending 時可見）

- **LeaveAttachments.vue**：
  - Props: `leaveId`, `attachments`, `editable`
  - 上傳/刪除/預覽；只在 `editable && status==='pending'` 顯示寫入 UI
  - 圖片預覽用 `<LazyImage>`

### Hero summary 取得

新增前端 helper（不改後端）：在 LeavesView setup 中對既有 leaves list 做 client-side reduce，按學期過濾後分類加總。學期定義沿用前端既有邏輯（若無則簡化為當前年度 8/1–7/31）。

**註**：若 client-side 計算因資料量大或邏輯複雜需後端聚合，留 follow-up；本輪先用 client reduce。

### Phase 2 驗收

- [ ] LeavesView.vue < 200 行
- [ ] 5 個新元件單獨可測，含 Vitest spec
- [ ] 行為等價：申請、cancel、附件上傳/刪除、detail timeline 全部表現與重構前一致
- [ ] hero 卡在 light/dark mode 對比 ≥ AA

---

## Phase 3 — HomeView 拆解

**目標**：`src/parent/views/HomeView.vue` 從 729 行降至 <150 行。

### 元件結構

```
src/parent/components/home/
├── HomeHero.vue           # 問候卡（已存在於 HomeView 內，抽出來）
├── TodayStatusCards.vue   # 今日狀態（attendance/leave/medication/dismissal）
├── TodoCenter.vue          # 6 項待辦（pending_activity_promotions、recent_leave_reviews 等）
├── ChildrenStrip.vue      # 我的孩子橫向 strip
└── QuickActions.vue       # 4 格常用操作
```

### 行為改動

- **TodayStatusCards.vue**：接 `useTodayStatusCache`，畫面進場優先顯示 sessionStorage 快取；背景 SWR 回來後平滑替換（短暫 fade）
- **ChildrenStrip.vue**：每個子女頭像改 `<LazyImage aspect-ratio="1 / 1">`
- **HomeHero.vue**：問候語邏輯（早安/午安/晚安）保留在 hero 內

### 資料流

HomeView setup 仍負責呼叫 `/home/summary` 與 `/home/today-status`（後者改走 `useTodayStatusCache`），把資料以 props 餵給子元件。**子元件不直接打 API**，只負責呈現與 emit 互動事件。

### Phase 3 驗收

- [ ] HomeView.vue < 150 行
- [ ] 切回家長端 tab：todayStatus 在 < 16ms 內顯示快取（不再 loading skeleton）
- [ ] 開兩個 tab，A tab `markStale()` 後 B tab 即時收到更新
- [ ] ChildrenStrip 滾動時新進入視窗的頭像才開始下載（DevTools Network 驗證）

---

## Phase 4 — FeesView 拆解

**目標**：`src/parent/views/FeesView.vue` 從 476 行降至 <200 行。

### 元件結構

```
src/parent/components/fees/
├── FeeHero.vue          # 未繳合計 + 最近到期日 + 「跳到應繳」CTA（用 --pt-gradient-warm）
├── FeeListGroup.vue     # 按月/按學期分組列表
└── FeeReceiptSheet.vue  # 收據 BottomSheet（含 5/1 加的「複製收據資訊/編號」動作）
```

### Hero 內容

- 大字：未繳金額合計（NT$ 格式化）
- 副字：「下期 X 月 X 日到期」（取 unpaid 中 due_date 最近一筆）
- CTA「跳到應繳」：scroll 到第一筆 unpaid item 並 highlight 1 秒

漸層：`--pt-gradient-warm`（暖橘黃，提醒繳費功能性）。

### Phase 4 驗收

- [ ] FeesView.vue < 200 行
- [ ] hero「跳到應繳」CTA 滾動到正確位置（無 unpaid 時 CTA 消失）
- [ ] 收據 sheet snap mid 預設，可拖到 full 看完整明細

---

## Phase 5 — ActivityView 拆解

**目標**：`src/parent/views/ActivityView.vue` 從 547 行降至 <200 行。

### 元件結構

```
src/parent/components/activity/
├── ActivityHero.vue            # 進行中報名數 + 待繳活動費 + 即將開課（用 --pt-gradient-info）
├── ActivityCardList.vue        # 可報名活動卡片列表（圖用 LazyImage）
├── ActivityRegisterSheet.vue   # 報名 BottomSheet（內含確認 + 注意事項）
└── RegistrationStatusList.vue  # 已報名狀態列表（含 promoted_pending）
```

### Hero 內容

- 三段：進行中報名數 / 待繳活動費 / 最近 7 天即將開課數
- 漸層：`--pt-gradient-info`（藍青資訊）
- 點擊每段可 scroll 到對應 section

### Phase 5 驗收

- [ ] ActivityView.vue < 200 行
- [ ] 活動海報圖在 viewport 外不下載（IntersectionObserver 驗證）
- [ ] 報名 sheet defaultSnap='mid'，內容多時可拖到 full

---

## Phase 6 — MoreView 拆解

**目標**：`src/parent/views/MoreView.vue` 從 573 行降至 <200 行。

### 元件結構

```
src/parent/components/more/
├── UserHeroCard.vue         # 已存在於 MoreView 內，抽出來
├── MoreMenuGroup.vue         # 通用 menu group（接 group title + items array）
└── A11ySettingsSection.vue  # a11y 設定區塊（字級/高對比，已加在最近 commit）
```

### MoreMenuGroup 設計

接收 `{ title, items: [{ icon, tint, label, to, badge? }] }`，內部統一 render，取代現有 3 段重複的 menu group HTML。

### Phase 6 驗收

- [ ] MoreView.vue < 200 行
- [ ] 三組 menu 視覺與行為與重構前一致
- [ ] a11y 設定切換即時生效

---

## 全域驗收

完成 6 phase 後：

- [ ] `npm run test` Vitest 全綠
- [ ] `npm run build` 成功
- [ ] parent-app gzip bundle 變化 ≤ +12 KB（5 個新基礎元件 + 18 個新子元件，但移除了 5 個大 view 內聯 code，淨增量應有限）
- [ ] 手動 UI 驗證 checklist（在實機 LIFF 環境）：
  - HomeView：快取秒顯、跨 tab 同步、ChildrenStrip lazy
  - LeavesView：申請、cancel、附件、detail sheet 三段 snap
  - FeesView：hero CTA scroll、收據 sheet
  - ActivityView：報名 sheet、海報 lazy
  - MoreView：menu 三組
  - ConnectionBanner：開飛航 + WS 重連模擬
  - 字級放大 ×1.25 / 高對比模式下 hero 漸層仍 ≥ AA
- [ ] dark mode 全頁面 hairline / shadow 正常

---

## 風險與緩解

| 風險 | 緩解 |
|---|---|
| BottomSheet 手勢與 LIFF iOS Safari 滾動衝突（body scroll lock） | 用 `overscroll-behavior: contain` + 拖曳期間 `touch-action: none`；在 demo page 先驗實機 |
| `BroadcastChannel` 在 iOS Safari < 15.4 不支援 | 環境檢測，無則靜默降級為單 tab cache |
| client-side hero summary 跨學期計算失準 | 暫用「當前年度 8/1–7/31」近似；後端聚合 API 列為 follow-up |
| 拆出元件後 props 過深（drilling） | 對 children store / today-status 用 composable，不走 props chain |
| bundle 增量超預期 | 每個 phase build 後比對 gzip，超 +5 KB 立刻檢視（避免再 import element-plus / 其他外部） |

---

## 不變更（明確列出避免誤改）

- 路由表 `router.js`、權限檢查邏輯
- 任何 API endpoint 或 request/response schema
- HomeView `pending_activity_promotions` / `recent_leave_reviews` 欄位語意
- `--brand-primary` `#3f7d48` 與其他既有 token
- TabBar、AppHeader、AppModal、SkeletonBlock 既有 API（只要不是這次新增的元件）
- 後端任何檔案（純前端工作）

---

## 分支策略

依 `feedback_branch_workflow.md`：

- 每 phase 一條 frontend branch：`feat/parent-acd-v1-phase{N}-<topic>`
- 例：`feat/parent-acd-v1-phase1-foundation` / `feat/parent-acd-v1-phase2-leaves`
- 每條 branch commit 用具名 file，避免帶到 baseline WIP
- Phase 1 必須先 merge 才能開 Phase 2-6
- Phase 2-6 之間無強相依（不同 view），可平行
