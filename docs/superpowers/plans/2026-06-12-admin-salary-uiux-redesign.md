# Admin 後台視覺換膚 + 薪資月結流程重設計 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全 Admin 後台換上「C・沉穩高密度」視覺（青藍主色、深色側欄精修、表格密度規範），並把薪資功能從 7 個平行 tab 重組為「工作台 + 5 步月結嚮導 + 3 個獨立頁」。

**Architecture:** 純前端（ivy-frontend），後端零修改。視覺層走 design token + Element Plus CSS 變數整體換膚；流程層以 `useSalarySettlement` composable 為單一資料來源（月狀態推導 + 異常偵測），工作台與嚮導各步驟共用。既有 8 個 panel 元件原地重用不搬檔。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、Element Plus（unplugin auto-import）、vue-router 4（hash history）、Vitest（happy-dom、co-located `__tests__`）。

**Spec:** `docs/superpowers/specs/2026-06-12-admin-salary-uiux-redesign-design.md`
（路徑修正：spec 寫 `/admin/salary`，實際 codebase admin 路由為根層平面式（`/salary`、`/employees`），本計畫沿用平面式 `/salary/*`，保留站內既有引用與 e2e path 不破。）

---

## 既有事實（執行前必讀，全部已驗證）

1. **git 基底**：以 **local main**（`6b53f98c`）開 worktree，**不要用 origin/main**（local main 領先 33 commits 含薪資修補、落後 0）。main 已 checkout 在 `.worktrees/merge-main-2026-06-03`，所以要開新分支 worktree。
2. **主目錄是使用者 WIP 區**（`feat/dismissal-ux-2026-06-04-fe` + 未提交的 festivalCoverage 修改），**不可在主目錄工作**。festivalCoverage WIP 動到「節慶獎金」欄 header 與 SalaryView style 尾端——本重構會搬同一段 template，落地時需與使用者確認該 WIP 歸屬（衝突點：StepReview 的表格 header）。
3. **node_modules 是 tracked symlink**（`../../node_modules`，skip-worktree）：worktree 開在 `.worktrees/<name>`（深度 2）時 symlink 正好解析回主 checkout 的真目錄，**不需 npm install**；開在其他深度則要重建絕對 symlink。
4. **records API 欄位**：`needs_recalc` 以 `breakdown_stale` 欄位外露；金額欄有前端別名 `net_pay`/`total_deductions`（複數）；含 `is_finalized / finalized_at / finalized_by / manual_overrides / version`。
5. **`POST /salaries/finalize-month` 後端已存在、前端沒有 wrapper**。request `{year, month, force?, force_reason?}`（force 需 reason ≥10 字 + `ACTIVITY_PAYMENT_APPROVE` 權限）；非 force 時缺員工或 stale 紀錄回 **409**。`unfinalizeSalary` wrapper 已存在（reason ≥10 字、不可自我解封）。
6. **precheck 可用 API**：`getLeaves({year,month,status:'pending'})`（區間重疊語意，跨月單兩個月都出現）、`getOvertimes(同)`、`getCorrections(同)`（`src/api/punchCorrections.ts`）。
7. **權限**：`ROUTE_PERMISSION_RULES` 在 `src/constants/permissions.ts:80-152`，格式 `{path, permission, prefix?}`，**最長 path 匹配優先、default-deny**。`/salary` 現有規則 `{ path: '/salary', permission: 'SALARY_READ' }`（:103）。
8. **EP 主題現況**：`--el-color-primary` 只在 dark scope 被覆寫（a11y.css:169）；亮色靠 main.css 的 `.el-button--primary !important` 蓋 `--color-primary` alias。brand token 在 design-tokens.css:175-177（indigo `#4f46e5`）。
9. **測試慣例**：composable 測試用 `effectScope()` 包（範本 `src/composables/__tests__/useFormDraft.test.ts`）；元件測試 mock api 模組 + `vi.mock('element-plus', importOriginal...)` 只覆寫 ElMessage/ElMessageBox + el-* 字串 stub；teleport 內容加 `stubs: { teleport: true }`。
10. **既有可重用元件**：`PageHeader`（title/subtitle + actions/filters slots）、`StatCard`、`EmptyState`、`LoadingPanel`、`TableSkeleton`、`SalaryBreakdown`（props: row/year/month）、`SalarySnapshotDialog`（v-model + year/month/canWrite）。
11. e2e 只用 `/salary` path 字串（admin-pages-render / a11y-baseline），無 UI selector；路徑保留即不破。

---

## File Structure

```
（修改）src/assets/design-tokens.css        ← brand 青藍 + sidebar token
（修改）src/assets/main.css                 ← EP --el-color-primary 變數組 + 表格密度/金額規範
（修改）src/components/layout/AdminSidebar.vue  ← 硬編碼色 → token
（修改）src/components/layout/AdminHeader.vue   ← parentTitle 麵包屑
（修改）src/api/salary.ts                   ← + finalizeMonth
（修改）src/router/index.ts                 ← /salary 5 路由
（修改）src/constants/permissions.ts        ← prefix 規則
（新增）src/composables/useSalarySettlement.ts + __tests__/useSalarySettlement.test.ts
（新增）src/views/salary/SalaryHubView.vue
（新增）src/views/salary/SalarySettleView.vue
（新增）src/views/salary/settle/StepPrecheck.vue / StepCalculate.vue / StepReview.vue /
        AdjustDrawer.vue / StepFinalize.vue / StepExport.vue
（新增）src/views/salary/SalaryHistoryView.vue / SalarySimulateView.vue / SalarySettingsView.vue
（刪除）src/views/SalaryView.vue（Task 15）
```

---

### Task 0: Worktree 基底

- [ ] **Step 0.1** 建 worktree（從 local main）：
```bash
git -C /Users/yilunwu/Desktop/ivy-frontend worktree add .worktrees/salary-uiux -b feat/admin-salary-uiux-2026-06-12-fe main
```
- [ ] **Step 0.2** 驗證 node_modules symlink 與基底：
```bash
ls -la /Users/yilunwu/Desktop/ivy-frontend/.worktrees/salary-uiux/node_modules   # 應解析到主 checkout
git -C /Users/yilunwu/Desktop/ivy-frontend/.worktrees/salary-uiux log --oneline -1  # 6b53f98c
```
若 symlink 失效：`rm node_modules && ln -s /Users/yilunwu/Desktop/ivy-frontend/node_modules node_modules`
- [ ] **Step 0.3** 基線：`cd .worktrees/salary-uiux && npm run typecheck`（預期 0 錯）。之後所有命令都在此 worktree 下執行，git 命令一律 `git -C` 絕對路徑。

---

### Task 1: 視覺 token 換膚（青藍主色 + sidebar token + EP 變數）

**Files:** Modify `src/assets/design-tokens.css:175-177`、`src/assets/main.css`

- [ ] **Step 1.1** design-tokens.css 把 brand accent 區（:175-177）改為：
```css
    /* Brand accent（admin = C・沉穩高密度 青藍，2026-06-12 改版） */
    --brand-primary: #0284c7;
    --brand-primary-hover: #0369a1;
    --brand-primary-soft: #e0f2fe;

    /* Admin 深色側欄（C 方向精修） */
    --sidebar-bg: #1e2a3a;
    --sidebar-bg-active: #314257;
    --sidebar-text: #94a3b8;
    --sidebar-text-hover: #e2e8f0;
    --sidebar-text-active: #7dd3fc;
```
- [ ] **Step 1.2** main.css 的 `:root` alias 區（:7-30）尾端加 EP 主色變數組（亮色全域，dark scope 由 a11y.css 維持不動）：
```css
:root {
    --el-color-primary: var(--brand-primary);
    --el-color-primary-light-3: #4ea9d8;
    --el-color-primary-light-5: #80c1e3;
    --el-color-primary-light-7: #b3daee;
    --el-color-primary-light-8: #cce6f4;
    --el-color-primary-light-9: #e6f3f9;
    --el-color-primary-dark-2: #026a9f;
}
```
- [ ] **Step 1.3** `npm run lint:css`（預期 0 錯）、`npm run lint:tokens`
- [ ] **Step 1.4** 起 dev server 走查（`npm run dev -- --port 3000 --strictPort`，避撞主目錄 5173）：登入頁、首頁、員工頁、薪資頁——主色全變青藍、無 indigo 殘留（el-button/el-tabs active/el-switch/連結）
- [ ] **Step 1.5** Commit：
```bash
git -C <worktree> add src/assets/design-tokens.css src/assets/main.css
git -C <worktree> commit -m "feat(ui): admin 主色換青藍 + 深色側欄 token + EP 主色變數組（C 沉穩高密度）"
```

### Task 2: 表格密度與金額規範

**Files:** Modify `src/assets/main.css`（.el-table 區 :178-184 附近）

- [ ] **Step 2.1** main.css `.el-table` 區擴充：
```css
.el-table {
    --el-table-header-bg-color: var(--neutral-50);
    --el-table-header-text-color: var(--neutral-500);
    --el-table-row-hover-bg-color: var(--neutral-50);
    font-variant-numeric: tabular-nums;
}
/* 金額欄統一靠右等寬；新頁面的金額 el-table-column 加 class-name="num-cell" align="right" */
.el-table .num-cell { font-variant-numeric: tabular-nums; }
/* 密度：admin 表格預設緊湊（C 方向） */
.el-table .el-table__cell { padding-top: 6px; padding-bottom: 6px; }
```
（保留既有三個變數行為基準，只新增；若該區已有同名規則則就地修改。）
- [ ] **Step 2.2** `npm run lint:css`；dev server 抽查員工/薪資/考勤三頁表格（密度、hover、數字對齊）
- [ ] **Step 2.3** Commit：`feat(ui): 表格密度規範 + 金額 tabular-nums`

### Task 3: AdminSidebar 套 token + AdminHeader 麵包屑

**Files:** Modify `src/components/layout/AdminSidebar.vue`、`src/components/layout/AdminHeader.vue:146 附近`

- [ ] **Step 3.1** AdminSidebar：el-menu 的硬編碼色 props（`background-color="#1e293b"` 等，:12-22）移除，改在 style 區用 EP menu 變數吃 token：
```css
.admin-sidebar { background-color: var(--sidebar-bg); }
.admin-sidebar .el-menu {
    --el-menu-bg-color: var(--sidebar-bg);
    --el-menu-text-color: var(--sidebar-text);
    --el-menu-hover-text-color: var(--sidebar-text-hover);
    --el-menu-active-color: var(--sidebar-text-active);
    --el-menu-hover-bg-color: var(--sidebar-bg-active);
    border-right: none;
}
.admin-sidebar .el-menu-item.is-active { background-color: var(--sidebar-bg-active); }
```
（:350-361 的 `.admin-sidebar` 既有規則同步改用 `--sidebar-bg`。）
- [ ] **Step 3.2** AdminHeader 標題支援父層脈絡：script 加
```ts
const parentTitle = computed(() => (route.meta?.parentTitle as string) || '')
```
pageTitle 顯示處（:146 附近）改為：
```html
<span v-if="parentTitle" class="page-title__parent">{{ parentTitle }} / </span>{{ pageTitle }}
```
style 加 `.page-title__parent { color: var(--text-tertiary); font-weight: 400; }`
- [ ] **Step 3.3** 跑既有 layout 相關測試 + typecheck：`npx vitest run src/components/layout tests/components 2>/dev/null; npm run typecheck`
- [ ] **Step 3.4** dev server 走查側欄（hover/active/badge）與 header；Commit：`feat(ui): 側欄 token 化 + header 父層標題`

### Task 4: api/salary.ts 補 finalizeMonth

**Files:** Modify `src/api/salary.ts`

- [ ] **Step 4.1** 在 `unfinalizeSalary` 旁加（薄 axios wrapper，依 api 層慣例不另寫測試；行為由 Step 13 元件測試覆蓋）：
```ts
export interface FinalizeMonthPayload { year: number; month: number; force?: boolean; force_reason?: string }
export interface FinalizeMonthResult {
    message: string; count: number; finalized_by: string; finalized_at: string
    force: boolean; skipped_missing: string[]; skipped_stale: string[]
}
// 整月封存：非 force 時缺員工/含 stale 紀錄會 409；force 需 reason ≥10 字 + 財務覆核權限
export const finalizeMonth = (payload: FinalizeMonthPayload) =>
    api.post<FinalizeMonthResult>('/salaries/finalize-month', payload)
```
- [ ] **Step 4.2** `npm run typecheck`；Commit：`feat(salary): 接 finalize-month 整月封存 API`

### Task 5: 路由 + 權限規則

**Files:** Modify `src/router/index.ts:143-148`、`src/constants/permissions.ts:103`；Test `src/constants/__tests__/salaryRoutePermissions.test.ts`

- [ ] **Step 5.1** 先寫測試（RED）：
```ts
import { describe, it, expect } from 'vitest'
import { ROUTE_PERMISSION_RULES } from '@/constants/permissions'

describe('salary 子路由權限規則（default-deny 防鎖死）', () => {
    it('有 /salary prefix 規則涵蓋所有子頁', () => {
        expect(ROUTE_PERMISSION_RULES.some(r => r.path === '/salary' && r.permission === 'SALARY_READ' && r.prefix === true)).toBe(true)
    })
})
```
Run：`npx vitest run src/constants/__tests__/salaryRoutePermissions.test.ts` → FAIL
- [ ] **Step 5.2** permissions.ts:103 的 `{ path: '/salary', permission: 'SALARY_READ' }` 改為 `{ path: '/salary', permission: 'SALARY_READ', prefix: true }`（最長匹配在此無子規則，prefix 即涵蓋全部子頁；頁內細粒度由 v-if 守）
- [ ] **Step 5.3** router/index.ts:143-148 換成 5 條路由：
```ts
{ path: '/salary', name: 'salary', component: () => import('../views/salary/SalaryHubView.vue'), meta: { title: '薪資管理' } },
{ path: '/salary/settle', name: 'salary-settle', component: () => import('../views/salary/SalarySettleView.vue'), meta: { title: '月結', parentTitle: '薪資管理' } },
{ path: '/salary/history', name: 'salary-history', component: () => import('../views/salary/SalaryHistoryView.vue'), meta: { title: '薪資歷史', parentTitle: '薪資管理' } },
{ path: '/salary/simulate', name: 'salary-simulate', component: () => import('../views/salary/SalarySimulateView.vue'), meta: { title: '薪資試算', parentTitle: '薪資管理' } },
{ path: '/salary/settings', name: 'salary-settings', component: () => import('../views/salary/SalarySettingsView.vue'), meta: { title: '薪資設定', parentTitle: '薪資管理' } },
```
（此時元件還不存在，先建 Step 5.4 的殼再 typecheck。）
- [ ] **Step 5.4** 建 5 個最小殼檔（之後任務逐一填肉），每個：
```vue
<template><div>WIP</div></template>
<script setup lang="ts"></script>
```
- [ ] **Step 5.5** GREEN + 回歸：`npx vitest run src/constants src/router; npm run typecheck`
- [ ] **Step 5.6** Commit：`feat(salary): 薪資 IA 拆 5 路由 + prefix 權限規則`

### Task 6: 三個獨立頁（Settings / History / Simulate）

**Files:** 填 `SalarySettingsView.vue`、`SalaryHistoryView.vue`、`SalarySimulateView.vue`

- [ ] **Step 6.1** `SalarySettingsView.vue`（收 4 個自含式 panel，零 props；bonus 沿用原 SETTINGS_READ 閘）：
```vue
<template>
  <div>
    <PageHeader title="薪資設定" subtitle="獎金規則、才藝老師、系統參數與計算邏輯說明" />
    <el-tabs v-model="tab" type="card">
      <el-tab-pane v-if="canReadSettings" label="獎金設定" name="bonus"><BonusConfigPanel v-if="tab === 'bonus'" /></el-tab-pane>
      <el-tab-pane label="才藝老師薪資" name="art_teacher"><ArtTeacherPayrollPanel v-if="tab === 'art_teacher'" /></el-tab-pane>
      <el-tab-pane label="系統設定" name="system_settings"><SystemSettingsPanel v-if="tab === 'system_settings'" /></el-tab-pane>
      <el-tab-pane label="薪資邏輯" name="logic"><SalaryLogicPanel v-if="tab === 'logic'" /></el-tab-pane>
    </el-tabs>
  </div>
</template>
<script setup lang="ts">
import { ref, computed } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import BonusConfigPanel from './BonusConfigPanel.vue'
import ArtTeacherPayrollPanel from './ArtTeacherPayrollPanel.vue'
import SystemSettingsPanel from './SystemSettingsPanel.vue'
import SalaryLogicPanel from './SalaryLogicPanel.vue'
import { hasPermission } from '@/utils/auth'
const canReadSettings = computed(() => hasPermission('SETTINGS_READ'))
const tab = ref(canReadSettings.value ? 'bonus' : 'art_teacher')
</script>
```
- [ ] **Step 6.2** `SalaryHistoryView.vue`：PageHeader「薪資歷史」+ `<SalaryHistoryPanel v-if="canReadEmployees" />`（`hasPermission('EMPLOYEES_READ')`，else `<EmptyState description="需要員工讀取權限" />`）。同頁放快照入口按鈕開 `SalarySnapshotDialog`（年月選擇器 + v-model，props 照 :15-23 介面，canWrite=`hasPermission('SALARY_WRITE')`）。
- [ ] **Step 6.3** `SalarySimulateView.vue`：PageHeader「薪資試算」+ `<SalarySimulatePanel />`。
- [ ] **Step 6.4** `npx vitest run src/views/salary; npm run typecheck`；dev server 點三頁；Commit：`feat(salary): 設定/歷史/試算獨立頁`

### Task 7: useSalarySettlement composable（TDD）

**Files:** Create `src/composables/useSalarySettlement.ts`、`src/composables/__tests__/useSalarySettlement.test.ts`

- [ ] **Step 7.1** 寫失敗測試（範本照 useFormDraft.test.ts 的 effectScope pattern；mock `@/api/salary`）：
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { deriveStatus, detectAnomalies, sortByAttention, getThresholds, setThresholds, DEFAULT_THRESHOLDS } from '@/composables/useSalarySettlement'

const rec = (over: Record<string, unknown> = {}) => ({
    id: 1, employee_id: 'E1', employee_name: '測試', version: 1,
    gross_salary: 40000, net_salary: 36000, is_finalized: false,
    breakdown_stale: false, manual_overrides: [], ...over,
})

describe('deriveStatus', () => {
    it('無紀錄 → not_calculated', () => expect(deriveStatus([])).toBe('not_calculated'))
    it('任一 breakdown_stale → needs_recalc（優先於覆核中）', () =>
        expect(deriveStatus([rec(), rec({ breakdown_stale: true })])).toBe('needs_recalc'))
    it('未全封存 → reviewing', () =>
        expect(deriveStatus([rec({ is_finalized: true }), rec()])).toBe('reviewing'))
    it('全封存 → finalized（stale 的封存單不再觸發重算態）', () =>
        expect(deriveStatus([rec({ is_finalized: true }), rec({ is_finalized: true, breakdown_stale: true })])).toBe('finalized'))
})

describe('detectAnomalies', () => {
    const prev = [rec({ net_salary: 30000, gross_salary: 33000 })]
    it('差異 ≥10% 觸發（邊界含）', () => {
        const out = detectAnomalies([rec({ net_salary: 33000, gross_salary: 33000 })], prev, DEFAULT_THRESHOLDS)
        expect(out.get('E1')?.some(r => r.type === 'diff' && r.field === 'net_salary')).toBe(true)
    })
    it('差異 <10% 且 <$3000 不觸發', () => {
        const out = detectAnomalies([rec({ net_salary: 31000, gross_salary: 33000 })], prev, DEFAULT_THRESHOLDS)
        expect(out.has('E1')).toBe(false)
    })
    it('絕對額 ≥$3000 即使 <10% 也觸發', () => {
        const out = detectAnomalies([rec({ net_salary: 33000, gross_salary: 33000 })],
            [rec({ net_salary: 30001, gross_salary: 33000 })], DEFAULT_THRESHOLDS)
        expect(out.get('E1')?.some(r => r.type === 'diff')).toBe(true)
    })
    it('manual_overrides 觸發', () => {
        const out = detectAnomalies([rec({ manual_overrides: ['net_salary'] })], prev, DEFAULT_THRESHOLDS)
        expect(out.get('E1')?.some(r => r.type === 'manual')).toBe(true)
    })
    it('本月新進（上月無此人）觸發 new', () => {
        const out = detectAnomalies([rec({ employee_id: 'E9' })], prev, DEFAULT_THRESHOLDS)
        expect(out.get('E9')?.some(r => r.type === 'new')).toBe(true)
    })
    it('上月空（系統首月）→ 不產生 diff/new', () => {
        expect(detectAnomalies([rec()], [], DEFAULT_THRESHOLDS).size).toBe(0)
    })
})

describe('sortByAttention', () => {
    it('異常在前、其餘維持原序', () => {
        const a = rec({ employee_id: 'A' }); const b = rec({ employee_id: 'B' })
        const flags = new Map([['B', [{ type: 'manual' as const }]]])
        expect(sortByAttention([a, b], flags).map(r => r.employee_id)).toEqual(['B', 'A'])
    })
})

describe('thresholds（localStorage per 裝置）', () => {
    beforeEach(() => localStorage.clear())
    it('預設值', () => expect(getThresholds()).toEqual({ pct: 0.1, abs: 3000 }))
    it('set 後可讀回、壞 JSON 回預設', () => {
        setThresholds({ pct: 0.2, abs: 5000 })
        expect(getThresholds()).toEqual({ pct: 0.2, abs: 5000 })
        localStorage.setItem('ivy_salary_anomaly_thresholds', '{bad')
        expect(getThresholds()).toEqual({ pct: 0.1, abs: 3000 })
    })
})
```
Run → FAIL（模組不存在）
- [ ] **Step 7.2** 實作 `useSalarySettlement.ts`：
```ts
import { ref, computed, watch, type Ref } from 'vue'
import { getRecords } from '@/api/salary'
import { useErrorNotify } from '@/composables/useErrorNotify'

export type SettlementStatus = 'not_calculated' | 'needs_recalc' | 'reviewing' | 'finalized'
export interface SettlementRecord {
    id: number; employee_id: string | number; employee_name: string; version: number
    gross_salary: number; net_salary: number; is_finalized: boolean
    breakdown_stale: boolean; manual_overrides: string[]
    [key: string]: unknown
}
export type AnomalyReason =
    | { type: 'diff'; field: 'net_salary' | 'gross_salary'; pct: number; abs: number }
    | { type: 'manual' } | { type: 'new' }
export type AnomalyMap = Map<string | number, AnomalyReason[]>
export interface Thresholds { pct: number; abs: number }

export const DEFAULT_THRESHOLDS: Thresholds = { pct: 0.1, abs: 3000 }
const THRESHOLDS_KEY = 'ivy_salary_anomaly_thresholds'
const MONITORED_FIELDS = ['net_salary', 'gross_salary'] as const

export function getThresholds(): Thresholds {
    try {
        const raw = localStorage.getItem(THRESHOLDS_KEY)
        if (!raw) return { ...DEFAULT_THRESHOLDS }
        const parsed: unknown = JSON.parse(raw)
        if (typeof parsed === 'object' && parsed !== null
            && typeof (parsed as Thresholds).pct === 'number' && typeof (parsed as Thresholds).abs === 'number') {
            return parsed as Thresholds
        }
    } catch { /* 壞值回預設 */ }
    return { ...DEFAULT_THRESHOLDS }
}
export function setThresholds(t: Thresholds): void {
    localStorage.setItem(THRESHOLDS_KEY, JSON.stringify(t))
}

export function deriveStatus(records: SettlementRecord[]): SettlementStatus {
    if (records.length === 0) return 'not_calculated'
    if (records.every(r => r.is_finalized)) return 'finalized'
    if (records.some(r => !r.is_finalized && r.breakdown_stale)) return 'needs_recalc'
    return 'reviewing'
}

export function detectAnomalies(
    current: SettlementRecord[], previous: SettlementRecord[], thresholds: Thresholds,
): AnomalyMap {
    const out: AnomalyMap = new Map()
    const push = (id: string | number, reason: AnomalyReason) => {
        if (!out.has(id)) out.set(id, [])
        out.get(id)!.push(reason)
    }
    const prevById = new Map(previous.map(r => [r.employee_id, r]))
    for (const cur of current) {
        if ((cur.manual_overrides ?? []).length > 0) push(cur.employee_id, { type: 'manual' })
        if (previous.length === 0) continue   // 系統首月：無比較基準
        const prev = prevById.get(cur.employee_id)
        if (!prev) { push(cur.employee_id, { type: 'new' }); continue }
        for (const field of MONITORED_FIELDS) {
            const a = Number(cur[field] ?? 0); const b = Number(prev[field] ?? 0)
            const abs = Math.abs(a - b)
            const pct = b !== 0 ? abs / Math.abs(b) : (a !== 0 ? 1 : 0)
            if (pct >= thresholds.pct || abs >= thresholds.abs) {
                push(cur.employee_id, { type: 'diff', field, pct, abs })
            }
        }
    }
    return out
}

export function sortByAttention(records: SettlementRecord[], anomalies: AnomalyMap): SettlementRecord[] {
    const flagged = records.filter(r => anomalies.has(r.employee_id))
    const normal = records.filter(r => !anomalies.has(r.employee_id))
    return [...flagged, ...normal]
}

/** 月結單一資料來源：工作台與嚮導各步驟共用 */
export function useSalarySettlement(year: Ref<number>, month: Ref<number>) {
    const { notify } = useErrorNotify()
    const records = ref<SettlementRecord[]>([])
    const prevRecords = ref<SettlementRecord[]>([])
    const loading = ref(false)
    const thresholds = ref(getThresholds())

    const refresh = async () => {
        loading.value = true
        try {
            const prevY = month.value === 1 ? year.value - 1 : year.value
            const prevM = month.value === 1 ? 12 : month.value - 1
            const [cur, prev] = await Promise.all([
                getRecords(year.value, month.value),
                getRecords(prevY, prevM).catch(() => ({ data: [] })),  // 上月失敗不擋本月
            ])
            records.value = (cur.data ?? []) as unknown as SettlementRecord[]
            prevRecords.value = ((prev as { data: unknown }).data ?? []) as SettlementRecord[]
        } catch (e) { notify(e, 'useSalarySettlement.refresh', '載入薪資紀錄失敗') }
        finally { loading.value = false }
    }
    watch([year, month], refresh)

    const status = computed(() => deriveStatus(records.value))
    const anomalies = computed(() => detectAnomalies(records.value, prevRecords.value, thresholds.value))
    const sortedRecords = computed(() => sortByAttention(records.value, anomalies.value))
    const finalizedCount = computed(() => records.value.filter(r => r.is_finalized).length)

    return { records, prevRecords, loading, status, anomalies, sortedRecords, finalizedCount, thresholds, refresh }
}
```
- [ ] **Step 7.3** GREEN：`npx vitest run src/composables/__tests__/useSalarySettlement.test.ts`；`npm run typecheck`
- [ ] **Step 7.4** Commit：`feat(salary): useSalarySettlement 月狀態推導與異常偵測（TDD）`

### Task 8: SalaryHubView 工作台

**Files:** 填 `src/views/salary/SalaryHubView.vue`

- [ ] **Step 8.1** 實作（StatCard + 入口卡 + 深連結；status→文案/動作對映表）：
```vue
<template>
  <div>
    <PageHeader title="薪資管理" :subtitle="`${query.year} 年 ${query.month} 月`">
      <template #actions>
        <el-select v-model="query.year" style="width:100px"><el-option v-for="y in yearOptions" :key="y" :value="y" :label="`${y} 年`" /></el-select>
        <el-select v-model="query.month" style="width:90px"><el-option v-for="m in 12" :key="m" :value="m" :label="`${m} 月`" /></el-select>
      </template>
    </PageHeader>
    <LoadingPanel v-if="loading" />
    <template v-else>
      <div class="hub-stats">
        <StatCard label="本月狀態" :value="statusMeta.label" />
        <StatCard label="封存進度" :value="`${finalizedCount} / ${records.length} 人`" />
        <StatCard label="需注意" :value="`${anomalies.size} 筆`" />
      </div>
      <el-card class="hub-next">
        <span>{{ statusMeta.hint }}</span>
        <el-button type="primary" @click="goSettle">{{ statusMeta.action }}</el-button>
      </el-card>
      <div class="hub-links">
        <el-card v-for="l in links" :key="l.path" shadow="hover" @click="router.push(l.path)">
          <h3>{{ l.title }}</h3><p>{{ l.desc }}</p>
        </el-card>
      </div>
    </template>
  </div>
</template>
<script setup lang="ts">
import { reactive, computed, toRef, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/common/StatCard.vue'
import LoadingPanel from '@/components/common/LoadingPanel.vue'
import { useSalarySettlement, type SettlementStatus } from '@/composables/useSalarySettlement'

const router = useRouter()
const now = new Date()
const query = reactive({ year: now.getFullYear(), month: now.getMonth() + 1 })
const yearOptions = computed(() => [query.year - 1, query.year, query.year + 1])
const { records, loading, status, anomalies, finalizedCount, refresh } =
    useSalarySettlement(toRef(query, 'year'), toRef(query, 'month'))
onMounted(refresh)

const STATUS_META: Record<SettlementStatus, { label: string; hint: string; action: string; step: string }> = {
    not_calculated: { label: '未計算', hint: '本月尚未計算薪資，從結算前檢查開始', action: '開始月結 →', step: 'precheck' },
    needs_recalc: { label: '需重算', hint: '考勤或設定已變動，建議重新計算', action: '前往重算 →', step: 'calculate' },
    reviewing: { label: '覆核中', hint: `${anomalies.value.size} 筆需要注意，覆核後即可定案`, action: '繼續覆核 →', step: 'review' },
    finalized: { label: '已定案', hint: '本月已全數封存，可匯出轉帳名冊', action: '前往匯出 →', step: 'export' },
}
const statusMeta = computed(() => STATUS_META[status.value])
const goSettle = () => router.push({ path: '/salary/settle', query: { year: query.year, month: query.month, step: statusMeta.value.step } })
const links = [
    { path: '/salary/history', title: '薪資歷史', desc: '歷月紀錄、快照與明細回看' },
    { path: '/salary/simulate', title: '薪資試算', desc: '人事談薪情境試算（不寫入）' },
    { path: '/salary/settings', title: '薪資設定', desc: '獎金規則、才藝老師、系統參數' },
]
</script>
<style scoped>
.hub-stats { display: flex; gap: var(--space-4); margin-bottom: var(--space-4); }
.hub-next { margin-bottom: var(--space-6); }
.hub-next :deep(.el-card__body) { display: flex; justify-content: space-between; align-items: center; }
.hub-links { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-4); }
.hub-links .el-card { cursor: pointer; }
</style>
```
（StatCard props 以實際元件為準，對不上就改成等價 el-card。）
- [ ] **Step 8.2** 元件測試 `src/views/salary/__tests__/SalaryHubView.spec.ts`：mock `@/api/salary`（getRecords 回傳混合封存態 fixture），斷言 statusMeta 文案與深連結 query（照 BonusConfigPanel.spec.ts 的 stub 慣例）。Run → GREEN
- [ ] **Step 8.3** typecheck + dev server 走查；Commit：`feat(salary): 結薪工作台（狀態卡+深連結）`

### Task 9: SalarySettleView 嚮導外殼

**Files:** 填 `src/views/salary/SalarySettleView.vue`

- [ ] **Step 9.1** 實作：el-steps 可點跳轉 + `?step=&year=&month=` 同步 + provide 共享 settlement：
```vue
<template>
  <div>
    <PageHeader :title="`${query.year} 年 ${query.month} 月結薪`" :subtitle="statusLabel">
      <template #actions>
        <el-select v-model="query.year" style="width:100px"><el-option v-for="y in yearOptions" :key="y" :value="y" :label="`${y} 年`" /></el-select>
        <el-select v-model="query.month" style="width:90px"><el-option v-for="m in 12" :key="m" :value="m" :label="`${m} 月`" /></el-select>
      </template>
    </PageHeader>
    <el-steps :active="stepIndex" finish-status="success" align-center class="settle-steps">
      <el-step v-for="(s, i) in STEPS" :key="s.key" :title="s.title" class="settle-step" @click="go(i)" />
    </el-steps>
    <component :is="STEPS[stepIndex].comp" @next="go(stepIndex + 1)" />
  </div>
</template>
<script setup lang="ts">
import { reactive, computed, toRef, provide, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import StepPrecheck from './settle/StepPrecheck.vue'
import StepCalculate from './settle/StepCalculate.vue'
import StepReview from './settle/StepReview.vue'
import StepFinalize from './settle/StepFinalize.vue'
import StepExport from './settle/StepExport.vue'
import { useSalarySettlement } from '@/composables/useSalarySettlement'

const STEPS = [
    { key: 'precheck', title: '結算前檢查', comp: StepPrecheck },
    { key: 'calculate', title: '計算', comp: StepCalculate },
    { key: 'review', title: '覆核與調整', comp: StepReview },
    { key: 'finalize', title: '定案', comp: StepFinalize },
    { key: 'export', title: '匯出轉帳', comp: StepExport },
] as const

const route = useRoute(); const router = useRouter()
const now = new Date()
const query = reactive({
    year: Number(route.query.year) || now.getFullYear(),
    month: Number(route.query.month) || now.getMonth() + 1,
})
const yearOptions = computed(() => [query.year - 1, query.year, query.year + 1])
const stepIndex = computed(() => Math.max(0, STEPS.findIndex(s => s.key === route.query.step)))
const go = (i: number) => {
    if (i < 0 || i >= STEPS.length) return
    router.replace({ query: { ...route.query, year: String(query.year), month: String(query.month), step: STEPS[i].key } })
}
watch(() => [query.year, query.month], () => go(stepIndex.value))

const settlement = useSalarySettlement(toRef(query, 'year'), toRef(query, 'month'))
provide('settlement', settlement)
provide('settleQuery', query)
onMounted(settlement.refresh)
const STATUS_LABEL = { not_calculated: '未計算', needs_recalc: '需重算', reviewing: '覆核中', finalized: '已定案' } as const
const statusLabel = computed(() => `狀態：${STATUS_LABEL[settlement.status.value]}`)
</script>
<style scoped>
.settle-steps { margin-bottom: var(--space-6); }
.settle-step { cursor: pointer; }
</style>
```
- [ ] **Step 9.2** 建 5 個 Step 殼檔（`settle/Step*.vue`，template 先放標題與 `emit('next')` 按鈕），typecheck 過
- [ ] **Step 9.3** 測試 `__tests__/SalarySettleView.spec.ts`：mock api；斷言 `?step=review` 時 active index=2、點 step 觸發 router.replace（vue-router mock 照既有 views 測試慣例）。GREEN 後 Commit：`feat(salary): 月結嚮導外殼（步驟列+深連結）`

### Task 10: StepPrecheck

**Files:** 填 `src/views/salary/settle/StepPrecheck.vue`

- [ ] **Step 10.1** 實作：三類 pending 並行查 + 節慶月提示 + 警告不擋：
```vue
<template>
  <div>
    <el-alert v-if="festivalLabel" type="info" :closable="false" class="mb"
      :title="`本月為節慶獎金發放月（涵蓋 ${festivalLabel}）`" />
    <el-card v-loading="loading">
      <template v-if="totalPending > 0">
        <el-alert type="warning" :closable="false" :title="`有 ${totalPending} 筆未簽核項目，計算前建議先處理（不強制）`" class="mb" />
        <ul class="pending-list">
          <li v-for="it in items" :key="it.label">
            <span>{{ it.label }}：{{ it.count }} 筆</span>
            <el-button link type="primary" @click="$router.push(it.path)">前往簽核 →</el-button>
          </li>
        </ul>
      </template>
      <el-result v-else icon="success" title="無未簽核項目" sub-title="可以開始計算" />
    </el-card>
    <div class="step-actions"><el-button type="primary" @click="$emit('next')">下一步：計算 →</el-button></div>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, inject, onMounted } from 'vue'
import { getLeaves } from '@/api/leaves'
import { getOvertimes } from '@/api/overtimes'
import { getCorrections } from '@/api/punchCorrections'
import { festivalCoverageLabel } from '../festivalCoverage'   // 若該檔不存在（仍是使用者 WIP），改為 [2,6,9,12].includes(month) 的簡化提示
import { useErrorNotify } from '@/composables/useErrorNotify'

defineEmits<{ (e: 'next'): void }>()
const q = inject<{ year: number; month: number }>('settleQuery')!
const { notify } = useErrorNotify()
const loading = ref(false)
const counts = ref({ leaves: 0, overtimes: 0, corrections: 0 })
const len = (resp: unknown) => (Array.isArray((resp as { data: unknown })?.data) ? ((resp as { data: unknown[] }).data).length : 0)

onMounted(async () => {
    loading.value = true
    try {
        const params = { year: q.year, month: q.month, status: 'pending' }
        const [l, o, c] = await Promise.all([getLeaves(params), getOvertimes(params), getCorrections(params)])
        counts.value = { leaves: len(l), overtimes: len(o), corrections: len(c) }
    } catch (e) { notify(e, 'StepPrecheck', '載入待簽核項目失敗') }
    finally { loading.value = false }
})
const items = computed(() => [
    { label: '待簽核假單', count: counts.value.leaves, path: '/leaves' },
    { label: '待簽核加班單', count: counts.value.overtimes, path: '/overtime' },
    { label: '待簽核補打卡', count: counts.value.corrections, path: '/attendance' },
].filter(i => i.count > 0))
const totalPending = computed(() => counts.value.leaves + counts.value.overtimes + counts.value.corrections)
const festivalLabel = computed(() => festivalCoverageLabel(q.month))
</script>
<style scoped>
.mb { margin-bottom: var(--space-4); }
.pending-list { list-style: none; padding: 0; margin: 0; }
.pending-list li { display: flex; justify-content: space-between; padding: var(--space-2) 0; border-bottom: 1px solid var(--neutral-100); }
.step-actions { margin-top: var(--space-6); text-align: right; }
</style>
```
**注意**：`festivalCoverage.ts` 目前是使用者主目錄的 untracked WIP、main 上不存在 → 實作時先檢查 worktree 有沒有；沒有就 inline 寫死發放月對映（2月涵蓋前一年12-1月等規則見 SalaryView 註解），並留註解待 WIP 落地後改用共用模組。
- [ ] **Step 10.2** 測試：mock 三個 api 模組回傳 pending fixtures，斷言計數與「前往簽核」連結；空時顯示 success。GREEN
- [ ] **Step 10.3** Commit：`feat(salary): 月結步驟1 結算前檢查（警告不擋）`

### Task 11: StepCalculate

**Files:** 填 `src/views/salary/settle/StepCalculate.vue`

- [ ] **Step 11.1** 實作要點（calculate 邏輯自 main:SalaryView.vue script `runCalculate` 區搬移）：
  - `settlement = inject('settlement')`、`q = inject('settleQuery')`
  - 已定案（`status === 'finalized'`）→ 主按鈕 disabled + tooltip「本月已定案，需先於定案步驟退回」
  - 無 `SALARY_WRITE` → 按鈕 disabled + tooltip（唯讀模式）
  - 點「計算薪資」→ ElMessageBox.confirm（重算會保留手動調整，後端既有行為）→ `await calculate(q.year, q.month)` → `await settlement.refresh()` → `ElMessage.success` → `emit('next')` 自動進覆核
  - `status === 'needs_recalc'` 時頂部 `el-alert type="warning"`「考勤已變動，建議重算」
  - 顯示上次計算時間（records[0]?.calculated_at）
- [ ] **Step 11.2** 測試：mock calculate/getRecords；斷言 finalized 時按鈕 disabled、成功後 emit next。GREEN；Commit：`feat(salary): 月結步驟2 計算`

### Task 12: StepReview 覆核與調整（本計畫最大任務）

**Files:** 填 `settle/StepReview.vue`、Create `settle/AdjustDrawer.vue`

- [ ] **Step 12.1** `AdjustDrawer.vue`：把 main:SalaryView.vue 的手動調整 dialog（template :971 起、script `editableFieldList` :115-128 / `openEditDialog` :329 / `saveManualAdjust` 一帶）改寫為 el-drawer 側滑：
  - props：`{ modelValue: boolean; row: SettlementRecord | null; year: number; month: number }`；emits：`update:modelValue`、`saved`
  - 內容照搬 dialog 的 12 個 el-input-number grid + `extra_allowance_label` el-input + 必填調整原因 textarea（≥5 字）
  - 儲存：`manualAdjustSalary(recordId, payload, version)`（If-Match 樂觀鎖照舊）；**409 處理**：ElMessageBox「資料已被他人更新，將重新載入」→ emit('saved')（外層 refresh）
  - 已封存列不可開（外層按鈕已擋，drawer 內再防一層 disabled）
- [ ] **Step 12.2** `StepReview.vue` 結構：
  - 頂部摘要列：`需注意 N 筆 / 共 M 人`＋「只看需注意」el-switch＋異常門檻設定 popover（兩個 el-input-number 綁 `getThresholds/setThresholds`，改完 `settlement.thresholds.value = getThresholds()`）
  - 主表格：**自 main:SalaryView.vue:551-779 整段搬移**（expand SalaryBreakdown、全部金額欄、cell-link 欄位明細、操作欄），落地時的適配清單：
    1. `:data="visibleRecords"`（`sortedRecords` + 只看需注意 filter）
    2. 金額欄加 `align="right" class-name="num-cell"`
    3. 新增「注意」欄（第一欄之後）：`anomalies.get(row.employee_id)` 的 reasons 渲染 el-tag（diff→`與上月差 ±X%`、manual→`手動調整過`、new→`本月新進`）
    4. row-class-name：異常列 `attention-row`（左邊框 3px var(--color-warning)）
    5. 操作欄「編輯」改開 AdjustDrawer（已封存列 disabled + tooltip「已封存」）；保留單人 PDF
    6. 欄位明細 dialog（openFieldBreakdown）與考核年終 dialog 一併搬入本元件
    7. **「節慶獎金」欄 header 不搬 festivalCoverage caption**（使用者 WIP，落地時對齊）
  - 底部：`<el-button type="primary" @click="$emit('next')">確認無誤，進入定案 →</el-button>`
- [ ] **Step 12.3** 測試（重邏輯輕渲染）：mock api + settlement fixture，斷言：異常列排前、「只看需注意」過濾、已封存列編輯 disabled、AdjustDrawer 409 路徑 emit saved。el-table 用字串 stub 時改斷言 vm 層 computed（visibleRecords 順序/長度）。GREEN
- [ ] **Step 12.4** dev server 實際走查（計算過的月份）：展開明細、開 drawer 改一筆、409 模擬（改 version 後存）。Commit：`feat(salary): 月結步驟3 覆核與調整（異常浮出+側滑調整）`

### Task 13: StepFinalize

**Files:** 填 `settle/StepFinalize.vue`

- [ ] **Step 13.1** 實作：
  - 摘要卡：總應發（Σ gross_salary）、總實發（Σ net_salary）、人數、需注意筆數、已封存 X/M
  - 主按鈕「整月定案」（需 `SALARY_WRITE`）→ confirm → `finalizeMonth({ year, month })`
  - **409 處理**：解析 detail 顯示缺漏員工/stale 清單；若使用者有 `ACTIVITY_PAYMENT_APPROVE`，提供「強制封存」二次流程（ElMessageBox.prompt 輸入 ≥10 字 force_reason → `finalizeMonth({ year, month, force: true, force_reason })`），否則提示需財務覆核權限
  - 成功 → `settlement.refresh()` → emit('next')
  - 已封存紀錄表（個別退回）：每列「退回」按鈕 → prompt reason（≥10 字）→ `unfinalizeSalary(recordId, reason)`；403（自我解封/權限）走 notify
- [ ] **Step 13.2** 測試：mock finalizeMonth 409→force 路徑、unfinalize reason 驗證。GREEN；Commit：`feat(salary): 月結步驟4 定案（整月封存+強制流程+個別退回）`

### Task 14: StepExport

**Files:** 填 `settle/StepExport.vue`

- [ ] **Step 14.1** 實作：
  - 狀態守衛：`status !== 'finalized'` 時 el-alert「尚有未封存紀錄，轉帳名冊僅含已封存」（後端本來就只匯出已封存）
  - 四種名冊按鈕（base/festival/surplus/art_teacher）→ `exportTransferRoster(year, month, type)` + `downloadFile`（搬 main:SalaryView 既有 handler）
  - 匯出全部 Excel/PDF 按鈕一併搬入
  - 「月底快照」按鈕開 `SalarySnapshotDialog`（props 照介面）
  - 完成卡：全封存且已匯出過（本 session flag）顯示 `el-result icon="success" title="本月結薪完成 ✓"`
- [ ] **Step 14.2** 測試：mock exportTransferRoster blob、斷言未封存警示。GREEN；Commit：`feat(salary): 月結步驟5 匯出轉帳`

### Task 15: 移除舊頁與收尾

**Files:** Delete `src/views/SalaryView.vue`；Modify `src/views/yearEnd/YearEndConfigView.vue:408`（如需）

- [ ] **Step 15.1** 全 repo grep `SalaryView` 確認只剩 router 舊 import（已在 Task 5 移除）與測試引用；刪除 `src/views/SalaryView.vue` 及其專屬舊測試（若 `tests/views` 或 `src/views/__tests__` 有 SalaryView 測試，其情境已被 Step 元件測試取代才可刪——逐檔確認）
- [ ] **Step 15.2** 站內引用檢查：GlobalSearch `/salary`（指向工作台，OK 不改）、YearEndConfigView `router.push('/salary')`（OK 不改）
- [ ] **Step 15.3** 全量驗證：
```bash
npm run typecheck && npx vitest run && npm run lint && npm run lint:css
```
預期：typecheck 0 錯；vitest 對照 main 基線（執行前先在 main 跑一次記錄既有紅燈，新增紅燈數必須為 0）
- [ ] **Step 15.4** dev server 完整走一輪：工作台 → 嚮導 5 步（含實際 calculate + 調整一筆 + 定案 + 退回 + 匯出）→ 3 個獨立頁 → 其他 3-5 個 admin 頁抽查換膚無跑版
- [ ] **Step 15.5** Commit：`refactor(salary): 移除舊 SalaryView，月結流程全面接管`
- [ ] **Step 15.6** 落地前置（報告使用者，不自行執行）：
  - festivalCoverage WIP 歸屬確認（主目錄未提交修改與本分支 StepReview 表格重疊）
  - e2e 兩個 path 陣列可加 `/salary/settle` 等子頁（workspace repo，follow-up）
  - merge 進 local main 由使用者或後續 session 依收尾紀律（finish-check.sh）處理

---

## Self-Review 紀錄

- **Spec coverage**：§3.1 視覺層→Task 1-3；§3.2 IA→Task 5-6；§4 嚮導→Task 7-14；§5 元件/資料流→Task 7-9；§6 錯誤處理→Task 11(disabled)/12(409)/13(force/403)；§7 測試→各 task TDD 步驟+Task 15.3；§8-9→既有事實區與 Task 15.6。spec 的 `/admin/salary` 路徑已依 codebase 平面慣例修正為 `/salary/*`（檔頭註記）。
- **Placeholder scan**：無 TBD/TODO；Task 12 表格採「精確行號搬移＋7 點適配清單」而非貼 280 行原碼（搬移類任務的刻意取捨）。
- **Type consistency**：`SettlementRecord.breakdown_stale`（非 needs_recalc）與 records API 實際欄位一致；`finalizeMonth` payload 與後端 `FinalizeMonthRequest` 對齊；AnomalyMap key 用 `employee_id` 貫穿 detect/sort/render。
