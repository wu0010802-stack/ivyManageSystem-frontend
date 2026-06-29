# 在籍統計折入學生模塊（StudentWorkbenchView 分頁）

- 日期：2026-06-29
- 範圍：純前端（ivy-frontend）。後端 `/student-enrollment/*` API 不動。
- 決策：把獨立的「在籍統計」頁折成「學生」頁（`/students` → `StudentWorkbenchView`）的第三個 tab，側欄移除獨立項。

## 背景與現況

- `學生`：`/students` → `views/StudentWorkbenchView.vue`，`el-tabs` 含「今日任務」`tasks`、「學生名冊」`roster」兩個 tab，panel 在 `components/student/workbench/`（`TodayTasksPanel`、`StudentListPanel`）。
- `在籍統計`：`/student-enrollment` → `views/StudentEnrollmentView.vue`，獨立一頁，自帶 `el-tabs`（「統計圖表」`stats`、「在籍記錄表」`roster`），用 `academicTermStore` 與 `@/api/studentEnrollment`，含 chart.js 懶載。側欄「學生與班級」群組中與「學生」並列。
- 權限：兩者皆 `STUDENTS_READ`，折入後權限天然一致。

## 設計

1. **搬檔成 panel**：`views/StudentEnrollmentView.vue` → `components/student/workbench/EnrollmentPanel.vue`，內容照搬（所有 import 皆 `@/` 絕對路徑，搬移零破壞）。移除頂部 `<h2>幼生在籍統計</h2>`（與 tab 標籤雙重標題），保留學年選擇 / 重新整理 / 列印 操作列與 page-meta。原 view 刪除。

2. **`StudentWorkbenchView.vue` 加第三 tab**：
   - `<el-tab-pane label="在籍統計" name="enrollment" lazy>`，內容用 `defineAsyncComponent(() => import('@/components/student/workbench/EnrollmentPanel.vue'))` 懶載 → 維持 `/students` 既有載入重量，chart.js 僅在點該 tab 時載入。
   - 深連結：`activeTab` 初始值 = `route.query.tab` 命中 `tasks|roster|enrollment` 則用之；否則 `query.action` → `roster`；預設 `tasks`。

3. **路由 redirect**（保留舊書籤）：
   ```ts
   { path: '/student-enrollment', redirect: (to) => ({ path: '/students', query: { ...to.query, tab: 'enrollment' } }) }
   ```
   guard 在 redirect 後檢查 `to.path`（=`/students`，吃 `STUDENTS_READ`）。

4. **側欄**：移除 `AdminSidebar.vue` 中 `index="/student-enrollment"` 的「在籍統計」`el-menu-item`。`/students` 高亮涵蓋。

5. **`constants/permissions.ts`**：保留 `{ path: '/student-enrollment', permission: 'STUDENTS_READ' }` 規則並更新註解（標明已成 redirect 目標），對齊 `/recruitment` redirect 的既有處理慣例。

## 測試（Vitest）

- `tests/unit/router/studentWorkbenchRoutes.spec.ts`：新增「`/student-enrollment` redirect 到 `/students` 且 `query.tab === 'enrollment'`」。
- `tests/unit/views/StudentWorkbenchView.spec.ts`：新增「`route.query.tab === 'enrollment'` 時 `activeTab` 初始化為 `enrollment`」深連結測試。
- 不需動：`AdminSidebar.test.js`（未斷言在籍統計）、e2e（未涉及）、`tests/unit/api/studentEnrollment.test.js`（API 路徑不變）。

## 受影響檔案

改 5：`StudentWorkbenchView.vue`、`router/index.ts`、`AdminSidebar.vue`、`constants/permissions.ts`、2 個 spec。
新增 1：`components/student/workbench/EnrollmentPanel.vue`。
刪除 1：`views/StudentEnrollmentView.vue`。

單一前端 commit。
