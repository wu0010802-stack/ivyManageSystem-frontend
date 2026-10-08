---
paths:
  - "src/views/reports/**"
  - "src/views/ReportsView.vue"
  - "src/api/reports.ts"
---

# 重點頁面範例：報表模組

> 自 CLAUDE.md 拆出（2026-09-03，path-scoped rule）：在本 repo 內開 session 且碰到 `paths` 內檔案時自動載入；從 workspace session（add-dir 不觸發 path rule）或 Codex（不讀 .claude/rules）動這些檔前請先讀本檔。

## 重點頁面範例：報表模組

> `src/views/` 底下有 30+ 個 view（`portal/` / `salary/` / `leave/` / `activity/` 等），不一一列舉，依檔名語義即可定位；家長端為獨立 entry，見 `src/parent/views/`，非本目錄子集。下面只記錄「跨多檔協作 + 跨權限 + 帶 composable」的代表性區塊作為新增類似功能時的範本。

> ⚠ 舊版「經營分析」（`views/analytics/`、路由 `/analytics`）已於 2026-06-03（commit `4a3b4b29`）業主裁定整塊移除；`Permission.BUSINESS_ANALYTICS` 刻意保留為孤兒權限（角色管理 UI 仍列出但無對應功能），`src/composables/useAnalyticsTimeRange.ts` 孤兒檔已於 2026-07-28 清理移除。

### views/reports/

報表模組（路由 `/reports`，入口 `src/views/ReportsView.vue`）。`src/views/reports/` 下為分頁 panel：`OverviewPanel.vue`（總覽 KPI）、`AttendancePanel.vue`、`SalaryPanel.vue`、`FinanceSummaryPanel.vue`、`MonthlyPnLPanel.vue`、`MonthlyFixedCostPanel.vue` 等，共用 `chartSetup.ts`（vue-chartjs 初始化）與 `useReportPeriod.ts`（期間 composable）。
