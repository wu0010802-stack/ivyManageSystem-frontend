# 學生工作台整合（/students 與 /student-academic-affairs 合併）

- **狀態**：design
- **日期**：2026-05-21
- **範圍**：純前端，0 router / 0 schema / 0 後端
- **目標**：把 sidebar 上看起來重複的「學生管理」與「學生教務管理」合併成單一動線；老師「找一個學生」與「處理當日教務任務」在同一頁完成。

## 1. 背景

目前前端與學生相關的 view 有 9 個：

| Route | 檔案 | 性質 |
|---|---|---|
| `/students` | `StudentView.vue`（634 行） | 學生列表 / 搜尋 / CRUD / 匯入匯出 |
| `/students/profile/:id` | `StudentProfileView.vue`（薄殼） → `StudentDetailPanel.vue`（439 行） | 單一學生 detail，內含 9 個 tab |
| `/student-academic-affairs` | `StudentAcademicAffairsView.vue`（284 行） | 全校教務總覽：4 個 section（attendance / leave / assessment / incident） |
| `/student-attendance` | `StudentAttendanceView.vue`（820 行） | 全校出席紀錄 |
| `/student-leaves` | `StudentLeavesListView.vue`（146 行） | 全校請假紀錄 |
| `/student-assessments` | `StudentAssessmentView.vue`（389 行） | 全校評量紀錄 |
| `/student-incidents` | `StudentIncidentView.vue`（411 行） | 全校事件紀錄 |
| `/student-enrollment` | `StudentEnrollmentView.vue`（722 行） | 在籍統計 |
| `/fees` | `StudentFeeView.vue`（107 行） | 學費管理 |

對應到 sidebar「學生教務」sub-menu 的 6 項：班級學生管理 / 學生管理 / 學生教務管理 / 在籍統計 / 接送通知 / 學費管理。

**痛點**：sidebar 上「學生管理」與「學生教務管理」名稱接近、職責邊界不直觀。`StudentDetailPanel` 已實作為 tabbed UI 並支援 `?tab=` deep-link，**架構面已存在**；本次重整不是新建 detail，是收斂入口讓老師能直覺找到它。

`/student-attendance`、`/student-leaves`、`/student-assessments`、`/student-incidents` 4 個 route **不在 sidebar**，僅作為 `/student-academic-affairs` 內 4 個 section 「展開全頁」按鈕的目的地、外部 deep-link（如簽核信件）的接收端。

## 2. 設計參數（與 user 確認）

1. 痛點來源：sidebar 入口誤導，而非 detail panel 不存在或不足。
2. 「找學生」最佳動線維持：`/students` 列表 → 點名字 → `/students/profile/:id`（DetailPanel）。
3. 主幹動作：sidebar 文案重命名 + 合併 `/students` 與 `/student-academic-affairs`。
4. 頁面形態：頂部「今日任務池」（academic-affairs 4 section） + 下方「學生列表」。
5. 4 個 detached route 保留為 deep-link，但取消頁內「展開全頁」CTA。

## 3. 不做的事（YAGNI）

- 不擴充 `StudentDetailPanel` tab 或內容。
- 不調整列表的搜尋 / CRUD / 匯入匯出 UX（搬位置，邏輯與 UI 0 變更）。
- 不做 4 section 折疊 / localStorage 偏好（現狀 4 section 同顯，未收到效能或視覺抱怨；若實測後需要，列為 follow-up）。
- 不加全域學生搜尋框（單獨 spec，本次不混入）。
- 不動 `/student-enrollment`、`/fees`、`/classrooms`、`/dismissal-queue` 等 sibling 入口。
- 不刪 4 個 detached route（保留為 deep-link，只取消頁內 CTA）。

## 4. 架構

### 4.1 新檔案

```
src/views/StudentWorkbenchView.vue                              （~150 行）
src/components/student/workbench/TodayTasksPanel.vue            （~120 行）
src/components/student/workbench/StudentListPanel.vue           （~600 行，搬自 StudentView.vue）
```

**`StudentWorkbenchView.vue`**：layout 殼。
- 頁面標題列（「學生」+ breadcrumb）。
- 上半 `<TodayTasksPanel>`，下半 `<StudentListPanel>`。
- 不持有業務狀態；不接 route params（唯一 prop 是 none）。

**`TodayTasksPanel.vue`**：包現有 4 section 元件。
- import 並渲染：`AttendanceSection` / `LeaveSection` / `AssessmentSection` / `IncidentSection`（位於 `src/components/student/academic-affairs/`）。
- 每個 section 用 `<section class="workbench-task-card">` 外包標題列。
- 透傳 `:open-full-route="null"` 隱藏「展開全頁」CTA。
- RWD：≥1280px 4 卡橫排；≥768px 2×2；<768px 縱排 4 卡。

**`StudentListPanel.vue`**：從 `StudentView.vue` 整支搬入。
- 搜尋框 / 班級篩選 / el-table / 新增 / 編輯 / 匯入 / 匯出 / 批次操作邏輯**完全保留**。
- `router.push({ name: 'student-profile', params: { id: row.id } })`（原 line 251）保留。
- 不重寫不重構；只是換 import 路徑。

### 4.2 刪除檔案

- `src/views/StudentView.vue` — 內容搬進 `StudentListPanel.vue` 後刪除。
- `src/views/StudentAcademicAffairsView.vue` — 內容搬進 `TodayTasksPanel.vue` 後刪除（284 行其實就是包 4 section + 簡單 layout，搬移成本低）。

### 4.3 Router 變更（`src/router/index.ts`）

```ts
// 原：path: '/students', component: () => import('../views/StudentView.vue')
// 改：
{
  path: '/students',
  name: 'students',
  component: () => import('../views/StudentWorkbenchView.vue'),
  meta: { title: '學生' }
}

// 新增 redirect（保護舊書籤）：
{
  path: '/student-academic-affairs',
  redirect: '/students'
}
```

**不動的 routes**：
- `/students/profile/:id`（StudentProfileView → DetailPanel）
- `/student-attendance` / `/student-leaves` / `/student-assessments` / `/student-incidents`（保留為 deep-link）
- `/student-enrollment` / `/fees` / `/classrooms` / `/dismissal-queue`

### 4.4 Sidebar 變更（`src/components/layout/AdminSidebar.vue`）

| 項 | 改前 | 改後 |
|---|---|---|
| sub-menu title | 學生教務 | 學生與班級 |
| `/students` 文案 | 學生管理 | 學生 |
| `/student-academic-affairs` 項 | 列出 | **刪除** |

`hasVisibleStudentItems` 邏輯不動（仍由內部子項權限決定 sub-menu 顯隱）；sub-menu icon `<School />` 維持。

### 4.5 「展開全頁」CTA 處置

4 個 section 元件（AttendanceSection / LeaveSection / AssessmentSection / IncidentSection）皆已具備 `:open-full-route` prop。

**TodayTasksPanel 內呼叫時傳 `:open-full-route="null"`**，由 section 內部既有邏輯判斷 null 時隱藏 CTA。

如果 section 內未實作 null-handling：spec 允許在 section 元件內補 `v-if="openFullRoute"` 一行；不算介面變更。

## 5. 既有引用 audit

`grep -rnE "(student-academic-affairs|StudentAcademicAffairs|StudentView)"`：

- `/student-academic-affairs` 字串：僅 `router/index.ts`（被刪 + redirect）、`AdminSidebar.vue`（刪除一行）、`tests/unit/views/StudentView.test.js`（無）。
- `StudentView` import：無外部 import（只有自身與 test）。
- `StudentAcademicAffairsView` import：無。
- `buildStudentProfileLink`（`src/utils/studentLinks.ts`）→ 用於 `StudentDetailPanel`、`ClassroomStudentDrawer`、`StudentLeavesListView`、`StudentAttendanceView`、`RecruitmentView`、`ChurnPanel`：**全部不動**。
- 4 section 元件（AttendanceSection 等）目前唯一 importer 是 `StudentAcademicAffairsView`；改為 `TodayTasksPanel`。

## 6. 權限

- `/students` 入口仍由 `canView.STUDENTS_READ` 守（sidebar 與 route meta）。
- `TodayTasksPanel` 內 4 section 各自的權限門 by section（既有），任一 section 無權限即不渲染。
- `StudentListPanel` 內的新增 / 編輯 / 匯入 / 匯出 / 批次操作權限門完全沿用搬移前的判斷。

## 7. 測試

### 新增
- `tests/unit/views/StudentWorkbenchView.spec.ts`
  - 渲染：頁面同時 mount TodayTasksPanel 與 StudentListPanel。
  - 點 row：列表內模擬 row click，斷言 `router.push` 被以 `name: 'student-profile', params: { id }` 呼叫。
- `tests/unit/components/student/workbench/TodayTasksPanel.spec.ts`
  - 4 section 都渲染。
  - 4 section 收到 `openFullRoute={null}`，內部「展開全頁」按鈕不存在。
- `tests/unit/components/layout/AdminSidebar.spec.ts`（已有 spec，補 case）
  - 斷言「學生」連結存在指向 `/students`。
  - 斷言「學生教務管理」連結 **不存在**。

### 遷移
- `tests/unit/views/StudentView.test.js`（119 行）→ rename 為 `tests/unit/components/student/workbench/StudentListPanel.spec.ts`；import 改 `@/components/student/workbench/StudentListPanel.vue`；斷言內容不變。

### 不動
- `tests/unit/components/StudentDetailPanelLegacyTab.test.js` 與 DetailPanel 相關，本 spec 不動。

## 8. Migration / 風險

- 影響面：3 個新檔 / 2 個檔刪除 / 1 個 router redirect / 1 個 sidebar 行刪除 + 1 個文案改 / 1 個 spec rename + 2 個新 spec。
- 唯一向後相容點：`/student-academic-affairs` 加 redirect，舊書籤可用。
- 不向後相容項：sidebar「學生管理」文案 → 「學生」（純文案）。
- 0 router / 0 schema / 0 後端動作。

## 9. Follow-ups（非本 spec 範圍）

1. 全域學生搜尋框（AdminHeader 內 typeahead → 直跳 DetailPanel）。
2. Sub-menu「學生教務」是否要改名（如「學生與班級」）。
3. 4 section 折疊 / 偏好記住（若實測後反映 4 卡同顯太重）。
4. `/student-academic-affairs` redirect 何時可移除（建議觀察 6 個月）。
5. 4 個 detached route 的長期定位（保留作 deep-link / 折回 detail panel 內 / 砍掉）。

## 10. 驗收標準

- `/students` 進入後同時顯示「今日任務池」（4 section）與「學生列表」。
- 列表 row click 行為與舊 `/students` 完全一致：跳 `/students/profile/:id`。
- `/student-academic-affairs` 進入後被 redirect 到 `/students`。
- Sidebar 「學生教務」sub-menu 內 6 項變 5 項，「學生管理」字面改為「學生」。
- 4 個 detached route（`/student-attendance` 等）URL 直訪仍可進入。
- `npm run test` 全綠（含遷移後的 `StudentListPanel.spec.ts` 與新增的 3 個 spec）。
- `npm run typecheck` 通過。
- `npm run build` 通過。
