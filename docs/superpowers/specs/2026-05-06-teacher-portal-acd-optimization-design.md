# 教師端 Portal 大 polish 設計（2026-05-06）

## 背景

教師 Portal 已累積 24 個 view、9558 行；視覺與基建顯著落後於家長端 ACD（2026-05-03 完成），且後端 `home` / `contact_book` endpoint 有明顯 N+1 熱點。

本輪採三件事**整批一次到位**：

1. **方向 1**：新建工作台 dashboard（PortalHomeView）+ 修補後端 `home._classroom_card` N+1
2. **方向 2**：拆解 5 個大 view（Attendance / ContactBook / Schedule / StudentAttendance / Activity）+ 修補後端 `contact_book` photos N+1
3. **方向 3**：把家長端已驗證的基建（BottomSheet / LazyImage / useAsyncState / cache store）複用到教師端
4. **加碼**：導航重組（底部 tab + 班級教務分組）併入 Phase 1；後端 polish 收尾（ETag / audit_skip 清理 / 守衛 dedupe / parent_messages N+1）拉成 Phase 8

**Why 整批**：
- 教師端入口直跳考勤表，缺今日待辦摘要，影響日常使用
- 5 個大 view 行數量級對齊家長端 ACD 那輪（811/729/573/547/476），同樣的拆法可直接套
- 後端 N+1 修補必須跟對應 view 同 phase 改、同步發 PR（schema 必先合）
- 家長端 4 個基建元件已穩定，教師端複用零學習成本
- 8 phase × 各自獨立 branch + PR，每階段都可 review、可 revert

**Out of scope（明確不做，留下一輪）**：

- **離線寫入佇列**（IndexedDB queue for 請假/加班/補打卡）：衝突處理規則需獨立設計，本輪僅升級學生點名既有雛形（Phase 6）的 UI 提示
- **薪資 / 公告 / 個人資料 / 異常提示** 等小頁拆解：行數 < 500 不在這輪
- **學生個案頁深度改造**：屬另一條家園溝通整合路線
- **新 npm 依賴**：虛擬列表用 Element Plus 內建 `el-table-v2`，不引外部
- **權限位元 / API 行為變更**：純前端重構 + 後端效能/合規 polish
- **PWA / SW 行為改動**：讀取仍 StaleWhileRevalidate 2h

---

## 架構總覽

8-phase 漸進交付（1 基建 + 6 view + 1 後端 polish）。每 phase 一條 frontend feature branch（依 `feedback_branch_workflow.md`：`feat/teacher-acd-v1-<n>-<topic>`），含後端的 phase 額外開 backend branch（`feat/teacher-acd-v1-<n>-<topic>-be`），後端先 merge、前端後 merge（依 workspace CLAUDE.md SOP）。

| Phase | 主題 | 前端範圍 | 後端範圍 | 預期主檔行數 |
|---|---|---|---|---|
| 1 | 基建 + 導航重組 | 4 元件 / 2 composable / 底部 tab 重排 / 班級教務分組 | — | PortalLayout 微調 |
| 2 | Home dashboard 新建 | dashboard 全新打造 | `_classroom_card` batch 化 + 新增 todo 端點 | 111 → ~150 |
| 3 | ContactBook 拆解 | Drawer 拆子元件、樂觀更新、虛擬列表 | photos selectinload、412 規範化 | 890 → < 300 |
| 4 | Attendance 拆解 | 月份 cache、StatCard 套用、虛擬列表 | — | 967 → < 300 |
| 5 | Schedule 拆解 | useScheduleCalendar、mobile 日曆精度、TeacherBottomSheet | — | 701 → < 200 |
| 6 | StudentAttendance 拆解 | 月統計虛擬列表、離線雛形 UI 補強 | — | 662 → < 250 |
| 7 | Activity 拆解 | 篩選擴充、虛擬列表 | — | 468 → < 200 |
| 8 | 後端 polish 收尾 | — | parent_messages N+1 / ETag x3 / audit_skip 清理 / 守衛 dedupe | — |

子元件統一放 `src/views/portal/components/<viewName>/`（例：`components/contactBook/`），對齊家長端 ACD 慣例。

---

## Phase 1 — 基建 + 導航重組

### 1.1 新元件（4 個）

| 元件 | 路徑 | 說明 |
|---|---|---|
| `TeacherBottomSheet.vue` | `src/components/portal/TeacherBottomSheet.vue` | 從 `ParentBottomSheet` 複製，重 token 為 portal 主色（藍）；保留 snap points / 手勢 / keyboard 處理 |
| `LazyImage.vue` | `src/components/portal/LazyImage.vue` | 直接複用家長端版本（IntersectionObserver + skeleton） |
| `StatCard.vue` | `src/components/portal/StatCard.vue` | 通用統計卡（label / value / trend / icon），多頁面複用 |
| `OfflineQueueBadge.vue` | `src/components/portal/OfflineQueueBadge.vue` | 顯示「N 筆待同步」徽章，為 Phase 6 服務 |

### 1.2 新 composable / store（2 個）

| 名稱 | 路徑 | 用途 |
|---|---|---|
| `useAsyncState.js` | `src/composables/useAsyncState.js` | 統一 `{ data, loading, error, execute, refresh }`，含 ElMessage error toast；admin / portal 兩端共用 |
| `usePortalCache` (store) | `src/stores/portalCache.js` | Pinia store，集中 sheet/sessionDetail/scheduleMonth 等本地 cache + TTL + invalidate API |

### 1.3 導航重組

**底部 tab 重排（5 → 5，第 5 個從漢堡改成「我的」）**：

| 順序 | 圖示 | 路由 | 說明 |
|---|---|---|---|
| 1 | 🏠 | `/portal/home` | 工作台（新 dashboard） |
| 2 | ✓ | `/portal/attendance` | 出勤 |
| 3 | 📅 | `/portal/schedule` | 排班 |
| 4 | 👨‍🎓 | `/portal/students` | 學生 |
| 5 | 👤 | `/portal/profile` | 我的（個人選單） |

側邊欄抽屜（hamburger 仍保留在頂部 right-end，作為次要入口）按下列分組：

- **我的**：今日工作台、出勤、排班、薪資、個人資料、修改密碼
- **假勤申請**：請假、加班、補打卡
- **班級 — 教學**：班級學生、學生點名、課堂觀察、學期評量、聯絡簿
- **班級 — 管理**：事件紀錄、接送通知、用藥執行、異常提示
- **才藝**：才藝報名查詢、才藝點名
- **公告**：今日公告

### 1.4 修改的檔案

- `src/layouts/PortalLayout.vue`：底部 tab 順序、側邊欄分組
- `src/router/index.js`：`/portal` redirect 從 `attendance` 改為 `home`
- `src/views/portal/PortalHomeView.vue`：保留檔，留 Phase 2 重打
- 首次進新版彈一次性提示「導航更新」+ 連結舊位置對照表，用 `localStorage.portal_layout_v` 旗標控制

---

## Phase 2 — Home dashboard 新建（前端 + 後端 N+1）

### 2.1 後端（先 merge）

**修改 `api/portal/home.py`**：

把 `_classroom_card()` 從「迴圈內 8-10 query」改為「全班級 batch」：

- `student_count`：一次 `GROUP BY classroom_id`
- `dismissal_pending_count`：一次 `GROUP BY classroom_id`
- `consecutive_absences`：service 層改成接受 `classroom_ids: list[int]`
- `pending_contact_book_today`：新增此欄位（之前缺，前端要二次補打）

回應新增 `classrooms[*].pending_contact_book_today`、`classrooms[*].todo_count`，前端 dashboard 直接用。

**新增端點**：`GET /portal/home/today-todo` —— 回傳教師個人今日待辦：

- `pending_substitutes`：待我代理的假單（既有 leaves API 派生）
- `pending_swaps`：待回覆的排班交換（schedule API 派生）
- `pending_punch_corrections`：補打卡未審核（既有）
- `unread_announcements`：未讀公告 count（既有）

該端點 batch 在後端組裝，前端只打 1 次。

**測試**：pytest 補 `_classroom_card` query count assertion（< 5 query 4 班級情境）+ today-todo payload 結構測試。

### 2.2 前端 PortalHomeView 重打

**結構**：

| 子元件 | 路徑 | 職責 |
|---|---|---|
| `HomeHeroCard.vue` | `components/home/` | 今日打卡狀態 + 個人 avatar + 今日日期 |
| `TodoCenter.vue` | `components/home/` | 4 張待辦卡（代理假單 / 排班交換 / 補打卡 / 未讀公告），可點跳目標頁 |
| `ClassroomSummaryGrid.vue` | `components/home/` | 每班一卡（學生數 / 今日已點名 / 待寫聯絡簿 / 接送待處理） |
| `QuickActions.vue` | `components/home/` | 4 個常用按鈕（請假、加班、補打卡、學生點名） |

主檔 `PortalHomeView.vue` 控制資料流，子元件純展示。預估主檔 ~150 行。

**互動**：套 `useAsyncState` 統一 loading；StatCard 套用於待辦卡。

---

## Phase 3 — ContactBook 拆解（前端 + 後端 N+1）

### 3.1 後端（先 merge）

**修改 `api/portal/contact_book.py`**：

`/contact-book?classroom_id=&log_date=` 端點：

- `entries` query 加 `.options(selectinload(StudentContactBookEntry.attachments))`
- 移除迴圈內 `_load_photos(session, entry.id)`，改為 `attachments_by_entry: dict[int, list]` lookup
- 預期 30 query → 3 query

**規範化 If-Match 衝突回應**：既有 406 改為標準 412 + 衝突 entry payload，讓前端局部 refetch 而非整版重撈。

**測試**：pytest 補 query count assertion + 412 payload 測試。

### 3.2 前端拆解

**抽出子元件**（放 `src/views/portal/components/contactBook/`）：

| 元件 | 職責 |
|---|---|
| `ContactBookFilterBar.vue` | 班級 / 日期 / 範本選擇 |
| `ContactBookEntryCard.vue` | 單筆學生卡片（網格） |
| `ContactBookEntryDrawer.vue` | 編輯抽屜（8 欄位 + 照片）— **核心拆出** |
| `ContactBookBatchDialog.vue` | 範本套用 / 批次發布 |
| `ContactBookPhotoUploader.vue` | 照片上傳區塊（給 Drawer 用） |

**互動改善**：

- 儲存後改樂觀更新（直接修本地 list），不再 `fetchClassDay()` 全撈
- 412 衝突才局部 refetch 該 entry
- `el-table-v2` 虛擬列表（>50 學生班級不卡）
- `LazyImage` 套到照片格

**測試**：vitest 補樂觀更新 + 412 衝突情境。

主檔 `PortalContactBookView.vue` 預估 ~280 行（從 890）。

---

## Phase 4 — Attendance 拆解

**抽出子元件**（`src/views/portal/components/attendance/`）：

| 元件 | 職責 |
|---|---|
| `AttendanceMonthSticky.vue` | sticky 月份切換 + IntersectionObserver「今日」定位 |
| `AttendanceStatsCards.vue` | 月度統計（套 `StatCard`） |
| `AttendanceHalfMonthCard.vue` | 上 / 下半月卡片視圖（mobile） |
| `AttendanceDesktopTable.vue` | 桌面版表格（套 `el-table-v2`） |
| `useAttendanceMonth.js` | 月份切換 + cache 邏輯（依 `usePortalCache`） |

**改善**：

- 月份切換不再每次重 fetch，從 `usePortalCache` 取（5 分鐘 TTL）
- 桌面表格套 `el-table-v2` 虛擬列表（一次月度 30 天 × N 同事）

主檔預估 ~280 行（從 967）。

---

## Phase 5 — Schedule 拆解

**抽出子元件 / composable**：

| 名稱 | 路徑 | 職責 |
|---|---|---|
| `useScheduleCalendar.js` | composables | weeks 計算 / 邊界判定 / 高亮 |
| `ScheduleMonthHeader.vue` | components/schedule/ | 月份切換 + summary |
| `ScheduleCalendarGrid.vue` | components/schedule/ | 7×6 日曆（mobile 格子加大到 80px+） |
| `ScheduleSwapTable.vue` | components/schedule/ | 換班申請列表 |
| `ScheduleSwapDialog.vue` | components/schedule/ | 換班發起 / 回覆 dialog |

**互動改善**：

- mobile 改用 `TeacherBottomSheet` 取代原 dialog（全屏，不蓋月份導航）
- `calendarWeeks` 移到 composable，用 `computed` cached
- 換班申請列表行數預期 > 10 時加分頁（el-pagination）

主檔預估 ~190 行（從 701）。

---

## Phase 6 — StudentAttendance 拆解

**抽出子元件**：

| 元件 | 職責 |
|---|---|
| `StudentAttendanceTabs.vue` | 日 / 月 tab 容器 |
| `StudentRollcallTable.vue` | 日點名表（含快速按鈕） |
| `StudentMonthlyStats.vue` | 月統計 + 預警列表（虛擬列表） |
| `OfflineQueuePanel.vue` | 離線佇列檢視（套 `OfflineQueueBadge`） |

**改善**：

- 月統計表套 `el-table-v2` 虛擬列表
- 離線佇列「需人工確認」項目補重試 UI（不丟棄）
- 圖表元件抽出獨立檔
- Tab 切換修掉重複 fetch（watch 兩個 computed 各觸發一次）

主檔預估 ~220 行（從 662）。

---

## Phase 7 — Activity 拆解

**抽出子元件**：

| 元件 | 職責 |
|---|---|
| `ActivityRegistrationTable.vue` | 報名列表（含多班篩選） |
| `ActivitySessionList.vue` | 場次列表 |
| `ActivityRollcallDrawer.vue` | 點名抽屜（既有 `useActivityAttendanceDrawer` 保留） |

**改善**：報名列表加多班過濾、虛擬列表。

主檔預估 ~180 行（從 468）。

---

## Phase 8 — 後端 polish 收尾

| 項目 | 修改點 | 預期收益 |
|---|---|---|
| `parent_messages.py` attachment N+1 | `selectinload` + dict batch | 訊息列表 -50% query |
| ETag for `/my-schedule` | `Last-Modified: max(DailyShift.updated_at, ShiftAssignment.updated_at)` + 304 | mobile 重整 -50% 流量 |
| ETag for `/announcements` | `ETag: hash(sorted_id_list)` + Redis 1 分鐘 | 同上 |
| ETag for `/my-class-attendance/monthly` | 月統計日更 ETag | 同上 |
| `audit_skip` 清理 | 拿掉 home / medications / schedule 的 `audit_skip = True`，補 `audit_summary` | 合規追蹤 |
| `_assert_classroom_owned` dedupe | 抽到 `api/portal/_shared.py`，6 處 import | 程式品質 |

**風險控制**：先在 dev 觀察 `audit_logs` 寫入量，必要時加 sampling；ETag 端點先驗 304 行為，確保 mobile 客戶端 `If-None-Match` 正確。

---

## PR / branch 策略

仿家長端 ACD「stacked but each phase ships independently」：

- **每 phase 一條 frontend branch**：`feat/teacher-acd-v1-<n>-<topic>`
- **含後端的 phase 多開 backend branch**：`feat/teacher-acd-v1-<n>-<topic>-be`
- **發 PR 順序**：phase 內後端先 merge → 前端 rebase main → 前端 PR
- **跨 phase 順序**：phase N 完全 merge 後才開 phase N+1（不 stack 未 merge 的依賴）
- **commit 慣例**：Conventional Commits、繁體中文 description；前後端 commit 各自獨立、各自的 repo
- **不用 worktree**：前後端各自 repo 切 branch 即可

### Branch 對照表

| Phase | Frontend branch | Backend branch |
|---|---|---|
| 1 | `feat/teacher-acd-v1-1-foundation` | — |
| 2 | `feat/teacher-acd-v1-2-home-dashboard` | `feat/teacher-acd-v1-2-home-dashboard-be` |
| 3 | `feat/teacher-acd-v1-3-contact-book` | `feat/teacher-acd-v1-3-contact-book-be` |
| 4 | `feat/teacher-acd-v1-4-attendance` | — |
| 5 | `feat/teacher-acd-v1-5-schedule` | — |
| 6 | `feat/teacher-acd-v1-6-student-attendance` | — |
| 7 | `feat/teacher-acd-v1-7-activity` | — |
| 8 | — | `feat/teacher-acd-v1-8-backend-polish` |

---

## 風險與緩解

| 風險 | 緩解 |
|---|---|
| 導航重組後教師找不到入口 | `localStorage.portal_layout_v` 旗標，首次彈一次性「導航更新」提示 + 舊位置對照表 |
| 後端 N+1 修補出 bug 影響 dashboard 整版 | 後端先 merge + 1 天觀察期再合前端 phase；保留 `home_v1` endpoint 作 fallback 直到 phase 2 前端 merge |
| 樂觀更新與 412 衝突邊界處理錯 | Phase 3 必補前端 vitest（衝突情境）+ 後端 pytest（412 payload 結構） |
| 虛擬列表在 mobile Safari 卡 | 用 Element Plus 內建 `el-table-v2`（已在家長端驗過），不引第三方 |
| `audit_skip = True` 拿掉後查詢量爆增 | Phase 8 先在 dev 觀察 `audit_logs` 寫入量，必要時加 sampling |
| 教師大多用平板 / 手機，鍵盤打字測試不足 | 每 phase 結束前用 Playwright mobile viewport 跑一次 golden path |
| 8 phase 戰線拉長、main 漂移衝突 | 嚴格序列：phase N 完全 merge 才開 N+1；同時最多一個 phase 在進行，將 rebase 範圍縮到該 phase 自身 |
| 前後端 schema 對齊失誤 | 跨端變更走 workspace SOP：先定 API 契約 → 後端先行 → 前端接上 → 整合驗證 |

---

## 驗收標準

- [ ] 8 個 phase 全部 merge 到 main
- [ ] 主檔行數：5 個 view 全 < 300 行（Schedule < 200）
- [ ] 後端：home `_classroom_card` query count < 5（4 班級時，pytest 驗證）
- [ ] 後端：contact_book `/contact-book?…` query count < 5（30 人班級時，pytest 驗證）
- [ ] 前端 bundle：portal chunk gzip 不增加超過 5%（複用家長端元件，可能反而略減）
- [ ] PWA / SW 行為不變（讀取仍 SWR 2h）
- [ ] 既有 vitest / pytest 全綠 + 每 phase 補 3-5 條新測試
- [ ] Playwright mobile golden path（dashboard / 點名 / 請假 / 排班）每 phase 通過

---

## 實作流程

依 superpowers 規範：本份 spec 通過 user review 後，呼叫 `superpowers:writing-plans` 產出 phase-by-phase 實作計畫，再進入實作。每個 phase 開工前先 invoke `superpowers:using-git-worktrees`（前端）+ `superpowers:executing-plans`，並在每階段尾巴用 `superpowers:requesting-code-review`。
