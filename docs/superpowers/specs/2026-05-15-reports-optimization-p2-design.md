# 報表統計優化 P2：篩選與下鑽（Reports Optimization Phase 2）

**日期**：2026-05-15
**範圍**：跨前後端（ivy-backend + ivy-frontend），admin「報表統計」頁
**分支**：
- Backend：`feat/reports-p2-drilldown-backend`（worktree at `~/Desktop/ivy-backend-p2`，base main）
- Frontend：`feat/reports-p2-drilldown-frontend`（worktree at `~/Desktop/ivy-frontend`，base main）

**狀態**：設計中，待 user 審閱
**前置**：P1 已完成（PR #18 開中），useCachedAsync 慣例已建立

---

## 1. 背景與動機

P1 修了載入性能 + cache，但 admin 報表頁的「資訊解釋深度」仍受限：

- **AttendancePanel**：看到「3 月遲到 12 次」，無法知道**是誰、哪幾天**
- **AttendancePanel**：看到「A 班出勤率 92%」，無法直接看 A 班的異常記錄
- **SalaryPanel**：看到「3 月加班費 80K」，無法知道**top contributors 是誰**

「看到趨勢但問不出為什麼」是 dashboard 的典型痛點。P2 補上 drill-down 能力。

加 client-side 班級 filter，user 想聚焦特定班級時不用切頁。

---

## 2. 解決方案

### 2.1 後端新增 2 endpoint + 小改 1 處 dashboard

仿 `/api/reports/finance-summary/detail` pattern。

**前置小改**：現有 `_query_attendance_by_classroom`（`api/reports.py`）SELECT 與 response **多加 `classroom_id`**，前端 click 班級長條時用 id 開 drill-down dialog。改動 ~5 行。Schema 對前端 backward compat（多一個 key）；既有 AttendancePanel 不會 break。

#### A. `GET /api/reports/attendance/detail`

**Query params**：
- `year: int`（必填，2000-2100）
- `month: int | None`（可選，1-12；省略 = 全年）
- `classroom_id: int | None`（可選；省略 = 全班級）

**Permission**：`require_staff_permission(Permission.REPORTS)`

**Response**：
```json
{
  "year": 2026,
  "month": 3,
  "classroom_id": 5,
  "records": [
    {
      "date": "2026-03-15",
      "employee_id": 12,
      "employee_name": "王老師",
      "classroom_id": 5,
      "classroom_name": "A 班",
      "anomaly_types": ["late", "early_leave"],
      "late_minutes": 12,
      "early_minutes": 5,
      "missing_punch_in": false,
      "missing_punch_out": false,
      "note": "病假未到"
    },
    ...
  ],
  "total_records": 23,
  "truncated": false
}
```

**邏輯**：
- 查 `Attendance` 表，filter year/month/classroom
- 篩選條件：`is_late OR is_early_leave OR is_missing_punch_in OR is_missing_punch_out`（任一為 true）
- LIMIT 200，`truncated = total > 200`
- 已封存月份的記錄 OK 顯示（drill-down 是 read-only）

**Cache**：`report_cache_service` category `reports_attendance_detail`，TTL 30 分（與 `dashboard` 同）。

#### B. `GET /api/reports/salary/contributors`

**Query params**：
- `year: int`（必填）
- `month: int`（**必填**，1-12 — month-level 才有意義）

**Permission**：`require_staff_permission(Permission.REPORTS)` + 金額層遮罩（仿 F-031）：
- admin / hr → 看完整金額
- 其他角色 → `gross_salary` / `overtime_pay` 顯示 `null`，前端顯「—」

**Response**：
```json
{
  "year": 2026,
  "month": 3,
  "top_gross": [
    { "employee_id": 1, "employee_name": "王老師", "gross_salary": 65000, "is_finalized": true },
    ... // top 5 by gross
  ],
  "top_overtime": [
    { "employee_id": 7, "employee_name": "陳老師", "overtime_pay": 12500, "is_finalized": true },
    ... // top 5 by overtime_pay
  ]
}
```

**邏輯**：
- 查 `SalaryRecord` filter year+month
- top_gross：`ORDER BY gross_salary DESC LIMIT 5`
- top_overtime：`ORDER BY overtime_pay DESC LIMIT 5`（過濾掉 overtime_pay = 0/null）
- 只取 `is_finalized=True AND needs_recalc=False`（與 dashboard salary 一致；草稿不入榜）

**Cache**：`report_cache_service` category `reports_salary_contributors`，TTL 30 分。

### 2.2 前端新增 2 dialog

仿 `FinanceDetailDialog.vue`（bare axios + `loading` ref，不用 useCachedAsync — drill-down 一次性查詢）。

#### A. `views/reports/AttendanceDetailDialog.vue`

**Props**：
- `modelValue: Boolean`（v-model 控制顯示）
- `year: Number`（必填）
- `month: Number | null`（null = 全年）
- `classroomId: Number | null`（null = 全班級）
- `classroomName: String | null`（顯示用，避免 dialog 內再查名字）

**結構**：
- Title：`「{year} 年 {monthLabel} {classroomLabel} 異常記錄」`
- `<el-table>` 欄位：日期、員工、班級、異常類型（tag chips）、遲到分鐘、早退分鐘、註記
- LIMIT 200 + 「結果過多，僅顯示前 200 筆」提示

**Watch + load**：modelValue 變 true 時 load；同模板 FinanceDetailDialog。

#### B. `views/reports/SalaryContributorsDialog.vue`

**Props**：
- `modelValue: Boolean`
- `year: Number`
- `month: Number`（必填）
- `canSeeAmount: Boolean`（從 panel 傳，避免 dialog 內再查權限）

**結構**：
- Title：`「{year} 年 {month} 月 薪資榜首」`
- 兩個 `<el-table>` 並排（或上下）：top_gross 5 筆 / top_overtime 5 筆
- 欄位：員工名、金額（依 canSeeAmount 顯示或 `—`）、是否封存

### 2.3 AttendancePanel 整合

**改動**：

```vue
<script setup>
// 新增 state
const selectedClassrooms = ref([])  // 班級多選 filter
const detailDialog = ref({ visible: false, month: null, classroomId: null, classroomName: null })

// classroomChartData 加 client-side filter
const filteredClassroomData = computed(() => {
  const arr = data.value.attendance_by_classroom || []
  if (selectedClassrooms.value.length === 0) return arr
  return arr.filter(d => selectedClassrooms.value.includes(d.classroom))
})

// 點擊事件
function onMonthBarClick(month) {
  detailDialog.value = { visible: true, month, classroomId: null, classroomName: null }
}
function onClassroomBarClick(idx) {
  // idx = Chart.js 點擊事件的 data index；對應 data.value.attendance_by_classroom[idx]
  const row = data.value.attendance_by_classroom[idx]
  detailDialog.value = {
    visible: true,
    month: null,
    classroomId: row.classroom_id,
    classroomName: row.classroom,
  }
}
</script>
```

**Template 加**：
- 圖表上方加 `<el-select multiple>` 班級 filter
- 「班級 filter 只影響此圖」hint text
- Chart 元件加 `@click` 處理（Chart.js 需要透過 `onClick` option）
- 底部加 `<AttendanceDetailDialog v-model="detailDialog.visible" ...>`

**Chart click 限制**：Chart.js 4 的 click handler 透過 `options.onClick` callback。BarChart wrapper 元件需確保支援透傳 onClick。

### 2.4 SalaryPanel 整合

**改動**：
- 加 `contribDialog = ref({ visible: false, month: null })`
- BarChart `onClick` → `contribDialog.value = { visible: true, month: clickedMonth }`
- 加 `<SalaryContributorsDialog v-model="..." :year :month :canSeeAmount="hasFullSalaryView" />`
- `canSeeAmount` 從 `getUserInfo()` 推：admin/hr role → true

---

## 3. 不做的事（YAGNI）

- ❌ OverviewPanel 加 filter（KPIs 是年度總和，filter 沒意義）
- ❌ FinanceSummaryPanel 改動（已有 month filter + detail dialog，是抄它的範本）
- ❌ 班級 filter 同步影響 `attendance_monthly` 或 `leave_monthly` 圖（需後端 group_by classroom+月，schema 大改，留 P3）
- ❌ 兼職/部門 filter（需 `Employee.employment_type` 整合，scope creep）
- ❌ Dialog 內二次下鑽（顯示記錄就好，不再點）
- ❌ 異常記錄編輯／core 操作（drill-down 是 read-only）
- ❌ 匯出 dialog 內容到 Excel（現有 export 已涵蓋全部資料；drill-down 只是 UI navigation）

---

## 4. 測試策略

### Backend pytest（必補）

`tests/test_reports_drilldown.py`（新檔），預估 ~8 case：

1. `test_attendance_detail_no_filters_returns_anomalies` — 不帶 month/classroom，返回全年異常
2. `test_attendance_detail_filtered_by_month` — month=3，只返 3 月
3. `test_attendance_detail_filtered_by_classroom` — classroom_id=5，只返該班
4. `test_attendance_detail_no_permission_returns_403` — 無 REPORTS perm
5. `test_attendance_detail_truncates_at_200` — mock 250 筆，回應 `truncated=true`
6. `test_salary_contributors_top5_gross_and_overtime` — 驗證排序與 limit 5
7. `test_salary_contributors_masks_amount_for_non_admin` — REPORTS 但非 admin/hr → 金額 null
8. `test_salary_contributors_excludes_draft_salaries` — needs_recalc=true 或 is_finalized=false 不入榜

### Backend cache 不另測（沿用 `report_cache_service` 既有測試）

### Frontend 不補 dialog 測試（同 P1 慣例，mock 量大 ROI 低）

### 手動驗證

跑 `./start.sh` 後在 `http://localhost:5173/reports` 用 admin/admin123 登入：

| 場景 | 預期 |
|---|---|
| 出勤 tab → 上方班級 filter 選 A 班 | 班級長條圖只顯示 A 班；hint 顯示 |
| 出勤 tab → 月度長條 click 3 月 | dialog 開，顯示 3 月異常記錄 list |
| 出勤 tab → 班級長條 click A 班 | dialog 開，顯示 A 班全年異常 list |
| 薪資 tab → 月度長條 click 3 月 | dialog 開，top_gross/top_overtime 兩表 |
| 用非 admin/hr 帳號重做薪資 click | 金額顯示「—」 |

---

## 5. 風險與緩解

| 風險 | 緩解 |
|---|---|
| Chart.js click handler 在 BarChart wrapper 可能未透傳 | 先驗證 chartSetup.js 的 BarChart 支援 `options.onClick`；不支援則為它加 props passthrough |
| Drill-down dialog 開啟太頻繁，後端 cache 命中率低 | TTL 30 分 + 同 cache key（year, month, classroom_id）；單次點擊事件不會超量 |
| 班級 filter 只影響 `attendance_by_classroom`，user 誤以為其他圖也被 filter | UI hint「此 filter 只影響班級長條圖」放在 select 旁 |
| top_gross 5 筆 + top_overtime 5 筆可能重疊（同員工） | 兩表獨立顯示就好；不去重 |
| `classroom_name` 從 `Classroom.name` 取，已封存的歷史記錄如果班名變了會錯位 | 加 `Classroom.id` 做主鍵；前端顯示用 dialog props 的 classroomName（從點擊時的圖表 label 取）|

---

## 6. 驗收標準

1. ✅ 後端 8 個 pytest 全綠
2. ✅ 既有 backend 測試全綠（baseline 3167+，不破）
3. ✅ 既有 frontend Vitest 全綠（baseline 1365/1367 含 2 pre-existing）
4. ✅ AttendancePanel 班級 filter 正確過濾班級長條圖
5. ✅ AttendancePanel 月度 bar click → dialog 顯該月異常
6. ✅ AttendancePanel 班級 bar click → dialog 顯該班全年異常
7. ✅ SalaryPanel 月度 bar click → dialog 顯 top 5 應發 + top 5 OT
8. ✅ 非 admin/hr 帳號看薪資 dialog 金額被遮罩為「—」

---

## 7. 檔案異動清單

**Backend（worktree `~/Desktop/ivy-backend-p2`）**：

- 新增：`tests/test_reports_drilldown.py`（~250 行，8 case）
- 修改：`api/reports.py`（+ 2 endpoint，~130 行新增）

**Frontend（`~/Desktop/ivy-frontend`）**：

- 新增：`src/views/reports/AttendanceDetailDialog.vue`（~120 行）
- 新增：`src/views/reports/SalaryContributorsDialog.vue`（~100 行）
- 修改：`src/views/reports/AttendancePanel.vue`（+ filter + click handler + dialog mount，~40 行新增）
- 修改：`src/views/reports/SalaryPanel.vue`（+ click handler + dialog mount，~25 行新增）
- 修改：`src/api/reports.js`（+ 2 api 呼叫函式，~10 行）

**不動**：
- `src/composables/useCachedAsync.js`（dialog 不用 cache）
- ReportsView.vue
- OverviewPanel.vue / FinanceSummaryPanel.vue
- 任何 export endpoint
- chartSetup.js（除非 BarChart 不支援 onClick；屆時最小擴張）

---

## 8. 後續 phase 預告（不在此 spec）

- **P3**：跨圖表班級／月份同步 filter（需 backend `group_by classroom+月` 改造）；或新報表整合（ChurnPanel/FunnelPanel/才藝/招生）
- **P4**：視覺升級（KPI sparkline + YoY 對比切換）— 視 P3 後是否還有需要

每 phase 完成後再為下個 phase 寫獨立 spec。
