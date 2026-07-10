# 考核與年終 UI/UX 全面改版實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依 spec `docs/superpowers/specs/2026-07-10-appraisal-yearend-ux-redesign-design.md` 完成三層改版：資訊架構重整（巢狀路由 + shell + 總覽工作台）、設計語言統一（labels/格式單一來源）、15 條 UX 硬傷全修。

**Architecture:** `/appraisal-year-end` 從單一 view + query 參數改為 shell layout + 真巢狀子路由（總覽/考核/年終/規則設定/例外中心）；標籤與格式收斂到 `src/constants/appraisalYearEnd.ts` 與 `utils/format.ts`；後端僅補結算 response 姓名欄位。

**Tech Stack:** Vue 3 `<script setup lang="ts">` + Element Plus + vue-router 4 + Vitest；後端 FastAPI + Pydantic + pytest。

## Global Constraints

- 前端 TS-only：新檔一律 `<script setup lang="ts">`；禁 `: any` / `as any`。
- 中文標籤以既有 UI 碼詞彙為準（等第=優等/甲等/乙等/丙等/丁等），不要自創。
- 金額一律 `formatCurrency`（`NT$1,234` / `—`），不要各自 `toLocaleString`。
- 共用 checkout 紀律：`git add <確切檔案>` 且 **commit 必用 path 限定** `git commit -m "..." -- <檔1> <檔2>`；staged 檢查與 commit 不可同一條 `&&` 鏈。
- 前端測試：`npx vitest run <目標檔>`；後端針對性測試 `pytest <檔> -o addopts=""`（關 coverage）；後端測試必掛 `test_db_session` fixture 以免打到 dev PG。
- API mock 的 response 形狀**必抄真實後端契約**（schema.d.ts / 後端 Pydantic schema），不可憑感覺 mock。
- **絕不執行 `start.sh`**（使用者前景跑）；不碰 `/calculate`、`/close` 類端點。
- Commit 訊息 Conventional Commits 繁體中文；前後端分開 commit（不同 repo）。
- 權限模型不動、不新增 Permission enum 值。
- 既有路由 name `year-end-cycle-detail` / `year-end-cycle-grid` / `year-end-cycle-config` 必須保留（有 call site 以 name 導航的相容性）。

## File Structure（改動總覽）

```
ivy-frontend/src/
├── constants/appraisalYearEnd.ts                 [新] 標籤/狀態/等第/例外類型單一來源（併入原 views/appraisal/labels.ts）
├── constants/permissions.ts                      [改] ROUTE_PERMISSION_RULES 巢狀規則
├── utils/format.ts                               [改] 新增 fmtPct
├── router/index.ts                               [改] 巢狀路由 + redirect 全表
├── components/layout/AdminSidebar.vue            [改] activeMenu 支援子路由
├── views/appraisalYearEnd/                       [新目錄] shell 與工作台
│   ├── AppraisalYearEndLayout.vue                [新] shell（頂部導覽 + 麵包屑 + router-view）
│   ├── OverviewWorkbenchView.vue                 [新] 總覽工作台
│   ├── RulesSettingsLayout.vue                   [新] 規則設定容器（tabs 綁子路由）
│   └── components/
│       ├── SignProgressBar.vue                   [新] 簽核進度列（工作台/考核/年終共用）
│       ├── WorkbenchAppraisalCard.vue            [新]
│       ├── WorkbenchYearEndCard.vue              [新]
│       ├── WorkbenchExceptionsCard.vue           [新]
│       └── WorkbenchPayoutCard.vue               [新]
├── views/AppraisalYearEndView.vue                [刪] 由 Layout 取代
├── views/AppraisalManagementView.vue             [改] 改造為考核 section layout（tabs 綁子路由）
├── views/appraisal/labels.ts                     [刪] 併入 constants
├── views/appraisal/AppraisalSettingsView.vue     [刪] 四個 panel 改掛規則設定子路由
├── views/appraisal/CurrentSemesterOverview.vue   [改] 多值欄拆 badge、silent-fail banner、skeleton
├── views/appraisal/CycleDetailPanel.vue          [改] 進度列、批次常駐
├── views/appraisal/components/{SummaryCard,ListView,KanbanView,...}.vue [改] 主按鈕、等第中文、labels 改路徑
├── views/yearEnd/*.vue                           [改] 各 task 詳述
└── api/yearEnd.ts / api/appraisal.ts             [改] 死碼清理（Task 16）

ivy-backend/
├── schemas/year_end.py                           [改] SettlementOut/SpecialBonusOut/PayoutItem/ClassTarget 補姓名
├── api/year_end/*.py                             [改] join 姓名
└── tests/test_year_end_*.py                      [改] response 姓名斷言
```

---

### Task 1: 標籤/狀態單一來源 `constants/appraisalYearEnd.ts`

**Files:**
- Create: `src/constants/appraisalYearEnd.ts`
- Create: `src/constants/__tests__/appraisalYearEnd.spec.ts`
- Delete: `src/views/appraisal/labels.ts`
- Modify: `src/views/appraisal/CycleDetailPanel.vue`、`src/views/appraisal/components/{CommentDialog,SummaryLogDrawer,BatchSignButton,KanbanView,ListView,RejectDialog}.vue`（僅 import 路徑）

**Interfaces:**
- Produces（後續所有 task 依賴）：`CYCLE_STATUS_LABEL/CYCLE_STATUS_TAG`、`SIGN_STATUS_LABEL/SIGN_STATUS_TAG/SIGN_STATUS_ORDER`、`GRADE_LABEL/GRADE_TAG`、`EXCEPTION_TYPE_LABEL`、函式 `cycleStatusLabel/signStatusLabel/gradeLabel/exceptionTypeLabel(code: string): string`；並原樣 re-export 舊 labels.ts 的 `STATUS_LABEL/REJECT_TARGET_LABEL/STAGE_LABEL/ACTION_LABEL/MSG/statusLabel/actionLabel`。

- [ ] **Step 1: 寫失敗測試** `src/constants/__tests__/appraisalYearEnd.spec.ts`

```ts
import { describe, it, expect } from 'vitest'
import {
  CYCLE_STATUS_LABEL, CYCLE_STATUS_TAG, SIGN_STATUS_LABEL, SIGN_STATUS_TAG,
  SIGN_STATUS_ORDER, GRADE_LABEL, EXCEPTION_TYPE_LABEL,
  cycleStatusLabel, signStatusLabel, gradeLabel, exceptionTypeLabel,
  statusLabel, STAGE_LABEL,
} from '@/constants/appraisalYearEnd'

describe('appraisalYearEnd 標籤單一來源', () => {
  it('週期狀態三態齊備且文案統一', () => {
    expect(CYCLE_STATUS_LABEL).toEqual({ OPEN: '開放', LOCKED: '已鎖定', CLOSED: '已封存' })
    expect(CYCLE_STATUS_TAG.OPEN).toBe('success')
  })
  it('簽核狀態四態與順序', () => {
    expect(SIGN_STATUS_ORDER).toEqual(['DRAFT', 'SUPERVISOR_SIGNED', 'ACCOUNTING_SIGNED', 'FINALIZED'])
    expect(SIGN_STATUS_LABEL.FINALIZED).toBe('已核定')
    expect(SIGN_STATUS_TAG).toEqual({ DRAFT: 'info', SUPERVISOR_SIGNED: 'warning', ACCOUNTING_SIGNED: 'primary', FINALIZED: 'success' })
  })
  it('等第沿用既有 UI 詞彙', () => {
    expect(GRADE_LABEL).toEqual({ OUTSTANDING: '優等', GOOD: '甲等', PASS: '乙等', WARN: '丙等', FAIL: '丁等' })
  })
  it('例外類型涵蓋後端全部 type code', () => {
    // 對齊 ivy-backend services/appraisal/exceptions.py 與 services/year_end/exceptions.py 的 type=
    const codes = [
      'hire_in_window_missing_employment_period', 'manual_items_missing', 'summaries_not_finalized',
      'qualification', 'missing_class_target', 'missing_head_teacher',
      'unassigned_course', 'unmatched_registrations', 'prereq_not_finalized', 'performance_anomaly',
    ]
    for (const c of codes) expect(EXCEPTION_TYPE_LABEL[c], c).toBeTruthy()
  })
  it('未知 code fallback 回 raw', () => {
    expect(cycleStatusLabel('X')).toBe('X')
    expect(signStatusLabel('X')).toBe('X')
    expect(gradeLabel('X')).toBe('X')
    expect(exceptionTypeLabel('X')).toBe('X')
  })
  it('舊 labels.ts API 原樣保留（statusLabel 即 signStatusLabel）', () => {
    expect(statusLabel('DRAFT')).toBe('草稿')
    expect(STAGE_LABEL.FINALIZE).toBe('核定')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**：`npx vitest run src/constants/__tests__/appraisalYearEnd.spec.ts` → FAIL（模組不存在）
- [ ] **Step 3: 建立 `src/constants/appraisalYearEnd.ts`**

先把 `src/views/appraisal/labels.ts` 整檔內容原樣搬入（`STATUS_LABEL/REJECT_TARGET_LABEL/STAGE_LABEL/ACTION_LABEL/MSG/statusLabel/actionLabel` 一字不改），再於檔尾追加：

```ts
export type AyeTagType = 'success' | 'warning' | 'info' | 'primary' | 'danger'

// ── 週期狀態（考核 AppraisalCycle 與年終 YearEndCycle 共用 OPEN/LOCKED/CLOSED）──
// 取代原 CycleListView / YearEndListView / ExceptionCenterView 三處各自定義
export const CYCLE_STATUS_LABEL: Record<string, string> = {
  OPEN: '開放',
  LOCKED: '已鎖定',
  CLOSED: '已封存',
}
export const CYCLE_STATUS_TAG: Record<string, AyeTagType> = {
  OPEN: 'success',
  LOCKED: 'warning',
  CLOSED: 'info',
}

// ── 簽核狀態 tag 顏色（採 YearEndGridView 既有配色為準；STATUS_LABEL 為文案來源）──
export const SIGN_STATUS_LABEL = STATUS_LABEL
export const SIGN_STATUS_TAG: Record<string, AyeTagType> = {
  DRAFT: 'info',
  SUPERVISOR_SIGNED: 'warning',
  ACCOUNTING_SIGNED: 'primary',
  FINALIZED: 'success',
}
export const SIGN_STATUS_ORDER = ['DRAFT', 'SUPERVISOR_SIGNED', 'ACCOUNTING_SIGNED', 'FINALIZED'] as const

// ── 等第（詞彙沿用原 ListView.gradeLabel）──
export const GRADE_LABEL: Record<string, string> = {
  OUTSTANDING: '優等', GOOD: '甲等', PASS: '乙等', WARN: '丙等', FAIL: '丁等',
}
export const GRADE_TAG: Record<string, AyeTagType> = {
  OUTSTANDING: 'success', GOOD: 'primary', PASS: 'info', WARN: 'warning', FAIL: 'danger',
}

// ── 例外類型（對齊後端 services/{appraisal,year_end}/exceptions.py 的 type 值）──
export const EXCEPTION_TYPE_LABEL: Record<string, string> = {
  hire_in_window_missing_employment_period: '任職區間缺漏',
  manual_items_missing: '手填事件缺漏',
  summaries_not_finalized: '考核尚未核定',
  qualification: '年資資格疑義',
  missing_class_target: '班級編制缺漏',
  missing_head_teacher: '班導未指定',
  unassigned_course: '課程未指派老師',
  unmatched_registrations: '報名未配對',
  prereq_not_finalized: '前置未核定',
  performance_anomaly: '班級績效異常',
}

export function cycleStatusLabel(s: string) { return CYCLE_STATUS_LABEL[s] || s }
export function signStatusLabel(s: string) { return statusLabel(s) }
export function gradeLabel(g: string) { return GRADE_LABEL[g] || g }
export function exceptionTypeLabel(t: string) { return EXCEPTION_TYPE_LABEL[t] || t }
```

- [ ] **Step 4: 跑測試確認通過**：同 Step 2 → PASS
- [ ] **Step 5: 換 import 路徑並刪舊檔**

7 個檔案的 `from '../labels'` / `from './labels'`（BatchSignButton 等 components 內是 `from '../labels'`，CycleDetailPanel 是 `from './labels'`）全改為 `from '@/constants/appraisalYearEnd'`（import 的名稱不變）。`grep -rn "appraisal/labels\|from '\.\./labels'\|from './labels'" src/` 確認無殘留後 `rm src/views/appraisal/labels.ts`。
ListView.vue 同時把內聯 `gradeLabel` 常數刪除、改 import `gradeLabel`（行為相同，測試不需改）。

- [ ] **Step 6: 跑受影響測試**：`npx vitest run src/views/appraisal src/constants` → PASS；`npm run typecheck` → PASS
- [ ] **Step 7: Commit**

```bash
git add src/constants/appraisalYearEnd.ts src/constants/__tests__/appraisalYearEnd.spec.ts src/views/appraisal
git commit -m "refactor(appraisal): 標籤/狀態收斂至 constants/appraisalYearEnd 單一來源" -- src/constants/appraisalYearEnd.ts src/constants/__tests__/appraisalYearEnd.spec.ts src/views/appraisal
```

---

### Task 2: `fmtPct` 百分比單一格式

**Files:**
- Modify: `src/utils/format.ts`
- Modify: `src/utils/__tests__/format.spec.ts`（若無此檔則建立）

**Interfaces:**
- Produces: `fmtPct(val: unknown, opts?: { isRatio?: boolean; digits?: number }): string`（後續 Task 7/11/12 使用）

- [ ] **Step 1: 失敗測試**（加入既有 format 測試檔，無則新建）

```ts
import { fmtPct } from '@/utils/format'

describe('fmtPct', () => {
  it('數值已是百分比 → 一位小數 + %', () => expect(fmtPct(83.62)).toBe('83.6%'))
  it('isRatio: 0–1 比值 ×100', () => expect(fmtPct(0.905, { isRatio: true })).toBe('90.5%'))
  it('digits 覆寫', () => expect(fmtPct(83.625, { digits: 2 })).toBe('83.63%'))
  it('null/undefined/NaN → em dash', () => {
    expect(fmtPct(null)).toBe('—'); expect(fmtPct(undefined)).toBe('—'); expect(fmtPct('abc')).toBe('—')
  })
})
```

- [ ] **Step 2: 確認失敗**：`npx vitest run src/utils/__tests__/format.spec.ts` → FAIL
- [ ] **Step 3: 實作**（加在 `format.ts` 檔尾）

```ts
// 百分比單一格式（預設一位小數）。isRatio=true 表示傳入為 0–1 比值（×100 後顯示）。
// 取代各頁 .toFixed(1)/.toFixed(2)/pctNum/pctRatio 混用。null/非數字 → '—'。
export const fmtPct = (val: unknown, opts: { isRatio?: boolean; digits?: number } = {}) => {
  if (val == null || val === '' || Number.isNaN(Number(val))) return '—'
  const n = Number(val) * (opts.isRatio ? 100 : 1)
  return `${n.toFixed(opts.digits ?? 1)}%`
}
```

- [ ] **Step 4: 確認通過** → PASS
- [ ] **Step 5: Commit**：`git commit -m "feat(utils): fmtPct 百分比單一格式" -- src/utils/format.ts src/utils/__tests__/format.spec.ts`

---

### Task 3: 共用簽核進度列 `SignProgressBar.vue`

**Files:**
- Create: `src/views/appraisalYearEnd/components/SignProgressBar.vue`
- Create: `src/views/appraisalYearEnd/components/__tests__/SignProgressBar.spec.ts`

**Interfaces:**
- Produces: `<SignProgressBar :counts="Record<string, number>" />`，counts key 為 SIGN_STATUS_ORDER 的四個 status（缺 key 視為 0）。渲染堆疊進度條 + 「已核定 x / 共 n」摘要 + 各段 legend（中文+數字）。Task 6/8/11 消費。

- [ ] **Step 1: 失敗測試**

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SignProgressBar from '../SignProgressBar.vue'

describe('SignProgressBar', () => {
  it('顯示各狀態中文計數與總結', () => {
    const w = mount(SignProgressBar, { props: { counts: { DRAFT: 10, SUPERVISOR_SIGNED: 5, ACCOUNTING_SIGNED: 3, FINALIZED: 2 } } })
    expect(w.text()).toContain('草稿 10')
    expect(w.text()).toContain('已核定 2 / 共 20')
  })
  it('全零顯示尚無資料', () => {
    const w = mount(SignProgressBar, { props: { counts: {} } })
    expect(w.text()).toContain('尚無簽核資料')
  })
  it('段寬依比例', () => {
    const w = mount(SignProgressBar, { props: { counts: { DRAFT: 1, FINALIZED: 3 } } })
    const seg = w.find('[data-status="FINALIZED"]')
    expect(seg.attributes('style')).toContain('width: 75%')
  })
})
```

- [ ] **Step 2: 確認失敗** → FAIL
- [ ] **Step 3: 實作**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { SIGN_STATUS_ORDER, SIGN_STATUS_LABEL, SIGN_STATUS_TAG } from '@/constants/appraisalYearEnd'

const props = defineProps<{ counts: Record<string, number> }>()

const segments = computed(() =>
  SIGN_STATUS_ORDER.map((status) => ({ status, label: SIGN_STATUS_LABEL[status], type: SIGN_STATUS_TAG[status], count: props.counts[status] ?? 0 })),
)
const total = computed(() => segments.value.reduce((s, x) => s + x.count, 0))
const pct = (n: number) => (total.value ? (n / total.value) * 100 : 0)
</script>

<template>
  <div class="sign-progress">
    <template v-if="total > 0">
      <div class="sign-progress__bar" role="img" :aria-label="`已核定 ${counts.FINALIZED ?? 0} / 共 ${total}`">
        <div
          v-for="s in segments.filter((x) => x.count > 0)"
          :key="s.status"
          class="sign-progress__seg"
          :class="`sign-progress__seg--${s.type}`"
          :data-status="s.status"
          :style="{ width: `${pct(s.count)}%` }"
        />
      </div>
      <div class="sign-progress__legend">
        <span v-for="s in segments" :key="s.status" class="sign-progress__item">
          <i class="sign-progress__dot" :class="`sign-progress__seg--${s.type}`" />{{ s.label }} {{ s.count }}
        </span>
        <span class="sign-progress__total">已核定 {{ counts.FINALIZED ?? 0 }} / 共 {{ total }}</span>
      </div>
    </template>
    <span v-else class="sign-progress__empty">尚無簽核資料</span>
  </div>
</template>

<style scoped>
.sign-progress__bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: var(--el-fill-color-light); }
.sign-progress__seg--info { background: var(--el-color-info); }
.sign-progress__seg--warning { background: var(--el-color-warning); }
.sign-progress__seg--primary { background: var(--el-color-primary); }
.sign-progress__seg--success { background: var(--el-color-success); }
.sign-progress__legend { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-2); font-size: var(--text-sm); color: var(--text-secondary); }
.sign-progress__dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
.sign-progress__total { margin-left: auto; font-weight: 600; color: var(--text-primary); }
.sign-progress__empty { font-size: var(--text-sm); color: var(--text-tertiary); }
</style>
```

- [ ] **Step 4: 確認通過** → PASS
- [ ] **Step 5: Commit**：`git commit -m "feat(appraisal-year-end): 共用簽核進度列元件" -- src/views/appraisalYearEnd/components/SignProgressBar.vue src/views/appraisalYearEnd/components/__tests__/SignProgressBar.spec.ts`

---

### Task 4: Shell 與兩個 section 容器

**Files:**
- Create: `src/views/appraisalYearEnd/AppraisalYearEndLayout.vue`
- Create: `src/views/appraisalYearEnd/RulesSettingsLayout.vue`
- Modify: `src/views/AppraisalManagementView.vue`（改造為 tabs 綁子路由）
- Create: `src/views/appraisalYearEnd/__tests__/AppraisalYearEndLayout.spec.ts`
- Modify: `src/views/__tests__/AppraisalManagementView.spec.ts`

**Interfaces:**
- Consumes: route meta `title`（Task 5 定義）。
- Produces: shell 依 `route.path.split('/')[2]` 高亮頂層導覽；麵包屑由 `route.matched` 的 `meta.title` 串出；`<router-view />` 渲染子頁。AppraisalManagementView 不再自管 `tab` query，tabs `@tab-change` 改 `router.push` 子路由。

- [ ] **Step 1: 失敗測試**（Layout：用 createMemoryHistory 假路由掛 stub 子頁，驗證①依權限過濾導覽項②麵包屑串接③active 高亮）

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppraisalYearEndLayout from '../AppraisalYearEndLayout.vue'

vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn((p: string) => p === 'APPRAISAL_READ') }))

const Stub = { template: '<div />' }
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{
    path: '/appraisal-year-end', component: AppraisalYearEndLayout, redirect: '/appraisal-year-end/overview',
    children: [
      { path: 'overview', component: Stub, meta: { title: '總覽' } },
      { path: 'appraisal/current', component: Stub, meta: { title: '考核', breadcrumb: ['考核', '當期總覽'] } },
    ],
  }],
})

describe('AppraisalYearEndLayout', () => {
  beforeEach(async () => { await router.push('/appraisal-year-end/appraisal/current'); await router.isReady() })
  it('只顯示有權限的導覽項（APPRAISAL_READ → 總覽+考核+例外中心）', () => {
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [router] } })
    const text = w.text()
    expect(text).toContain('考核')
    expect(text).not.toContain('年終獎金率') // 規則設定內頁不出現在頂層
    expect(w.findAll('.aye-nav [role="radio"], .aye-nav .el-segmented__item').length).toBeGreaterThan(0)
  })
  it('麵包屑顯示 目前 section 路徑', async () => {
    const w = mount(AppraisalYearEndLayout, { global: { plugins: [router] } })
    await flushPromises()
    expect(w.find('.aye-breadcrumb').text()).toContain('當期總覽')
  })
})
```

- [ ] **Step 2: 確認失敗** → FAIL
- [ ] **Step 3: 實作 `AppraisalYearEndLayout.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { hasPermission } from '@/utils/auth'

interface SectionDef { key: string; label: string; to: string; can: () => boolean }

// 權限對齊 spec：規則設定「任一子頁可見即顯示」；總覽=任一模組權限
const SECTIONS: SectionDef[] = [
  { key: 'overview', label: '總覽', to: '/appraisal-year-end/overview',
    can: () => ['APPRAISAL_READ', 'YEAR_END_READ', 'SETTINGS_READ', 'SALARY_READ', 'APPRAISAL_FINALIZE'].some((p) => hasPermission(p)) },
  { key: 'appraisal', label: '考核', to: '/appraisal-year-end/appraisal/current', can: () => hasPermission('APPRAISAL_READ') },
  { key: 'year-end', label: '年終', to: '/appraisal-year-end/year-end',
    can: () => hasPermission('YEAR_END_READ') || hasPermission('APPRAISAL_FINALIZE') },
  { key: 'rules', label: '規則設定', to: '/appraisal-year-end/rules',
    can: () => hasPermission('APPRAISAL_READ') || hasPermission('SETTINGS_READ') },
  { key: 'exceptions', label: '例外中心', to: '/appraisal-year-end/exceptions',
    can: () => hasPermission('APPRAISAL_READ') || hasPermission('YEAR_END_READ') },
]

const route = useRoute()
const router = useRouter()
const sections = computed(() => SECTIONS.filter((s) => s.can()))
const activeKey = computed(() => route.path.split('/')[2] ?? 'overview')
const segmentedOptions = computed(() => sections.value.map((s) => ({ label: s.label, value: s.key })))
const onSectionChange = (val: string | number) => {
  const target = SECTIONS.find((s) => s.key === String(val))
  if (target && activeKey.value !== target.key) router.push(target.to)
}

// 麵包屑：模組名 + 子頁 meta（深層頁如年終總表會有多段）
const crumbs = computed(() => {
  const tail = route.matched
    .filter((m) => m.meta?.title && m.path !== '/appraisal-year-end')
    .map((m) => String(m.meta.title))
  const extra = (route.meta?.breadcrumbExtra as string | undefined)
  return ['考核與年終', ...tail, ...(extra ? [extra] : [])]
})
</script>

<template>
  <div class="aye-layout">
    <el-segmented
      v-if="segmentedOptions.length > 0"
      class="aye-nav"
      :model-value="activeKey"
      :options="segmentedOptions"
      size="large"
      @change="onSectionChange"
    />
    <el-breadcrumb v-if="crumbs.length > 1" class="aye-breadcrumb" separator="›">
      <el-breadcrumb-item v-for="(c, i) in crumbs" :key="i">{{ c }}</el-breadcrumb-item>
    </el-breadcrumb>
    <div class="aye-body">
      <router-view />
    </div>
    <el-empty v-if="segmentedOptions.length === 0" description="無權限檢視此頁" />
  </div>
</template>

<style scoped>
.aye-layout { padding: var(--space-5); }
.aye-nav { margin-bottom: var(--space-3); }
.aye-breadcrumb { margin-bottom: var(--space-4); }
</style>
```

注意：深層頁（年終明細/總表/設定）想在麵包屑尾端加「114 學年」動態字樣時，可在該頁 `onMounted` 後以 `route.meta.breadcrumbExtra` 呈現——本計畫不強制，Task 11/12 只需靜態 meta.title 即可。

- [ ] **Step 4: 實作 `RulesSettingsLayout.vue`**（tabs 綁子路由；子路由由 Task 5 掛）

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { hasPermission } from '@/utils/auth'

// 子頁權限對齊實際呼叫的 API：前四頁走 appraisal API（APPRAISAL_READ）、年終規則走 SETTINGS_READ
const TABS = [
  { name: 'scoring', label: '考核扣分規則', can: () => hasPermission('APPRAISAL_READ') },
  { name: 'bonus-rates', label: '年終獎金率', can: () => hasPermission('APPRAISAL_READ') },
  { name: 'catalog', label: '扣分項目目錄', can: () => hasPermission('APPRAISAL_READ') },
  { name: 'enrollment-targets', label: '學年目標人數', can: () => hasPermission('APPRAISAL_READ') },
  { name: 'year-end-rules', label: '年終規則', can: () => hasPermission('SETTINGS_READ') },
]

const route = useRoute()
const router = useRouter()
const visibleTabs = computed(() => TABS.filter((t) => t.can()))
const activeTab = computed(() => route.path.split('/')[3] ?? 'scoring')
const onTabChange = (name: string | number) => {
  if (String(name) !== activeTab.value) router.push(`/appraisal-year-end/rules/${name}`)
}
</script>

<template>
  <el-tabs :model-value="activeTab" type="card" @tab-change="onTabChange">
    <el-tab-pane v-for="t in visibleTabs" :key="t.name" :label="t.label" :name="t.name" />
  </el-tabs>
  <router-view />
</template>
```

- [ ] **Step 5: 改造 `AppraisalManagementView.vue`**

刪除 `VALID_TABS/DEFAULT_TAB/LEGACY_TAB_MAP/resolveTab/watch/onTabChange` 與 query 邏輯，template 改為與 RulesSettingsLayout 相同模式（tabs + `<router-view />`）：

```ts
const TABS = [
  { name: 'current', label: '當期總覽' },
  { name: 'history', label: '歷史週期與簽核' },
  { name: 'institution-events', label: '活動出席' },
  { name: 'disciplinary', label: '懲處記錄' },
]
const activeTab = computed(() => route.path.split('/')[3] ?? 'current')
const onTabChange = (name: string | number) => {
  if (String(name) !== activeTab.value) router.push(`/appraisal-year-end/appraisal/${name}`)
}
```

（「考核設定」tab 移除——四個 panel 由 Task 5 掛到 `/rules/*`。padding 移除，由 shell 統一。）
同步改寫 `src/views/__tests__/AppraisalManagementView.spec.ts`：原本斷言 query tab 行為的測試改為斷言 `router.push` 目標路徑（用 createMemoryHistory router 掛 stub 子路由）。

- [ ] **Step 6: 跑測試**：`npx vitest run src/views/appraisalYearEnd src/views/__tests__/AppraisalManagementView.spec.ts` → PASS
- [ ] **Step 7: Commit**：`git commit -m "feat(appraisal-year-end): shell layout 與 section 容器（tabs 綁子路由）" -- src/views/appraisalYearEnd src/views/AppraisalManagementView.vue src/views/__tests__/AppraisalManagementView.spec.ts`

---

### Task 5: 巢狀路由 + redirect 全表 + 權限規則 + 側欄

**Files:**
- Modify: `src/router/index.ts`
- Modify: `src/constants/permissions.ts`
- Modify: `src/components/layout/AdminSidebar.vue`
- Create: `src/router/__tests__/appraisalYearEndRedirects.spec.ts`
- Modify: `src/utils/__tests__/appraisalYearEndRoute.spec.ts`、`src/constants/__tests__/appraisalRoutePermissions.test.ts`、`src/router/__tests__/yearEndAdminRouteMeta.spec.ts`
- Delete: `src/views/AppraisalYearEndView.vue`、`src/views/__tests__/AppraisalYearEndView.spec.ts`（shell 取代；spec 由 Task 4 的 Layout spec 取代）

**Interfaces:**
- Consumes: Task 4 的三個容器元件。
- Produces: 下列路由表與 redirect 行為；route names `year-end-cycle-detail/grid/config` 保留。工作台路由 `aye-overview` 先掛 placeholder（`{ template: '<div />' }` 不行——路由需要真元件檔，先建最小 `OverviewWorkbenchView.vue` 骨架：`<template><el-empty description="工作台建置中" /></template>`，Task 6 補完整內容）。

- [ ] **Step 1: 失敗測試 `appraisalYearEndRedirects.spec.ts`**（redirect 全表逐條驗；用 exported routes + createMemoryHistory）

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { routes } from '@/router/index'   // 若 index.ts 尚未 export routes，本 task Step 3 加上 export

// guard 需要登入者：stub 掉 auth（redirect 解析在 guard 前，但 push 後仍會跑 guard）
vi.mock('@/utils/auth', async (orig) => ({
  ...(await orig()),
  getUserInfo: () => ({ role: 'admin', permission_names: ['*'] }),
  isAuthenticated: () => true,
  hasPermission: () => true,
  canAccessRoute: () => true,
}))

const mkRouter = () => createRouter({ history: createMemoryHistory(), routes })

// [舊 URL, 期望落地 path, 期望 query 子集]
const CASES: Array<[string, string, Record<string, string>?]> = [
  ['/appraisal-year-end', '/appraisal-year-end/overview'],
  ['/appraisal-year-end?section=appraisal', '/appraisal-year-end/appraisal/current'],
  ['/appraisal-year-end?section=appraisal&tab=history&cycle=7&view=kanban', '/appraisal-year-end/appraisal/history', { cycle: '7', view: 'kanban' }],
  ['/appraisal-year-end?section=appraisal&tab=cycles', '/appraisal-year-end/appraisal/history'],
  ['/appraisal-year-end?section=appraisal&tab=institution_events', '/appraisal-year-end/appraisal/institution-events'],
  ['/appraisal-year-end?section=appraisal&tab=settings', '/appraisal-year-end/rules/scoring'],
  ['/appraisal-year-end?section=appraisal&tab=disciplinary', '/appraisal-year-end/appraisal/disciplinary'],
  ['/appraisal-year-end?section=year-end', '/appraisal-year-end/year-end'],
  ['/appraisal-year-end?section=payout', '/appraisal-year-end/year-end/payout'],
  ['/appraisal-year-end?section=year-end-rules', '/appraisal-year-end/rules/year-end-rules'],
  ['/appraisal-year-end?section=exceptions', '/appraisal-year-end/exceptions'],
  ['/appraisal-management', '/appraisal-year-end/appraisal/current'],
  ['/appraisal/cycles', '/appraisal-year-end/appraisal/history'],
  ['/appraisal/cycles/12', '/appraisal-year-end/appraisal/history', { cycle: '12' }],
  ['/appraisal/settings', '/appraisal-year-end/rules/scoring'],
  ['/year_end/cycles', '/appraisal-year-end/year-end'],
  ['/year_end/cycles/5', '/appraisal-year-end/year-end/cycles/5'],
  ['/year_end/cycles/5/grid', '/appraisal-year-end/year-end/cycles/5/grid'],
  ['/year_end/cycles/5/config', '/appraisal-year-end/year-end/cycles/5/config'],
  ['/year-end/appraisal-payout?year=2026', '/appraisal-year-end/year-end/payout', { year: '2026' }],
]

describe('考核與年終 redirect 全表（含後端 exceptions deep_link 兩種格式）', () => {
  it.each(CASES)('%s → %s', async (from, toPath, query) => {
    const router = mkRouter()
    await router.push(from)
    await router.isReady()
    expect(router.currentRoute.value.path).toBe(toPath)
    if (query) expect(router.currentRoute.value.query).toMatchObject(query)
  })
})
```

- [ ] **Step 2: 確認失敗** → FAIL
- [ ] **Step 3: 改寫 `router/index.ts` 考核×年終段**

（若 `routes` 陣列尚未 named export，加 `export const routes = [...]` 後 `createRouter({ routes })` 引用。）
以下整段取代現有「考核 × 年終 整合工作區」與其 redirect 區塊（`/year_end/cycles/:id` 三條實體路由移入 children，names 保留）：

```ts
// ============ 考核 × 年終 整合工作區（巢狀 shell，2026-07-10 UX 改版）============
{
  path: '/appraisal-year-end',
  component: () => import('../views/appraisalYearEnd/AppraisalYearEndLayout.vue'),
  // 舊 query 導覽（?section=&tab=&cycle=&view=）與例外中心 deep_link 相容層
  redirect: (to) => resolveLegacySectionQuery(to) ?? '/appraisal-year-end/overview',
  children: [
    { path: 'overview', name: 'aye-overview', component: () => import('../views/appraisalYearEnd/OverviewWorkbenchView.vue'), meta: { title: '總覽' } },
    {
      path: 'appraisal',
      component: () => import('../views/AppraisalManagementView.vue'),
      redirect: '/appraisal-year-end/appraisal/current',
      meta: { title: '考核' },
      children: [
        { path: 'current', name: 'aye-appraisal-current', component: () => import('../views/appraisal/CurrentSemesterOverview.vue'), meta: { title: '當期總覽' } },
        { path: 'history', name: 'aye-appraisal-history', component: () => import('../views/appraisal/CycleListView.vue'), meta: { title: '歷史週期與簽核' } },
        { path: 'institution-events', name: 'aye-appraisal-events', component: () => import('../views/appraisal/components/InstitutionEventPanel.vue'), meta: { title: '活動出席' } },
        { path: 'disciplinary', name: 'aye-appraisal-disciplinary', component: () => import('../views/salary/DisciplinaryPanel.vue'), meta: { title: '懲處記錄' } },
      ],
    },
    { path: 'year-end', name: 'aye-year-end', component: () => import('../views/yearEnd/YearEndListView.vue'), meta: { title: '年終' } },
    { path: 'year-end/cycles/:id', name: 'year-end-cycle-detail', component: () => import('../views/yearEnd/YearEndDetailView.vue'), meta: { title: '年終 › 結算明細' } },
    { path: 'year-end/cycles/:id/grid', name: 'year-end-cycle-grid', component: () => import('../views/yearEnd/YearEndGridView.vue'), meta: { title: '年終 › 總表' } },
    { path: 'year-end/cycles/:id/config', name: 'year-end-cycle-config', component: () => import('../views/yearEnd/YearEndConfigView.vue'), meta: { title: '年終 › 本期設定' } },
    { path: 'year-end/payout', name: 'aye-payout', component: () => import('../views/yearEnd/AppraisalPayoutView.vue'), meta: { title: '考核年終發放' } },
    {
      path: 'rules',
      component: () => import('../views/appraisalYearEnd/RulesSettingsLayout.vue'),
      redirect: '/appraisal-year-end/rules/scoring',
      meta: { title: '規則設定' },
      children: [
        { path: 'scoring', name: 'aye-rules-scoring', component: () => import('../views/appraisal/components/ScoringRulesPanel.vue'), meta: { title: '考核扣分規則' } },
        { path: 'bonus-rates', name: 'aye-rules-bonus-rates', component: () => import('../views/appraisal/components/BonusRatesPanel.vue'), meta: { title: '年終獎金率' } },
        { path: 'catalog', name: 'aye-rules-catalog', component: () => import('../views/appraisal/components/PenaltyCatalogPanel.vue'), meta: { title: '扣分項目目錄' } },
        { path: 'enrollment-targets', name: 'aye-rules-enrollment', component: () => import('../views/appraisal/YearlyEnrollmentTargetSection.vue'), meta: { title: '學年目標人數' } },
        { path: 'year-end-rules', name: 'aye-rules-year-end', component: () => import('../views/yearEnd/YearEndRulesPanel.vue'), meta: { title: '年終規則' } },
      ],
    },
    { path: 'exceptions', name: 'aye-exceptions', component: () => import('../views/yearEnd/ExceptionCenterView.vue'), meta: { title: '例外中心' } },
  ],
},
// --- 舊路由 redirect（書籤 / 後端 deep_link 相容）---
{ path: '/appraisal-management', redirect: (to) => ({ path: '/appraisal-year-end', query: { ...to.query, section: 'appraisal' } }) },
{ path: '/appraisal/cycles', redirect: { path: '/appraisal-year-end', query: { section: 'appraisal', tab: 'history' } } },
{ path: '/appraisal/cycles/:id', redirect: (to) => ({ path: '/appraisal-year-end', query: { section: 'appraisal', tab: 'history', cycle: String(to.params.id) } }) },
{ path: '/appraisal/settings', redirect: { path: '/appraisal-year-end', query: { section: 'appraisal', tab: 'settings' } } },
{ path: '/year_end/cycles', redirect: '/appraisal-year-end/year-end' },
{ path: '/year_end/cycles/:id', redirect: (to) => `/appraisal-year-end/year-end/cycles/${to.params.id}` },
{ path: '/year_end/cycles/:id/grid', redirect: (to) => `/appraisal-year-end/year-end/cycles/${to.params.id}/grid` },
{ path: '/year_end/cycles/:id/config', redirect: (to) => `/appraisal-year-end/year-end/cycles/${to.params.id}/config` },
{ path: '/year-end/appraisal-payout', redirect: (to) => ({ path: '/appraisal-year-end/year-end/payout', query: to.query }) },
```

檔案上方（routes 陣列宣告前）加 helper：

```ts
import type { RouteLocation, RouteLocationRaw } from 'vue-router'

// 舊 ?section=&tab= 導覽 → 巢狀路由（2026-07-10 改版相容層；後端 exceptions deep_link 也走此格式）
function resolveLegacySectionQuery(to: RouteLocation): RouteLocationRaw | null {
  const q = { ...to.query }
  const section = Array.isArray(q.section) ? q.section[0] : q.section
  if (!section) return null
  delete q.section
  const tabRaw = Array.isArray(q.tab) ? q.tab[0] : q.tab
  delete q.tab
  if (section === 'appraisal') {
    const tab = tabRaw === 'cycles' ? 'history' : tabRaw === 'institution_events' ? 'institution-events' : tabRaw
    if (tab === 'settings') return { path: '/appraisal-year-end/rules/scoring' }
    if (tab && ['current', 'history', 'institution-events', 'disciplinary'].includes(tab)) {
      // cycle/view 只對 history 有意義，其餘子頁清掉避免殘留
      if (tab !== 'history') { delete q.cycle; delete q.view }
      return { path: `/appraisal-year-end/appraisal/${tab}`, query: q }
    }
    return { path: '/appraisal-year-end/appraisal/current' }
  }
  if (section === 'year-end') return { path: '/appraisal-year-end/year-end', query: q }
  if (section === 'payout') return { path: '/appraisal-year-end/year-end/payout', query: q }
  if (section === 'year-end-rules') return { path: '/appraisal-year-end/rules/year-end-rules' }
  if (section === 'exceptions') return { path: '/appraisal-year-end/exceptions', query: q }
  return null
}
```

- [ ] **Step 4: 更新 `constants/permissions.ts`**（取代現有 4 條 `/appraisal-year-end` exact 規則；最長匹配語意下子路徑規則勝出）

```ts
// 考核 × 年終 整合工作區（2026-07-10 巢狀路由）：頂層 prefix 承載 OR 語意（含 overview），
// 子區塊以「最長匹配」細分——對齊各子頁實際呼叫的後端守衛，避免看得到分頁卻 API 403。
{ path: '/appraisal-year-end', permission: 'SETTINGS_READ', prefix: true },
{ path: '/appraisal-year-end', permission: 'SALARY_READ', prefix: true },
{ path: '/appraisal-year-end', permission: 'YEAR_END_READ', prefix: true },
{ path: '/appraisal-year-end', permission: 'APPRAISAL_FINALIZE', prefix: true },
{ path: '/appraisal-year-end', permission: 'APPRAISAL_READ', prefix: true },
{ path: '/appraisal-year-end/appraisal', permission: 'APPRAISAL_READ', prefix: true },
{ path: '/appraisal-year-end/year-end', permission: 'YEAR_END_READ', prefix: true },
{ path: '/appraisal-year-end/year-end/payout', permission: 'APPRAISAL_FINALIZE' },
{ path: '/appraisal-year-end/rules', permission: 'APPRAISAL_READ', prefix: true },
{ path: '/appraisal-year-end/rules', permission: 'SETTINGS_READ', prefix: true },
{ path: '/appraisal-year-end/rules/year-end-rules', permission: 'SETTINGS_READ' },
{ path: '/appraisal-year-end/exceptions', permission: 'APPRAISAL_READ' },
{ path: '/appraisal-year-end/exceptions', permission: 'YEAR_END_READ' },
```

既有 `/appraisal` prefix、`/year_end` prefix、`/year-end/appraisal-payout`、`/appraisal-management` 規則**保留**（redirect 解析與 getAllowedRoutes 一致性，對齊 `/recruitment` 慣例）。
同步更新 `appraisalRoutePermissions.test.ts` 與 `appraisalYearEndRoute.spec.ts`：新增案例——持 `APPRAISAL_READ` 可過 `/appraisal-year-end/appraisal/current`、只持 `YEAR_END_READ` 不可過 `/appraisal-year-end/year-end/payout`（APPRAISAL_FINALIZE 才可）、只持 `SETTINGS_READ` 可過 `/appraisal-year-end/rules/year-end-rules`。

- [ ] **Step 5: AdminSidebar activeMenu**（`/appraisal-year-end/...` 子頁仍高亮模組項）

```ts
const activeMenu = computed(() => {
  if (route.path.startsWith('/salary/')) return '/salary'
  if (route.path.startsWith('/appraisal-year-end/')) return '/appraisal-year-end'
  return route.path
})
```

- [ ] **Step 6: 刪除舊檔**：`rm src/views/AppraisalYearEndView.vue src/views/__tests__/AppraisalYearEndView.spec.ts`；建最小 `OverviewWorkbenchView.vue` 骨架（見 Interfaces）。`grep -rn "AppraisalYearEndView" src/` 確認無殘留引用。
- [ ] **Step 7: 更新 `yearEndAdminRouteMeta.spec.ts`**：原斷言 `/year_end/cycles/:id*` 三路由 meta 的測試改為斷言新巢狀路徑 + names 保留 + 舊路徑 redirect（可直接引用 Step 1 測試涵蓋的部分，僅保留 meta.title 斷言）。
- [ ] **Step 8: 跑測試**：`npx vitest run src/router src/constants src/utils/__tests__/appraisalYearEndRoute.spec.ts` → PASS；`npm run typecheck` → PASS
- [ ] **Step 9: Commit**：`git commit -m "feat(router): 考核與年終改巢狀路由 + 舊 URL/deep_link redirect 全表 + 權限規則細分" -- src/router src/constants/permissions.ts src/constants/__tests__ src/utils/__tests__/appraisalYearEndRoute.spec.ts src/components/layout/AdminSidebar.vue src/views/appraisalYearEnd/OverviewWorkbenchView.vue`（刪檔用 `git add -u` 後同樣 path 限定 commit）

---

### Task 6: 總覽工作台

**Files:**
- Modify: `src/views/appraisalYearEnd/OverviewWorkbenchView.vue`（骨架 → 完整）
- Create: `src/views/appraisalYearEnd/components/Workbench{Appraisal,YearEnd,Exceptions,Payout}Card.vue`
- Create: `src/views/appraisalYearEnd/__tests__/OverviewWorkbenchView.spec.ts`

**Interfaces:**
- Consumes: `getAppraisalCurrentCycle()`、`getSignStatusSummary(cycleId)`（shape `{ cycle_id, counts: Record<string,number>, buckets: [...] }`）、`listYearEndCycles()`、`getYearEndGrid(cycleId)`、`getAppraisalCycleExceptions(cycleId)`、`getYearEndCycleExceptions(cycleId)`、`previewAppraisalPayout(year)`（rows 含 `total_amount`）、Task 3 `SignProgressBar`。
- Produces: 工作台頁。父層只抓兩個「週期把手」（current appraisal cycle、最新 year-end cycle），以 props 傳卡片；各卡自抓明細、各自 skeleton/錯誤重試。

**卡片契約（四張同構）**：props `{ cycle?: { id: number; label: string; status: string } | null }`（Payout 卡為 `{ year: number }`）；內部 `loading/error/data` 三態；error 態顯示「載入失敗」+ 重試按鈕；卡頭 = 標題 + `CYCLE_STATUS_TAG` 狀態 tag；卡尾 CTA `router-link`。

- [ ] **Step 1: 失敗測試**（mock 形狀**抄真實契約**——`SignStatusSummaryOut`、`PayoutPreviewRow` 見 Interfaces；驗：①有 APPRAISAL_READ 才渲染考核卡 ②考核卡渲染進度 ③單卡 API reject 時該卡顯示重試、其他卡正常 ④年終 OPEN 週期時年終卡排第一）

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn(() => true) }))
vi.mock('@/api/appraisal', () => ({
  getAppraisalCurrentCycle: vi.fn(() => Promise.resolve({ data: { id: 7, academic_year: 114, semester: 2, status: 'OPEN' } })),
  getSignStatusSummary: vi.fn(() => Promise.resolve({ data: { cycle_id: 7, counts: { DRAFT: 10, SUPERVISOR_SIGNED: 5, ACCOUNTING_SIGNED: 3, FINALIZED: 2 }, buckets: [] } })),
  getAppraisalCycleExceptions: vi.fn(() => Promise.resolve({ data: { items: [] } })),
}))
vi.mock('@/api/yearEnd', () => ({
  listYearEndCycles: vi.fn(() => Promise.resolve({ data: [{ id: 3, academic_year: 114, bonus_calc_date: '2026-01-15', status: 'OPEN' }] })),
  getYearEndGrid: vi.fn(() => Promise.resolve({ data: { rows: [{ settlement_id: 1, status: 'DRAFT' }, { settlement_id: 2, status: 'FINALIZED' }] } })),
  getYearEndCycleExceptions: vi.fn(() => Promise.resolve({ data: { items: [{ type: 'qualification', severity: 'warning' }] } })),
  previewAppraisalPayout: vi.fn(() => Promise.resolve({ data: { rows: [] } })),
}))

import OverviewWorkbenchView from '../OverviewWorkbenchView.vue'
import { getSignStatusSummary } from '@/api/appraisal'

const mountView = () => mount(OverviewWorkbenchView, { global: { stubs: { 'router-link': { template: '<a><slot /></a>' } } } })

describe('OverviewWorkbenchView', () => {
  it('考核卡顯示簽核進度、年終卡顯示待簽核數、例外卡顯示計數', async () => {
    const w = mountView(); await flushPromises()
    expect(w.text()).toContain('草稿 10')
    expect(w.text()).toContain('已核定 2 / 共 20')
    expect(w.text()).toContain('待簽核 1')   // grid 2 列中 1 列非 FINALIZED
    expect(w.text()).toContain('例外待辦')
  })
  it('單卡 API 失敗 → 該卡顯示重試，其他卡不受影響', async () => {
    vi.mocked(getSignStatusSummary).mockRejectedValueOnce(new Error('boom'))
    const w = mountView(); await flushPromises()
    expect(w.find('[data-test="appraisal-card"]').text()).toContain('載入失敗')
    expect(w.find('[data-test="year-end-card"]').text()).toContain('待簽核')
  })
})
```

- [ ] **Step 2: 確認失敗** → FAIL
- [ ] **Step 3: 實作**

`OverviewWorkbenchView.vue`：`onMounted` 用 `Promise.allSettled([getAppraisalCurrentCycle(), listYearEndCycles()])` 取兩把手；`appraisalCycle` label 格式「{academic_year} 學年{semester === 1 ? '上' : '下'}學期」；`yearEndCycle` 取 `academic_year` 最大者，label「{academic_year} 學年度」。卡片順序 computed：`yearEndCycle?.status === 'OPEN'` 時 `['year-end','appraisal',...]` 否則 `['appraisal','year-end',...]`；grid 版面 `display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: var(--space-4)`。權限：考核卡 `APPRAISAL_READ`、年終卡 `YEAR_END_READ`、例外卡 `APPRAISAL_READ||YEAR_END_READ`、發放卡 `APPRAISAL_FINALIZE`。

`WorkbenchAppraisalCard.vue`（其餘三卡同構，僅資料源/內容不同）：

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getSignStatusSummary } from '@/api/appraisal'
import { apiError } from '@/utils/error'
import { CYCLE_STATUS_LABEL, CYCLE_STATUS_TAG } from '@/constants/appraisalYearEnd'
import SignProgressBar from './SignProgressBar.vue'

const props = defineProps<{ cycle: { id: number; label: string; status: string } | null }>()
const loading = ref(false)
const error = ref('')
const counts = ref<Record<string, number>>({})

async function load() {
  if (!props.cycle) return
  loading.value = true; error.value = ''
  try {
    counts.value = (await getSignStatusSummary(props.cycle.id)).data.counts ?? {}
  } catch (e) { error.value = apiError(e, '載入失敗') } finally { loading.value = false }
}
onMounted(load)
</script>

<template>
  <el-card shadow="never" data-test="appraisal-card" class="wb-card">
    <template #header>
      <div class="wb-card__head">
        <span class="wb-card__title">當期考核</span>
        <el-tag v-if="cycle" size="small" :type="CYCLE_STATUS_TAG[cycle.status] ?? 'info'">
          {{ cycle.label }}（{{ CYCLE_STATUS_LABEL[cycle.status] ?? cycle.status }}）
        </el-tag>
      </div>
    </template>
    <el-skeleton v-if="loading" :rows="2" animated />
    <div v-else-if="error" class="wb-card__error">
      載入失敗 <el-button size="small" text type="primary" @click="load">重試</el-button>
    </div>
    <el-empty v-else-if="!cycle" description="本學期尚未建立考核週期" :image-size="48" />
    <template v-else>
      <SignProgressBar :counts="counts" />
      <router-link class="wb-card__cta" :to="`/appraisal-year-end/appraisal/history?cycle=${cycle.id}&view=kanban`">前往簽核 →</router-link>
    </template>
  </el-card>
</template>
```

- `WorkbenchYearEndCard.vue`：抓 `getYearEndGrid(cycle.id)`，內容 = `SignProgressBar`（counts 由 rows 的 `status` 聚合）+「待簽核 n」（非 FINALIZED 列數）；CTA 兩個：「前往總表 →」`/appraisal-year-end/year-end/cycles/${cycle.id}/grid`、「結算明細」`/appraisal-year-end/year-end/cycles/${cycle.id}`。無週期 → empty「尚未建立年終週期」+「前往建立」連到 `/appraisal-year-end/year-end`。
- `WorkbenchExceptionsCard.vue`：props 收兩個 cycle，各自 `getAppraisalCycleExceptions/getYearEndCycleExceptions`（缺週期側跳過），內容 =「考核 n 筆 / 年終 m 筆」與 severity 彙總（error 紅 tag、warning 黃 tag）；全零顯示「✓ 沒有待處理事項」success 文字；CTA「前往處理 →」`/appraisal-year-end/exceptions`。
- `WorkbenchPayoutCard.vue`：props `{ year: number }`（父層傳 `new Date().getFullYear()`），`previewAppraisalPayout(year)`，內容 =「可發放 n 筆、合計 {formatCurrency(Σ total_amount)}」；CTA `/appraisal-year-end/year-end/payout?year=${year}`。

- [ ] **Step 4: 確認通過**：`npx vitest run src/views/appraisalYearEnd` → PASS
- [ ] **Step 5: Commit**：`git commit -m "feat(appraisal-year-end): 總覽工作台（四卡＋進度條＋權限化＋單卡降級）" -- src/views/appraisalYearEnd`

---

### Task 7: CurrentSemesterOverview 精修

**Files:**
- Modify: `src/views/appraisal/CurrentSemesterOverview.vue`
- Modify: `src/views/appraisal/__tests__/CurrentSemesterOverview.spec.ts`（既有測試檔在 `src/views/appraisal/__tests__/`，若名稱不同以 `grep -rl CurrentSemesterOverview src --include='*.spec.ts'` 為準）

**Interfaces:**
- Consumes: Task 1 常數、Task 2 fmtPct。

三個修繕（硬傷 #12、#10、#8）：

- [ ] **Step 1: 失敗測試**（三案）

```ts
// ① 出缺勤欄：非零項才顯示 badge，全零顯示 —
// ② refreshAppraisalCycle reject 時顯示 stale-warning banner（可關閉）
// ③ 載入中 KPI 區顯示 skeleton（w.find('.el-skeleton').exists()）
```

測試骨架（mock api 同既有 spec 慣例，新增案例）：

```ts
it('出缺勤全零顯示 —，非零僅列非零項', async () => {
  // mock all_employees_status 回傳一列全零、一列 late=2
  const w = await mountLoaded()
  const cells = w.findAll('[data-test="attn-cell"]')
  expect(cells[0].text()).toBe('—')
  expect(cells[1].text()).toContain('遲 2')
  expect(cells[1].text()).not.toContain('曠')
})
it('進頁自動重算失敗 → 顯示舊資料警示 banner', async () => {
  vi.mocked(refreshAppraisalCycle).mockRejectedValueOnce(new Error('boom'))
  const w = await mountLoaded()
  expect(w.find('[data-test="stale-banner"]').text()).toContain('自動重算失敗')
})
```

- [ ] **Step 2: 確認失敗** → FAIL
- [ ] **Step 3: 實作**

① 出缺勤欄（原本一格拼 `遲x/早x/未x/假x/曠x` 字串處）改：

```ts
// 欄位名以檔內既有取值為準（late/early_leave/no_punch/leave/absent 對應遲/早/未/假/曠）
const ATTN_ITEMS: Array<{ key: string; label: string }> = [
  { key: 'late_count', label: '遲' }, { key: 'early_leave_count', label: '早' },
  { key: 'no_punch_count', label: '未' }, { key: 'leave_count', label: '假' }, { key: 'absent_count', label: '曠' },
]  // ⚠ key 名稱以 CurrentSemesterOverview 現行模板實際欄位為準，實作時對照原字串拼接處逐一搬移
const attnBadges = (row: Record<string, unknown>) =>
  ATTN_ITEMS.filter((i) => Number(row[i.key] ?? 0) > 0).map((i) => ({ ...i, count: Number(row[i.key]) }))
```

```vue
<template #default="{ row }">
  <span data-test="attn-cell">
    <template v-if="attnBadges(row).length">
      <el-tag v-for="b in attnBadges(row)" :key="b.key" size="small" type="warning" class="attn-badge">{{ b.label }} {{ b.count }}</el-tag>
    </template>
    <template v-else>—</template>
  </span>
</template>
```

功過欄（`過x／功x`）同法：非零才顯示，過=danger tag、功=success tag，全零 `—`。
② `refreshIfOpen` 的 catch 從靜默改設 `refreshFailed = ref(false)` → template 在 KPI 區上方：

```vue
<el-alert v-if="refreshFailed" data-test="stale-banner" type="warning" closable
  title="自動重算失敗，目前顯示的是上次成功計算的資料" :description="`資料時間：${lastComputedAt}`" />
```

（`lastComputedAt` 即既有「已即時重算 HH:mm」的時間戳變數。）
③ KPI 區：`loading` 時以 `<el-skeleton :rows="1" animated />` × 4 佔位（包在既有 StatCard grid 容器內）。
順手：本檔百分比顯示改 `fmtPct`；寫死 `gap:16px` 等改 `var(--space-4)`。

- [ ] **Step 4: 確認通過**：`npx vitest run src/views/appraisal` → PASS
- [ ] **Step 5: Commit**：`git commit -m "feat(appraisal): 當期總覽精修——多值欄拆 badge、重算失敗警示、KPI skeleton" -- src/views/appraisal`

---

### Task 8: 歷史週期簽核體驗（CycleDetailPanel + SummaryCard + 批次常駐）

**Files:**
- Modify: `src/views/appraisal/CycleDetailPanel.vue`
- Modify: `src/views/appraisal/components/SummaryCard.vue`
- Modify: 對應測試檔（`grep -rl "CycleDetailPanel\|SummaryCard" src --include='*.spec.ts'`）

**Interfaces:**
- Consumes: Task 3 `SignProgressBar`、Task 1 `gradeLabel/GRADE_TAG/SIGN_STATUS_TAG`、既有 `getSignStatusSummary`。

- [ ] **Step 1: 失敗測試**（三案：①面板頂部渲染進度列 ②未勾選時批次按鈕 disabled 而非隱藏 ③SummaryCard 對 DRAFT 顯示「主管簽」主按鈕、等第顯中文）
- [ ] **Step 2: 確認失敗** → FAIL
- [ ] **Step 3: 實作**

① CycleDetailPanel：`onMounted` + 簽核成功後呼叫 `loadSignCounts()`（`getSignStatusSummary(cycleId)` 取 `counts`），`.meta` 資訊列下方渲染 `<SignProgressBar :counts="signCounts" />`。
② 批次簽核區塊：外層 `v-if="selectedIds.length"` 移除，改常駐；`BatchSignButton` 傳入 `:disabled="!selectedIds.length"`（BatchSignButton 若無 disabled prop 則加上，透傳給內部 `el-button`），包 `el-tooltip content="勾選列後可批次簽核" :disabled="selectedIds.length > 0"`。
③ SummaryCard：卡尾加主按鈕——依 `summary.status` 與權限顯示**當前那一步**動作（DRAFT→'主管簽'、SUPERVISOR_SIGNED→'會計簽'、ACCOUNTING_SIGNED→'核定'；權限判斷複用現有 dropdown 內相同的 `hasPermission` 條件，dropdown 保留退簽/留言/log）：

```vue
<el-button v-if="primaryAction" size="small" type="primary" class="summary-card__primary" @click.stop="emit(primaryAction.event, summary)">
  {{ primaryAction.label }}
</el-button>
```

```ts
const primaryAction = computed(() => {
  const s = props.summary.status
  if (s === 'DRAFT' && canSignSupervisor.value) return { label: STAGE_LABEL.SUPERVISOR, event: 'sign-supervisor' as const }
  if (s === 'SUPERVISOR_SIGNED' && canSignAccounting.value) return { label: STAGE_LABEL.ACCOUNTING, event: 'sign-accounting' as const }
  if (s === 'ACCOUNTING_SIGNED' && canFinalize.value) return { label: STAGE_LABEL.FINALIZE, event: 'finalize' as const }
  return null
})
```

（emit 事件名以 SummaryCard 現有 dropdown 對 KanbanView 的既有 emit 名為準——實作時抄現檔，不要新造事件名。）
等第：`{{ gradeLabel(summary.grade) }}` + `:type="GRADE_TAG[summary.grade]"`。

- [ ] **Step 4: 確認通過** → PASS；另跑 `npx vitest run src/views/appraisal` 全綠
- [ ] **Step 5: Commit**：`git commit -m "feat(appraisal): 簽核進度列＋批次按鈕常駐＋卡片主按鈕與等第中文" -- src/views/appraisal`

---

### Task 9:（後端）結算 response 補姓名欄位 + codegen

**Files:**（ivy-backend）
- Modify: `schemas/year_end.py`（`SettlementOut` 加 `employee_name: str`；`SpecialBonusOut` 加 `employee_name: str`；`PayoutItem` 加 `employee_name: str`；class targets 的 Out schema 加 `head_teacher_name: Optional[str]`、`deputy_teacher_name: Optional[str]`、`classroom_name: Optional[str]`——實際 schema 名以 `grep -n "class.*Out" schemas/year_end.py` 為準）
- Modify: `api/year_end/` 對應端點（settlements 列表、special_bonuses 列表、appraisal-payout 列表、class_targets 列表）改以 join / 批次查 `Employee.name`、`Classroom.name` 填入
- Test: `tests/test_year_end_settlements.py` 等既有測試檔（以 `grep -rl "settlements" tests/ | head` 定位）加姓名斷言

- [ ] **Step 1: 失敗測試**（每個端點一條斷言；掛 `test_db_session`）

```python
def test_settlements_response_includes_employee_name(client, test_db_session, seeded_cycle_with_settlement):
    resp = client.get(f"/year_end/cycles/{seeded_cycle_with_settlement.id}/settlements", headers=admin_headers)
    assert resp.status_code == 200
    rows = resp.json()
    assert rows and rows[0]["employee_name"]  # 不再只回 employee_id
```

（fixture 名以該測試檔既有 fixture 為準；special_bonuses / appraisal-payout / class_targets 各加同型斷言。）
- [ ] **Step 2: 確認失敗**：`pytest tests/test_year_end_settlements.py -o addopts="" -q` → FAIL（KeyError employee_name）
- [ ] **Step 3: 實作**：schema 加欄位；端點取列表後批次補名（避免 N+1）：

```python
emp_names = dict(
    db.query(Employee.id, Employee.name)
    .filter(Employee.id.in_({s.employee_id for s in settlements}))
    .all()
)
return [SettlementOut(**..., employee_name=emp_names.get(s.employee_id, f"員工 {s.employee_id}")) for s in settlements]
```

（若端點原本直接 `response_model=list[SettlementOut]` 由 ORM 序列化，改為顯式組裝或在 query 直接 join 帶出 name；四個端點做法一致。）
- [ ] **Step 4: 確認通過** → PASS；跑該模組全檔 `pytest tests/ -k "year_end" -o addopts="" -q` → 全綠
- [ ] **Step 5: Commit（backend repo）**：`git commit -m "feat(year-end): 結算/特別獎金/payout/班級編制 response 補姓名欄位" -- schemas/year_end.py api/year_end tests/`
- [ ] **Step 6: Codegen（回 frontend repo）**：`cd ~/Desktop/ivy-backend && python scripts/dump_openapi.py`；`cd ~/Desktop/ivy-frontend && npm run gen:api && npm run gen:api:check` → 通過；`git commit -m "chore(api): 同步年終姓名欄位 OpenAPI 型別" -- src/api/_generated`

---

### Task 10: YearEndListView 瘦身

**Files:**
- Modify: `src/views/yearEnd/YearEndListView.vue`
- Modify: `src/views/yearEnd/__tests__/YearEndListView.spec.ts`

**Interfaces:**
- Consumes: Task 1 `CYCLE_STATUS_LABEL/TAG`。
- Produces: 列表每列動作收斂為 明細/總表/設定 + 「匯出」dropdown（總表 Excel/轉帳名冊）；狀態機按鈕（鎖定/封存/退回）**移除**（Task 11 移入明細頁）；`el-page-header` 換共用 `PageHeader`（無返回鍵）；`router.push` 目標改新巢狀路徑。

- [ ] **Step 1: 更新測試**：斷言①列動作不再包含「鎖定」②「明細」點擊 push `/appraisal-year-end/year-end/cycles/1`③狀態 tag 文案來自 `CYCLE_STATUS_LABEL`。跑 → FAIL
- [ ] **Step 2: 實作**：刪 `transitionStatus/lockCycle/closeCycle/reopenToLocked/reopenToOpen/statusBusy/canFinalize`（整段 G2 區塊移到 Task 11）；`STATUS_LABELS/STATUS_TAG_TYPE` 本地常數改 import；動作欄改：

```vue
<el-button link type="primary" @click="router.push(`/appraisal-year-end/year-end/cycles/${row.id}`)">明細</el-button>
<el-button link type="primary" @click="router.push(`/appraisal-year-end/year-end/cycles/${row.id}/grid`)">總表</el-button>
<el-button link @click="router.push(`/appraisal-year-end/year-end/cycles/${row.id}/config`)">設定</el-button>
<el-dropdown>
  <el-button link>匯出<el-icon><ArrowDown /></el-icon></el-button>
  <template #dropdown><el-dropdown-menu>
    <el-dropdown-item><a :href="exportYearEndSummaryXlsxUrl(row.id)">年終獎金總表</a></el-dropdown-item>
    <el-dropdown-item><a :href="exportYearEndTransferRosterXlsxUrl(row.id)">轉帳名冊</a></el-dropdown-item>
  </el-dropdown-menu></template>
</el-dropdown>
```

頂部 `el-page-header` 改 `<PageHeader title="年終獎金" subtitle="年度結算週期管理" />`，工具列按鈕放 `#actions` slot。
- [ ] **Step 3: 測試通過** → PASS
- [ ] **Step 4: Commit**：`git commit -m "refactor(year-end): 列表瘦身——動作收斂、狀態機操作移出、統一標籤與頁首" -- src/views/yearEnd/YearEndListView.vue src/views/yearEnd/__tests__/YearEndListView.spec.ts`

---

### Task 11: YearEndDetailView 重整

**Files:**
- Modify: `src/views/yearEnd/YearEndDetailView.vue`
- Modify: `src/views/yearEnd/__tests__/YearEndDetailView.spec.ts`

**Interfaces:**
- Consumes: Task 9 `employee_name` 欄位、Task 1 常數、Task 3 `SignProgressBar`、既有 `updateCycleStatus`。

- [ ] **Step 1: 失敗測試**（四案）

```ts
it('結算單顯示員工姓名而非裸 ID', ...)           // mock settlements 帶 employee_name
it('header 顯示狀態機按鈕：OPEN 週期顯示「鎖定」', ...)
it('封存前置檢核：有未核定結算單時點「封存」被阻擋並列出筆數', ...)
it('頂部渲染簽核進度列', ...)
```

- [ ] **Step 2: 確認失敗** → FAIL
- [ ] **Step 3: 實作**

① 三個表的「員工 ID」欄改 `employee_name`（ID 移入次要顯示：`{{ row.employee_name }}` + tooltip 顯示 `ID {{ row.employee_id }}`）；班級績效表用 `classroom_name/head_teacher_name`。
② `.meta` 列狀態 raw code 改 `cycleStatusLabel` + `CYCLE_STATUS_TAG` tag；下方加 `<SignProgressBar :counts="settlementCounts" />`（由已載入 settlements 的 status 聚合，無額外 API）。
③ Task 10 移出的狀態機函式整段搬入本檔 header 動作區（沿用原 confirm 文案），並加封存前置檢核：

```ts
async function closeCycle() {
  const notFinalized = settlements.value.filter((s) => s.status !== 'FINALIZED')
  if (notFinalized.length > 0) {
    ElMessageBox.alert(
      `尚有 ${notFinalized.length} 筆結算單未核定（FINALIZED），無法封存。請先完成簽核。`,
      '無法封存', { type: 'error' },
    )
    return
  }
  // ...原 confirm + updateCycleStatus 流程
}
```

④ 簽核狀態 tag 補 `:type="SIGN_STATUS_TAG[row.status]"`（修「全預設灰」）；金額欄一律 `formatCurrency`。

- [ ] **Step 4: 確認通過** → PASS
- [ ] **Step 5: Commit**：`git commit -m "feat(year-end): 明細頁重整——姓名欄、簽核進度列、狀態機收斂與封存前置檢核" -- src/views/yearEnd/YearEndDetailView.vue src/views/yearEnd/__tests__/YearEndDetailView.spec.ts`

---

### Task 12: YearEndGridView 修繕

**Files:**
- Modify: `src/views/yearEnd/YearEndGridView.vue`
- Modify: `src/views/yearEnd/__tests__/YearEndGridView.spec.ts`

- [ ] **Step 1: 失敗測試**（三案：①「展開」不再 router.push（原 404），改列內 expand 顯示明細 descriptions ②buildSettlements 成功後頁頂顯示摘要列（built/skipped/unmatched）③build 失敗顯示 stale banner 而非靜默）
- [ ] **Step 2: 確認失敗** → FAIL
- [ ] **Step 3: 實作**

① 刪 `openDetail`（`/settlements/:id` push），表格首欄加 `<el-table-column type="expand">`：

```vue
<el-table-column type="expand" width="40">
  <template #default="{ row }">
    <el-descriptions :column="3" size="small" border class="grid-expand">
      <el-descriptions-item v-for="col in expandFields(row)" :key="col.label" :label="col.label">{{ col.value }}</el-descriptions-item>
    </el-descriptions>
  </template>
</el-table-column>
```

`expandFields(row)` 列出主結算全部欄位（沿用檔內既有欄位定義與 `moneyInt` → 改 `formatCurrency` 整數）+ 手改備註 + 溯源連結（開既有 ProvenanceDrawer/手改 dialog 的按鈕移入 expand 亦可，操作欄保留「手改/明細條 PDF」）。
② build 成功：`buildResult = ref<BuildSummary | null>(null)` → 頁頂 `<el-alert type="info" closable>` 顯示「試算完成：建立 {built}、跳過已核定 {skipped_finalized}、未匹配 {unmatched…}」（欄位名以 `BuildResultOut` schema.d.ts 為準）。
③ 進頁自動 build 的 catch：設 `buildFailed = true` → `<el-alert type="warning" closable title="自動試算失敗，目前顯示上次試算資料" :description="最後試算時間">`。
④ 匯出四鈕改 `el-button tag="a" :href="..."` 統一寫法；狀態 tag/標籤改 import Task 1 常數（刪本地 `STATUS_TAG_TYPE`）。

- [ ] **Step 4: 確認通過** → PASS
- [ ] **Step 5: Commit**：`git commit -m "fix(year-end): 總表展開列內化（修 404）＋試算摘要與失敗警示" -- src/views/yearEnd/YearEndGridView.vue src/views/yearEnd/__tests__/YearEndGridView.spec.ts`

---

### Task 13: AppraisalPayoutView 補完

**Files:**
- Modify: `src/views/yearEnd/AppraisalPayoutView.vue`
- Modify: `src/views/yearEnd/__tests__/AppraisalPayoutView.spec.ts`

- [ ] **Step 1: 失敗測試**（三案）

```ts
it('已生成分頁渲染 listAppraisalPayouts 真列表（員工姓名/期別/金額）', ...)  // mock 形狀抄 PayoutItem：{ id, employee_id, employee_name, bonus_type, period_label, amount, source_ref, calc_meta }
it('金額以 formatCurrency 千分位呈現', ...)   // 例 NT$12,345
it('year 同步 URL query：改年份 → route.query.year 更新', ...)
```

- [ ] **Step 2: 確認失敗** → FAIL
- [ ] **Step 3: 實作**

① 已生成分頁：切到該 tab 時 `listAppraisalPayouts(year)` 載入，`el-table` 欄：員工（`employee_name`）/ 期別（`period_label`）/ 金額（`formatCurrency(amount)`，右對齊）/ 來源（`source_ref ?? '—'`）；空狀態 `EmptyState`「本年尚未生成」。「清空本年 payout」danger 按鈕從 header 移入此分頁工具列，成功後 reload 列表。
② 預覽分頁 footer 大按鈕金額改 `formatCurrency`（修無千分位）。
③ `year` 持久化：初值 `Number(route.query.year) || new Date().getFullYear()`；變更時 `router.replace({ query: { ...route.query, year: String(year) } })`。
④ 寫死色碼改 token；header 改 `PageHeader`。

- [ ] **Step 4: 確認通過** → PASS
- [ ] **Step 5: Commit**：`git commit -m "feat(year-end): 考核年終發放——已生成分頁接真資料、金額千分位、年份入 URL" -- src/views/yearEnd/AppraisalPayoutView.vue src/views/yearEnd/__tests__/AppraisalPayoutView.spec.ts`

---

### Task 14: ExceptionCenterView 微調

**Files:**
- Modify: `src/views/yearEnd/ExceptionCenterView.vue` 與其 spec

- [ ] **Step 1: 失敗測試**（②同時驗 deep_link 仍可導航——router-link :to 原樣保留即可）

```ts
it('type chips 顯示中文標籤而非 raw code', ...)   // qualification → 年資資格疑義
it('週期選擇同步 URL query（acycle/ycycle），重載後保留', ...)
```

- [ ] **Step 2: 確認失敗** → FAIL
- [ ] **Step 3: 實作**：chips 與 row 標題以 `exceptionTypeLabel(item.type)` 顯示；考核/年終兩組的週期 select 初值讀 `route.query.acycle` / `route.query.ycycle`，變更時 `router.replace` 寫回。
- [ ] **Step 4: 確認通過** → PASS
- [ ] **Step 5: Commit**：`git commit -m "feat(year-end): 例外中心 type 中文化＋週期選擇入 URL" -- src/views/yearEnd/ExceptionCenterView.vue src/views/yearEnd/__tests__`

---

### Task 15: 規則設定收尾（深色卡修復 + 舊容器退役 + 跳轉更新）

**Files:**
- Modify: `src/views/yearEnd/YearEndRulesPanel.vue`（深色卡 → 標準 el-card）
- Modify: `src/views/yearEnd/YearEndConfigView.vue`（「前往年終規則設定」按鈕 push `/appraisal-year-end/rules/year-end-rules`；「← 返回」按鈕移除，靠麵包屑；寫死色碼改 token）
- Delete: `src/views/appraisal/AppraisalSettingsView.vue`（tabs 容器已無人引用）
- Modify: 相關 spec

- [ ] **Step 1: 更新測試**：YearEndRulesPanel spec 加「卡片不含寫死 #2b303b」斷言（`expect(w.html()).not.toContain('#2b303b')`）；YearEndConfigView spec 斷言跳轉目標為新路徑。跑 → FAIL
- [ ] **Step 2: 實作**：`.box-card` 的 `background:#2b303b`、白字等整段刪除，改 `el-card shadow="never"` 預設 + `var(--space-*)` 間距；`grep -n "#2b303b\|#409eff" src/views/yearEnd/` 清零。刪 `AppraisalSettingsView.vue` 前先 `grep -rn "AppraisalSettingsView" src/` 確認僅剩自身。
- [ ] **Step 3: 測試通過**：`npx vitest run src/views/yearEnd` → PASS；`npm run typecheck` → PASS
- [ ] **Step 4: Commit**：`git commit -m "fix(year-end): 年終規則深色卡修復＋設定容器退役＋跳轉路徑更新" -- src/views/yearEnd src/views/appraisal`

---

### Task 16: 排序、token 掃尾、死碼清理

**Files:**
- Modify: `src/views/appraisal/components/ListView.vue`、`src/views/yearEnd/{YearEndDetailView,YearEndGridView}.vue`、`src/views/salary/DisciplinaryPanel.vue`、`src/views/appraisal/components/InstitutionEventPanel.vue`（sortable）
- Modify: `src/api/appraisal.ts`（死碼）、`src/components/…/ProvenanceDrawer`（動態 keys；實際路徑 `grep -rl DEDUCTION_KEYS src/`）
- Modify: 各 view 殘留寫死 px/色碼

- [ ] **Step 1: sortable**：上述表格的數值欄（總分/獎金/金額/合計/時數/扣款）與狀態欄加 `sortable`；日期欄加 `sortable` + 既有值為 ISO 字串可直接字典序。逐檔跑對應 spec 確認不破。
- [ ] **Step 2: 死碼**：`grep -rn "getAppraisalAggregatedStatus\|listAppraisalScoreItems\|addAppraisalScoreItem" src/ --include='*.vue' --include='*.ts' | grep -v api/appraisal.ts | grep -v __tests__` → 確認零引用後自 `api/appraisal.ts` 移除（含相關孤兒測試）；若有引用則保留並在 PR 說明記錄。
- [ ] **Step 3: ProvenanceDrawer 動態 keys**：`DEDUCTION_KEYS` 寫死清單改為渲染 response 實際回傳的 keys（label 查表、缺 label fallback raw key）。
- [ ] **Step 4: token 掃尾**：`grep -rn "padding: *[0-9]\|gap: *[0-9]\|margin: *[0-9]" src/views/appraisal src/views/yearEnd src/views/appraisalYearEnd --include='*.vue'` 逐一改 `var(--space-*)`（對照表：4px→--space-1、8px→--space-2、12px→--space-3、16px→--space-4、24px→--space-5，以專案 tokens 定義為準）；剩餘寫死色碼改 element token。
- [ ] **Step 5: 全套**：`npx vitest run src/views/appraisal src/views/yearEnd src/views/appraisalYearEnd src/router src/constants` → PASS；`npm run typecheck && npm run lint` → PASS
- [ ] **Step 6: Commit**：`git commit -m "chore(appraisal-year-end): 表格排序、design token 掃尾、死碼清理" -- src/views src/api src/components`

---

### Task 17: 全套驗證與整合檢查

- [ ] **Step 1: 前端全套**：`npx vitest run` → 全綠（pre-existing 紅以 git stash 以外方式定責——共用 checkout 禁 stash，用 `git worktree` 或對照 origin/main 判定）；`npm run typecheck && npm run lint && npm run gen:api:check` → PASS
- [ ] **Step 2: 後端全套**（ivy-backend）：`pytest -q`（完整跑，確認 Task 9 無漣漪）
- [ ] **Step 3: 跨端 parity**：派 `cross-repo-parity-checker` agent 檢查四向同步（本次改動涉 Pydantic schema + OpenAPI）
- [ ] **Step 4: 手動驗證清單**（請使用者前景起 `start.sh` 後實點；Claude 不執行 start.sh）：
  1. 側欄進「考核與年終」→ 落地總覽工作台，四卡依權限顯示、進度條有數字
  2. 頂部切五區塊，麵包屑正確；F5 停留原頁
  3. 年終 → 明細/總表/設定：仍在外殼內、麵包屑「考核與年終 › 年終 › 總表」、瀏覽器返回正常
  4. 總表「展開」列內顯示明細（不再 404）；「鎖定/封存」在明細頁；有未核定時封存被擋
  5. 考核年終發放 → 已生成分頁有真列表；金額千分位
  6. 舊書籤 `/year_end/cycles/1/grid`、`/appraisal-year-end?section=exceptions` 正確落地；例外中心「前往處理」深連結可用
  7. 規則設定五分頁齊備；年終規則卡片不再深色
  8. 暗色模式（html.dark）下工作台/進度條/卡片正常
- [ ] **Step 5: 收尾**：兩 repo 各自確認 `git log` 乾淨、測試綠。push 與部署**不在本計畫範圍**（依 workspace 慣例由使用者決定 push 時機；⚠ BE push 即 prod 跑 migration——本次無新 migration，但仍先跑 `./scripts/finish-check.sh` 檢視）

---

## Self-Review 紀錄

- Spec 覆蓋：IA（Task 4/5/6）、設計語言（Task 1/2/3 + 各 view task + 16）、15 條硬傷（#1,15→T5；#2→T12；#3→T16；#4→T9/11；#5→T8；#6→T3/6/8/11；#7→T13；#8→T7 及各卡 skeleton；#9→T15；#10→T7/12；#11→T10/11；#12→T7；#13→T14；#14→T8），後端一項（T9）、YAGNI 清單未越界。
- 型別/名稱一致性：`SignProgressBar` props `counts`；常數名 `CYCLE_STATUS_*/SIGN_STATUS_*/GRADE_*/EXCEPTION_TYPE_LABEL` 全計畫一致；route names 保留三個 year-end-cycle-*。
- 已知不確定點（實作時以現檔為準，不可自創）：CurrentSemesterOverview 出缺勤欄位 key 名、SummaryCard emit 事件名、後端 class targets schema 名、既有測試 fixture 名——各 task 已標注對照指令。
