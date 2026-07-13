# 員工模組 Crisp 視覺皮層試點 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 員工模組全 surface 換上「精緻 SaaS」視覺皮層（髮絲線／高密度／outline pill），作為全後台新視覺語言的試點。

**Architecture:** 新增 `src/assets/crisp.css`，所有 token 與 Element Plus 覆寫 scope 在 `.crisp-surface` class 底下；EmployeeHubView 與 EmployeeDetailView 兩個路由根節點掛 class。功能與資訊架構不動（前四輪 UX 成果全保留），僅視覺＋少量順手的資訊呈現升級（年資欄、錨點 active、空值「未填寫」、薪資就地補登）。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、Element Plus、Vitest（兩棵測試樹）、vue-tsc、ESLint。

**Spec:** `docs/superpowers/specs/2026-07-13-employee-crisp-visual-pilot-design.md`

## Global Constraints

- 純前端；不改任何 API／後端；無新依賴、新字型。
- **不動** `main.css`／`design-tokens.css`／`a11y.css` 既有值；新規則只進 `crisp.css`（scope 在 `.crisp-surface`）與元件 scoped style。
- crisp.css 內所有顏色一律走 `--crisp-*` 變數，dark 只覆寫變數值；**禁止**在規則右值引用 EP `--el-color-primary-light-N` 或寫死淺色 hex（07-11 報表改版 dark 白底白字教訓）。
- 權限遮罩措辭不可改：遮罩薪資 null →「無檢視權限」、投保 0 →「未設定」（`maskedMoney`/`insuranceLevelDisplay` 不動）。「未填寫」只用於真空值。
- 主色維持 `var(--brand-primary)`（admin＝`#0284c7`），不引入新 brand 色。
- 員工模組測試分佈**兩棵樹**：`src/**/__tests__/` 與 `tests/unit/`。改到共用元件/工具時，兩樹同名測試檔都要跑。
- **共用 checkout 有平行 session**：commit 一律 path 限定 `git commit -m "..." -- <檔案們>`（`-m` 必在 `--` 前）；絕不 `git add -A`／裸 `git commit -a`。
- Commit 訊息：Conventional Commits、繁體中文。
- Gate 指令：`npx vitest run <檔案們>`、`npm run typecheck`、`npm run lint`。

---

### Task 1: crisp.css 皮層建立＋入口 import＋掛載

**Files:**
- Create: `src/assets/crisp.css`
- Modify: `src/main.ts`（import 一行）
- Modify: `src/views/EmployeeHubView.vue`（root class）
- Modify: `src/views/EmployeeDetailView.vue`（root class）

**Interfaces:**
- Produces: `.crisp-surface` scope class（後續 task 的 CSS 錨點）；utility class `.crisp-empty`（Task 6 消費）；`--crisp-*` 變數（Task 5 scoped style 消費）。

- [ ] **Step 1: 建立 `src/assets/crisp.css`**（完整內容如下）

```css
/**
 * Crisp 視覺皮層（精緻 SaaS）— 員工模組試點
 * spec: docs/superpowers/specs/2026-07-13-employee-crisp-visual-pilot-design.md
 *
 * 規則全部 scope 在 .crisp-surface 底下；推廣到其他模組＝在該模組路由根節點掛同 class。
 * 顏色一律走 --crisp-* 變數（html.dark 只覆寫變數值）；禁止在規則右值寫死淺色 hex
 * 或引用 EP --el-color-primary-light-N（dark 下會白底白字）。
 */

.crisp-surface {
  /* ── 皮層 token（light）── */
  --crisp-surface: #ffffff;
  --crisp-hairline: var(--neutral-200);
  --crisp-hairline-soft: var(--neutral-100);
  --crisp-head-bg: var(--neutral-50);
  --crisp-text: var(--neutral-900);
  --crisp-text-secondary: var(--neutral-600);
  --crisp-text-muted: var(--neutral-500);
  --crisp-text-faint: var(--neutral-400);
  --crisp-accent-soft: #f0f9ff;
  /* pill 語意色：邊框 / 文字 / 色點 / 選中底 */
  --crisp-pill-success-border: #86efac;
  --crisp-pill-success-text: #15803d;
  --crisp-pill-success-dot: #22c55e;
  --crisp-pill-warning-border: #fcd34d;
  --crisp-pill-warning-text: #b45309;
  --crisp-pill-warning-dot: #f59e0b;
  --crisp-pill-warning-soft: #fffbeb;
  --crisp-pill-danger-border: #fca5a5;
  --crisp-pill-danger-text: #b91c1c;
  --crisp-pill-danger-dot: #ef4444;
  --crisp-pill-danger-soft: #fef2f2;
  --crisp-pill-info-border: #bae6fd;
  --crisp-pill-info-text: #0369a1;
  --crisp-pill-info-dot: #0284c7;
  --crisp-pill-info-soft: #f0f9ff;
  --crisp-pill-neutral-border: var(--neutral-200);
  --crisp-pill-neutral-text: var(--neutral-400);
  --crisp-pill-neutral-dot: var(--neutral-300);

  /* ── EP 變數橋接：scope 內所有 EP 元件統一髮絲線／文字階 ── */
  --el-border-color: var(--crisp-hairline);
  --el-border-color-light: var(--crisp-hairline);
  --el-border-color-lighter: var(--crisp-hairline-soft);
  --el-text-color-primary: var(--crisp-text);
  --el-text-color-regular: var(--crisp-text-secondary);
  --el-text-color-secondary: var(--crisp-text-muted);
  --el-fill-color-light: var(--crisp-head-bg);
  --el-table-row-hover-bg-color: var(--crisp-head-bg);
  --el-card-border-color: var(--crisp-hairline);
}

html.dark .crisp-surface {
  --crisp-surface: #1e293b;
  --crisp-hairline: #334155;
  --crisp-hairline-soft: #2b3a4f;
  --crisp-head-bg: #253143;
  --crisp-text: #e2e8f0;
  --crisp-text-secondary: #cbd5e1;
  --crisp-text-muted: #94a3b8;
  --crisp-text-faint: #64748b;
  --crisp-accent-soft: rgba(2, 132, 199, 0.16);
  --crisp-pill-success-border: rgba(34, 197, 94, 0.4);
  --crisp-pill-success-text: #4ade80;
  --crisp-pill-warning-border: rgba(245, 158, 11, 0.4);
  --crisp-pill-warning-text: #fbbf24;
  --crisp-pill-warning-soft: rgba(245, 158, 11, 0.12);
  --crisp-pill-danger-border: rgba(239, 68, 68, 0.4);
  --crisp-pill-danger-text: #f87171;
  --crisp-pill-danger-soft: rgba(239, 68, 68, 0.12);
  --crisp-pill-info-border: rgba(2, 132, 199, 0.45);
  --crisp-pill-info-text: #38bdf8;
  --crisp-pill-info-soft: rgba(2, 132, 199, 0.12);
  --crisp-pill-neutral-border: #334155;
  --crisp-pill-neutral-text: #64748b;
  --crisp-pill-neutral-dot: #475569;
}

/* ── 卡片：去陰影、髮絲線 ── */
.crisp-surface .el-card {
  border: 1px solid var(--crisp-hairline);
  box-shadow: none;
  background: var(--crisp-surface);
}

/* ── 表格 ── */
.crisp-surface .el-table {
  --el-table-border-color: var(--crisp-hairline-soft);
  --el-table-header-bg-color: var(--crisp-head-bg);
  font-size: 13px;
}
.crisp-surface .el-table th.el-table__cell {
  background: var(--crisp-head-bg);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.4px;
  color: var(--crisp-text-faint);
}
/* hover：整列淺灰（EP 變數已橋接）＋左緣 2px 主色條（不佔版面） */
.crisp-surface .el-table__body tr:hover > td.el-table__cell:first-child {
  box-shadow: inset 2px 0 0 var(--brand-primary);
}

/* ── el-tag → outline pill＋語意色點 ── */
.crisp-surface .el-tag {
  border-radius: 999px;
  background: transparent;
  font-weight: 500;
}
.crisp-surface .el-tag::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  margin-right: 5px;
  vertical-align: middle;
  background: var(--crisp-pill-info-dot);
}
.crisp-surface .el-tag--success { color: var(--crisp-pill-success-text); border-color: var(--crisp-pill-success-border); }
.crisp-surface .el-tag--success::before { background: var(--crisp-pill-success-dot); }
.crisp-surface .el-tag--warning { color: var(--crisp-pill-warning-text); border-color: var(--crisp-pill-warning-border); }
.crisp-surface .el-tag--warning::before { background: var(--crisp-pill-warning-dot); }
.crisp-surface .el-tag--danger { color: var(--crisp-pill-danger-text); border-color: var(--crisp-pill-danger-border); }
.crisp-surface .el-tag--danger::before { background: var(--crisp-pill-danger-dot); }
/* type=info 用於「已離職」等中性狀態 → 灰 pill */
.crisp-surface .el-tag--info { color: var(--crisp-pill-neutral-text); border-color: var(--crisp-pill-neutral-border); }
.crisp-surface .el-tag--info::before { background: var(--crisp-pill-neutral-dot); }
/* 選中態（todo chips effect=dark）：淺色填底＋1px 內框，取代原黑底 */
.crisp-surface .el-tag--dark.el-tag--warning {
  background: var(--crisp-pill-warning-soft);
  color: var(--crisp-pill-warning-text);
  border-color: var(--crisp-pill-warning-dot);
  box-shadow: inset 0 0 0 1px var(--crisp-pill-warning-dot);
}
.crisp-surface .el-tag--dark.el-tag--info {
  background: var(--crisp-pill-info-soft);
  color: var(--crisp-pill-info-text);
  border-color: var(--crisp-pill-info-dot);
  box-shadow: inset 0 0 0 1px var(--crisp-pill-info-dot);
}

/* ── el-descriptions（詳情頁 def-list）── */
.crisp-surface .el-descriptions__label.is-bordered-label {
  background: var(--crisp-head-bg);
  font-size: 12px;
  font-weight: 500;
  color: var(--crisp-text-muted);
}
.crisp-surface .el-descriptions__content {
  font-size: 13px;
  color: var(--crisp-text);
  font-variant-numeric: tabular-nums;
}

/* ── dialog 頁首頁尾分隔線 ── */
.crisp-surface .el-dialog__header {
  border-bottom: 1px solid var(--crisp-hairline-soft);
  padding-bottom: 12px;
}
.crisp-surface .el-dialog__footer {
  border-top: 1px solid var(--crisp-hairline-soft);
  padding-top: 12px;
}

/* ── 分頁切換（Hub el-segmented）── */
.crisp-surface .el-segmented {
  background: var(--crisp-head-bg);
  border: 1px solid var(--crisp-hairline);
  border-radius: 8px;
  padding: 3px;
}

/* ── 頁首 ── */
.crisp-surface .page-header h2 {
  font-size: 20px;
  font-weight: 650;
  letter-spacing: -0.3px;
}
.crisp-surface .page-subtitle {
  margin: 2px 0 0;
  font-size: var(--text-xs);
  color: var(--crisp-text-muted);
}
.crisp-surface .roster-stats { font-variant-numeric: tabular-nums; }
.crisp-surface .roster-stats b { color: var(--crisp-text); font-weight: 650; }

/* ── 空值顯示（Task 6 消費）── */
.crisp-surface .crisp-empty { color: var(--crisp-text-faint); }
```

- [ ] **Step 2: `src/main.ts` import**——在 `import './styles/form-hint.css'` 之後加一行：

```ts
import './assets/crisp.css'
```

- [ ] **Step 3: 掛載 class**——`src/views/EmployeeHubView.vue` template 根節點：

```html
<div class="employee-hub-view crisp-surface">
```

`src/views/EmployeeDetailView.vue` template 根節點：

```html
<div class="employee-detail-page crisp-surface">
```

- [ ] **Step 4: 迴歸驗證（本 task 無新行為，既有兩樹測試不得破）**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run src/views/__tests__/EmployeeHubView.spec.ts src/views/__tests__/EmployeeListView.cardview.spec.ts src/views/__tests__/EmployeeDetailView.test.ts tests/unit/views/EmployeeListView.test.js`
Expected: 全綠。

Run: `npm run typecheck && npm run lint`
Expected: 皆 0 errors。

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(employee): crisp 視覺皮層基礎（token/EP 覆寫/dark）＋員工模組掛載" -- src/assets/crisp.css src/main.ts src/views/EmployeeHubView.vue src/views/EmployeeDetailView.vue
```

---

### Task 2: tenureLabel 年資工具（TDD）

**Files:**
- Modify: `src/utils/employeeDisplay.ts`
- Test: `tests/unit/utils/employeeDisplay.test.ts`（既有檔，追加 describe）

**Interfaces:**
- Consumes: 同檔既有 `todayISO`（`@/utils/format`）。
- Produces: `tenureLabel(emp: Record<string, unknown>, todayIso?: string): string`——Task 4 的表格欄與手機卡片欄消費。

- [ ] **Step 1: 寫失敗測試**——在 `tests/unit/utils/employeeDisplay.test.ts` 追加（import 行把 `tenureLabel` 加進既有的 `@/utils/employeeDisplay` named import）：

```ts
describe('tenureLabel', () => {
  it('在職員工由到職日計算年資（X.Y 年）', () => {
    expect(tenureLabel({ is_active: true, hire_date: '2019-08-01' }, '2026-07-13')).toBe('6.9 年')
  })
  it('當月到職 → 0.0 年', () => {
    expect(tenureLabel({ is_active: true, hire_date: '2026-07-01' }, '2026-07-13')).toBe('0.0 年')
  })
  it('已離職 → —', () => {
    expect(tenureLabel({ is_active: false, hire_date: '2019-08-01' }, '2026-07-13')).toBe('—')
  })
  it('缺 hire_date 或非法格式 → —', () => {
    expect(tenureLabel({ is_active: true }, '2026-07-13')).toBe('—')
    expect(tenureLabel({ is_active: true, hire_date: 'not-a-date' }, '2026-07-13')).toBe('—')
  })
  it('未來到職日 → —', () => {
    expect(tenureLabel({ is_active: true, hire_date: '2026-08-01' }, '2026-07-13')).toBe('—')
  })
})
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run tests/unit/utils/employeeDisplay.test.ts`
Expected: FAIL（`tenureLabel` 未匯出）。

- [ ] **Step 3: 實作**——`src/utils/employeeDisplay.ts` 追加（放在 `isMissingSalary` 之後）：

```ts
/**
 * 年資顯示：在職者由到職日算至今日（X.Y 年）。
 * 已離職、缺／不合法／未來到職日一律回「—」。
 * 日期用本地時區逐欄 parse（勿用 new Date('YYYY-MM-DD')，UTC 偏移會差一天，同 utils/expiry 慣例）。
 */
export const tenureLabel = (emp: Record<string, unknown>, todayIso: string = todayISO()): string => {
  if (!emp.is_active) return '—'
  const hire = emp.hire_date
  if (typeof hire !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(hire)) return '—'
  const [y, m, d] = hire.split('-').map(Number)
  const [ty, tm, td] = todayIso.split('-').map(Number)
  const hireDate = new Date(y, m - 1, d)
  const today = new Date(ty, tm - 1, td)
  if (Number.isNaN(hireDate.getTime()) || hireDate.getTime() > today.getTime()) return '—'
  const years = (today.getTime() - hireDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  return `${years.toFixed(1)} 年`
}
```

- [ ] **Step 4: 跑測試確認 GREEN**

Run: `npx vitest run tests/unit/utils/employeeDisplay.test.ts`
Expected: PASS（含既有案例全綠）。

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(employee): tenureLabel 年資計算（在職依到職日、離職/缺值回—）" -- src/utils/employeeDisplay.ts tests/unit/utils/employeeDisplay.test.ts
```

---

### Task 3: 清單頁頁首＋工具列

**Files:**
- Modify: `src/views/EmployeeListView.vue`（template 頁首區＋匯出按鈕）
- Test: `tests/unit/views/EmployeeListView.test.js`（既有，驗不破）

**Interfaces:**
- Consumes: Task 1 的 `.page-subtitle`／`.roster-stats b` crisp.css 規則。
- Produces: 無（純呈現）。

- [ ] **Step 1: 頁首加副標＋統計數字粗體**——`page-header-left` 內 `<h2>員工管理</h2>` 之後插入副標，並把 roster-stats 的數字用 `<b>` 包起（**文字內容不變**，既有「顯示 N 筆／共 M 人」測試以 text() 斷言不受影響）：

```html
<h2>員工管理</h2>
<p class="page-subtitle">全園名冊、任職資料與離職作業</p>
<p v-if="!loading" class="roster-stats">
  <template v-if="hasActiveFilters">顯示 <b>{{ displayedEmployees.length }}</b> 筆 <span class="stat-sep">·</span> </template>
  共 <b>{{ rosterStats.total }}</b> 人
  <span class="stat-sep">·</span> 在職 <b>{{ rosterStats.active }}</b>
  <template v-if="rosterStats.pending">
    <span class="stat-sep">·</span> 待離職 <b>{{ rosterStats.pending }}</b>
  </template>
  <template v-if="rosterStats.resigned">
    <span class="stat-sep">·</span> 已離職 <b>{{ rosterStats.resigned }}</b>
  </template>
</p>
```

- [ ] **Step 2: 匯出按鈕降級**——同檔 template，`<el-button type="success" @click="exportEmployees">匯出 Excel</el-button>` 改為：

```html
<el-button @click="exportEmployees">匯出 Excel</el-button>
```

- [ ] **Step 3: 跑兩樹清單測試確認不破**

Run: `npx vitest run tests/unit/views/EmployeeListView.test.js src/views/__tests__/EmployeeListView.cardview.spec.ts`
Expected: 全綠（若有測試斷言匯出按鈕 `type=success`，把該斷言改成不帶 type；先 grep：`grep -rn "success" tests/unit/views/EmployeeListView.test.js`）。

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(employee): 清單頁首副標＋統計數字粗體＋匯出按鈕降級為次要" -- src/views/EmployeeListView.vue tests/unit/views/EmployeeListView.test.js
```

（tests 檔若無改動則不列入 pathspec。）

---

### Task 4: 清單表格合併欄＋年資欄＋手機卡片欄

**Files:**
- Modify: `src/views/EmployeeListView.vue`（script import＋employeeCardColumns＋table columns＋scoped style）
- Test: `tests/unit/views/EmployeeListView.test.js`、`src/views/__tests__/EmployeeListView.cardview.spec.ts`（既有，驗不破／隨改）

**Interfaces:**
- Consumes: Task 2 `tenureLabel`；Task 1 表格皮層 CSS。
- Produces: 無。

- [ ] **Step 1: script 接上 tenureLabel**——`src/views/EmployeeListView.vue` 的 `@/utils/employeeDisplay` import 加入 `tenureLabel`：

```ts
import { statusKeyOf, getEmployeeStatus, isMissingSalary, tenureLabel, type EmployeeStatusKey } from '@/utils/employeeDisplay'
```

- [ ] **Step 2: 手機卡片欄位加年資**——`employeeCardColumns` 改為：

```ts
const employeeCardColumns = [
  { label: '編號', prop: 'employee_id' },
  { label: '教育局職稱', prop: 'title' },
  { label: '園內職務', prop: 'position' },
  { label: '到職日', prop: 'hire_date' },
  { label: '年資', prop: '__tenure', formatter: (item: Record<string, unknown>) => tenureLabel(item) },
  { label: '狀態', prop: '__status' },
]
```

（AdminListCards 的 `cellValue` 有 formatter 時優先採用，`__tenure` 為虛擬 prop。）

- [ ] **Step 3: 桌機表格改欄**——把既有兩欄：

```html
<el-table-column prop="title" label="教育局職稱" width="150" sortable />
<el-table-column prop="position" label="園內職務" width="120" />
```

替換為合併欄＋年資欄（年資插在「到職日」欄之後）：

```html
<el-table-column prop="title" label="教育局職稱 / 園內職務" min-width="170" sortable>
  <template #default="scope">
    <div class="col-title">{{ scope.row.title || '—' }}</div>
    <div v-if="scope.row.position" class="col-position">{{ scope.row.position }}</div>
  </template>
</el-table-column>
```

```html
<el-table-column label="年資" width="90">
  <template #default="scope">{{ tenureLabel(scope.row) }}</template>
</el-table-column>
```

- [ ] **Step 4: scoped style 補雙行欄樣式**——同檔 `<style scoped>` 追加：

```css
.col-title { font-weight: 500; line-height: 1.35; }
.col-position { font-size: 12px; color: var(--crisp-text-muted, var(--text-tertiary)); line-height: 1.35; }
```

- [ ] **Step 5: 跑兩樹清單測試**

Run: `npx vitest run tests/unit/views/EmployeeListView.test.js src/views/__tests__/EmployeeListView.cardview.spec.ts`
Expected: 全綠。若有測試以「園內職務」獨立欄或欄數斷言而破，改斷言對齊新欄結構（合併欄 label 為「教育局職稱 / 園內職務」、新增「年資」欄）。

- [ ] **Step 6: typecheck＋lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors。

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(employee): 清單表格職稱職務合併雙行＋新增年資欄（含手機卡片）" -- src/views/EmployeeListView.vue tests/unit/views/EmployeeListView.test.js src/views/__tests__/EmployeeListView.cardview.spec.ts
```

（tests 檔若無改動則不列入 pathspec。）

---

### Task 5: 詳情頁錨點 active（scroll-spy）＋證照到期徽章

**Files:**
- Modify: `src/views/EmployeeDetailView.vue`
- Test: `src/views/__tests__/EmployeeDetailView.test.ts`（既有檔追加案例）

**Interfaces:**
- Consumes: Task 1 `--crisp-accent-soft`／`--crisp-pill-warning-text` 變數（scoped style 引用，變數繼承自根節點 class）。
- Produces: 無。

- [ ] **Step 1: 寫失敗測試**——`src/views/__tests__/EmployeeDetailView.test.ts` 追加（沿用檔內 `mountDetail`／`localISOOffset` helper）：

```ts
describe('EmployeeDetailView 錨點導覽升級', () => {
  beforeEach(() => vi.clearAllMocks())

  it('證照 30 天內到期 → 錨點「學歷・證照・合約」帶到期徽章', () => {
    const w = mountDetail({ certificates: [{ id: 1, expiry_date: localISOOffset(10) }] })
    const anchor = w.findAll('.anchor-link').find((a) => a.text().includes('學歷・證照・合約'))
    expect(anchor!.text()).toContain('1 即將到期')
  })

  it('證照已逾期優先於將到期顯示', () => {
    const w = mountDetail({
      certificates: [
        { id: 1, expiry_date: localISOOffset(-5) },
        { id: 2, expiry_date: localISOOffset(10) },
      ],
    })
    const anchor = w.findAll('.anchor-link').find((a) => a.text().includes('學歷・證照・合約'))
    expect(anchor!.text()).toContain('1 已逾期')
    expect(anchor!.text()).not.toContain('即將到期')
  })

  it('無到期證照 → 錨點無徽章（既有文字斷言不變）', () => {
    const w = mountDetail()
    const labels = w.findAll('.anchor-link').map((a) => a.text())
    expect(labels).toEqual(['職務・班級', '個資・聯絡', '薪資・投保', '學歷・證照・合約', '出勤紀錄'])
  })

  it('點擊錨點 → 該錨點取得 is-active（預設第一個 active）', async () => {
    const w = mountDetail()
    expect(w.findAll('.anchor-link')[0].classes()).toContain('is-active')
    await w.findAll('.anchor-link')[2].trigger('click')
    expect(w.findAll('.anchor-link')[2].classes()).toContain('is-active')
    expect(w.findAll('.anchor-link')[0].classes()).not.toContain('is-active')
  })
})
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run src/views/__tests__/EmployeeDetailView.test.ts`
Expected: 新增 4 案例 FAIL（無徽章、無 is-active）。

- [ ] **Step 3: 實作 script 部分**——`src/views/EmployeeDetailView.vue`：

3a. import 行補 `watch`、`nextTick`、`onUnmounted`：

```ts
import { computed, ref, toRef, onMounted, onUnmounted, watch, nextTick } from 'vue'
```

3b. 證照到期計數抽成單一來源（放在 `employeeTodos` 宣告之前），並讓 `employeeTodos` 改用它（刪除其內部 `expiredCertCount`／`expiringCertCount` 迴圈，改讀 `certExpiryCounts.value.expired`／`.expiring`）：

```ts
// 證照到期計數單一來源：employeeTodos 與錨點徽章共用，避免兩處口徑漂移
const certExpiryCounts = computed(() => {
  let expired = 0
  let expiring = 0
  for (const cert of certificates.value) {
    const status = expiryStatus(typeof cert.expiry_date === 'string' ? cert.expiry_date : null)
    if (status.kind === 'expired') expired++
    else if (status.kind === 'expiring') expiring++
  }
  return { expired, expiring }
})
```

3c. scroll-spy（放在 `scrollToSection` 附近）；`scrollToSection` 首行補 `activeSectionKey.value = key`：

```ts
// 錨點 active：IntersectionObserver 追蹤視口內最上方的 section；
// happy-dom 無 IO（typeof 守衛跳過），測試環境退化為「點擊時設定」
const activeSectionKey = ref<string>(SECTIONS[0].key)
let sectionObserver: IntersectionObserver | null = null
const observeSections = () => {
  if (typeof IntersectionObserver === 'undefined') return
  sectionObserver?.disconnect()
  sectionObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((e) => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
    if (visible.length) activeSectionKey.value = visible[0].target.id.replace('emp-sec-', '')
  }, { rootMargin: '-10% 0px -70% 0px' })
  for (const s of SECTIONS) {
    const el = document.getElementById(`emp-sec-${s.key}`)
    if (el) sectionObserver.observe(el)
  }
}
watch(employee, async (val) => {
  if (val) { await nextTick(); observeSections() }
}, { immediate: true })
onUnmounted(() => sectionObserver?.disconnect())
```

- [ ] **Step 4: 實作 template 錨點**——anchor-nav 內容改為：

```html
<nav class="anchor-nav" aria-label="區塊導覽">
  <a
    v-for="s in SECTIONS" :key="s.key" :href="`#emp-sec-${s.key}`"
    :class="['anchor-link', { 'is-active': activeSectionKey === s.key }]"
    @click.prevent="scrollToSection(s.key)"
  >
    {{ s.label }}
    <span v-if="s.key === 'credentials' && certExpiryCounts.expired > 0" class="anchor-badge is-danger">{{ certExpiryCounts.expired }} 已逾期</span>
    <span v-else-if="s.key === 'credentials' && certExpiryCounts.expiring > 0" class="anchor-badge is-warning">{{ certExpiryCounts.expiring }} 即將到期</span>
  </a>
</nav>
```

- [ ] **Step 5: scoped style**——`.anchor-link` 既有規則改為（加 padding/radius），並追加 active／badge 規則：

```css
.anchor-link { cursor: pointer; font-size: 13px; color: var(--el-text-color-regular); padding: 4px 8px; border-radius: 6px; }
.anchor-link:hover { color: var(--el-color-primary); }
.anchor-link.is-active {
  background: var(--crisp-accent-soft);
  color: var(--brand-primary);
  font-weight: 600;
  box-shadow: inset 2px 0 0 var(--brand-primary);
}
.anchor-badge { font-size: 11px; margin-left: 4px; }
.anchor-badge.is-danger { color: var(--color-danger-darker); }
.anchor-badge.is-warning { color: var(--crisp-pill-warning-text); }
```

- [ ] **Step 6: 跑測試確認 GREEN（含既有案例）**

Run: `npx vitest run src/views/__tests__/EmployeeDetailView.test.ts`
Expected: 全綠（既有「錨點導覽順序與文字同步」案例因預設 mount 無證照而不受徽章影響）。

- [ ] **Step 7: typecheck＋lint 後 Commit**

Run: `npm run typecheck && npm run lint` → 0 errors。

```bash
git commit -m "feat(employee): 詳情頁錨點 scroll-spy active 態＋證照到期徽章就地顯示" -- src/views/EmployeeDetailView.vue src/views/__tests__/EmployeeDetailView.test.ts
```

---

### Task 6: sections 空值「未填寫」＋薪資就地補登＋FormDialog 薪資 tab 直達

**Files:**
- Modify: `src/components/employee/detail/BasicSection.vue`
- Modify: `src/components/employee/detail/JobSection.vue`
- Modify: `src/components/employee/detail/SalarySection.vue`
- Modify: `src/views/EmployeeDetailView.vue`（SalarySection 綁定）
- Modify: `src/components/employee/EmployeeFormDialog.vue`（openEdit 加 tab 參數）
- Modify: `src/components/employee/EmployeeChangesPreviewDialog.vue`（append-to-body 彈窗自掛 crisp-surface）
- Test: Create `src/components/employee/detail/__tests__/BasicSection.test.ts`
- Test: Create `src/components/employee/detail/__tests__/SalarySection.test.ts`

**Interfaces:**
- Consumes: Task 1 `.crisp-empty` class。
- Produces: `SalarySection` 新 props `canFix?: boolean`（default false）＋ emit `fix-salary`；`EmployeeFormDialog.openEdit(row, tab?: 'basic' | 'salary')`（第二參數選填，向後相容）。

**遮罩紅線（重申）**：`maskedMoney`（null→無檢視權限）、`insuranceLevelDisplay`（0→未設定）呼叫處一律不動；「未填寫」只進真空值欄位。

- [ ] **Step 1: 寫失敗測試（BasicSection）**——Create `src/components/employee/detail/__tests__/BasicSection.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import BasicSection from '../BasicSection.vue'

const mountSection = (employee: Record<string, unknown>) =>
  mount(BasicSection, { props: { employee }, global: { plugins: [ElementPlus] } })

describe('BasicSection 空值顯示', () => {
  it('空欄位顯示淡灰「未填寫」（crisp-empty）', () => {
    const w = mountSection({ phone: '', email: null })
    const empties = w.findAll('.crisp-empty')
    expect(empties.length).toBeGreaterThan(0)
    expect(empties[0].text()).toBe('未填寫')
  })
  it('有值欄位正常顯示、不帶 crisp-empty', () => {
    const w = mountSection({ phone: '0912-345-678' })
    expect(w.text()).toContain('0912-345-678')
    const phoneCell = w.findAll('span').find((s) => s.text() === '0912-345-678')
    expect(phoneCell!.classes()).not.toContain('crisp-empty')
  })
  it('眷屬人數 0 是有效值，不顯示未填寫', () => {
    const w = mountSection({ dependents: 0 })
    expect(w.text()).not.toContain('眷屬人數未填寫')
    const zeroCell = w.findAll('span').find((s) => s.text() === '0')
    expect(zeroCell).toBeTruthy()
    expect(zeroCell!.classes()).not.toContain('crisp-empty')
  })
})
```

- [ ] **Step 2: 寫失敗測試（SalarySection）**——Create `src/components/employee/detail/__tests__/SalarySection.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import SalarySection from '../SalarySection.vue'

const mountSection = (employee: Record<string, unknown>, canFix = true) =>
  mount(SalarySection, { props: { employee, canFix }, global: { plugins: [ElementPlus] } })

describe('SalarySection 底薪未設定就地補登', () => {
  it('正職底薪 0 → 顯示「尚未設定」＋「前往補登」，點擊 emit fix-salary', async () => {
    const w = mountSection({ employee_type: 'regular', base_salary: 0 })
    expect(w.text()).toContain('尚未設定')
    const btn = w.findAll('button').find((b) => b.text().includes('前往補登'))
    await btn!.trigger('click')
    expect(w.emitted('fix-salary')).toHaveLength(1)
  })
  it('canFix=false（無編輯權）→ 顯示尚未設定但無補登按鈕', () => {
    const w = mountSection({ employee_type: 'regular', base_salary: 0 }, false)
    expect(w.text()).toContain('尚未設定')
    expect(w.findAll('button').some((b) => b.text().includes('前往補登'))).toBe(false)
  })
  it('底薪 null（遮罩）→ 維持「無檢視權限」，不顯示補登', () => {
    const w = mountSection({ employee_type: 'regular', base_salary: null })
    expect(w.text()).toContain('無檢視權限')
    expect(w.text()).not.toContain('尚未設定')
  })
  it('有底薪 → 正常金額顯示', () => {
    const w = mountSection({ employee_type: 'regular', base_salary: 32000 })
    expect(w.text()).toContain('32,000')
  })
})
```

- [ ] **Step 3: 跑兩支新測試確認 RED**

Run: `npx vitest run src/components/employee/detail/__tests__/BasicSection.test.ts src/components/employee/detail/__tests__/SalarySection.test.ts`
Expected: FAIL（無 crisp-empty／無尚未設定分支／無 canFix prop）。

- [ ] **Step 4: BasicSection 實作**——template 全部空值 fallback 改「未填寫」模式：

```html
<template>
  <el-descriptions :column="2" border>
    <el-descriptions-item label="聯絡電話"><span :class="{ 'crisp-empty': !employee.phone }">{{ employee.phone || '未填寫' }}</span></el-descriptions-item>
    <el-descriptions-item label="生日"><span :class="{ 'crisp-empty': !employee.birthday }">{{ employee.birthday || '未填寫' }}</span></el-descriptions-item>
    <el-descriptions-item label="身分證"><span :class="{ 'crisp-empty': !employee.id_number }">{{ employee.id_number || '未填寫' }}</span></el-descriptions-item>
    <el-descriptions-item label="眷屬人數"><span :class="{ 'crisp-empty': employee.dependents == null }">{{ employee.dependents ?? '未填寫' }}</span></el-descriptions-item>
    <el-descriptions-item label="Email"><span :class="{ 'crisp-empty': !employee.email }">{{ employee.email || '未填寫' }}</span></el-descriptions-item>
    <el-descriptions-item label="性別"><span :class="{ 'crisp-empty': !employee.gender }">{{ employee.gender || '未填寫' }}</span></el-descriptions-item>
    <el-descriptions-item label="通訊地址" :span="2"><span :class="{ 'crisp-empty': !employee.address }">{{ employee.address || '未填寫' }}</span></el-descriptions-item>
    <el-descriptions-item label="緊急聯絡人"><span :class="{ 'crisp-empty': !employee.emergency_contact_name }">{{ employee.emergency_contact_name || '未填寫' }}</span></el-descriptions-item>
    <el-descriptions-item label="緊急聯絡電話"><span :class="{ 'crisp-empty': !employee.emergency_contact_phone }">{{ employee.emergency_contact_phone || '未填寫' }}</span></el-descriptions-item>
  </el-descriptions>
</template>
```

- [ ] **Step 5: JobSection 實作**——同模式改真空值欄位（employeeTypeLabel／staffRoleLabel 的 computed fallback `'—'` 同步改 `'未填寫'`）：

```html
<template>
  <el-descriptions :column="2" border>
    <el-descriptions-item label="員工類型"><span :class="{ 'crisp-empty': !employee.employee_type }">{{ employeeTypeLabel }}</span></el-descriptions-item>
    <el-descriptions-item label="園內職務"><span :class="{ 'crisp-empty': !employee.position }">{{ employee.position || '未填寫' }}</span></el-descriptions-item>
    <el-descriptions-item label="到職日"><span :class="{ 'crisp-empty': !employee.hire_date }">{{ employee.hire_date || '未填寫' }}</span></el-descriptions-item>
    <el-descriptions-item label="試用期結束"><span :class="{ 'crisp-empty': !employee.probation_end_date }">{{ employee.probation_end_date || '未填寫' }}</span></el-descriptions-item>
    <el-descriptions-item label="主管職">
      <el-tag v-if="employee.supervisor_role" size="small">{{ employee.supervisor_role }}</el-tag>
      <span v-else class="crisp-empty">未填寫</span>
    </el-descriptions-item>
    <el-descriptions-item label="班級"><span :class="{ 'crisp-empty': !employee.classroom_name }">{{ employee.classroom_name || '未填寫' }}</span></el-descriptions-item>
    <el-descriptions-item label="教保身分別"><span :class="{ 'crisp-empty': !employee.staff_role_category }">{{ staffRoleLabel }}</span></el-descriptions-item>
    <el-descriptions-item label="教師/教保員證號">
      <span :class="{ 'crisp-empty': !employee.teacher_cert_no }">{{ employee.teacher_cert_no || '未填寫' }}</span><span v-if="employee.teacher_cert_type">（{{ employee.teacher_cert_type }}）</span>
    </el-descriptions-item>
    <el-descriptions-item v-if="employee.resign_date" label="離職日">{{ employee.resign_date }}</el-descriptions-item>
    <el-descriptions-item v-if="employee.resign_reason" label="離職原因">{{ employee.resign_reason }}</el-descriptions-item>
  </el-descriptions>
</template>
```

script 兩個 computed 的 fallback：

```ts
const employeeTypeLabel = computed(() => {
  const opt = EMPLOYEE_TYPE_OPTIONS.find((o) => o.value === props.employee.employee_type)
  return opt ? opt.label : ((props.employee.employee_type as string) || '未填寫')
})
```

```ts
const staffRoleLabel = computed(() => {
  const v = props.employee.staff_role_category as string
  return v ? (STAFF_ROLE_LABELS[v] || v) : '未填寫'
})
```

- [ ] **Step 6: SalarySection 實作**——

6a. props／emits：

```ts
const props = withDefaults(defineProps<{
  employee: Record<string, unknown>
  standardSalary?: number | null
  canFix?: boolean
}>(), { standardSalary: null, canFix: false })

const emit = defineEmits<{ (e: 'fix-salary'): void }>()
```

6b. 底薪 descriptions-item 改為（底薪 0＝未設定時走補登分支，遮罩 null 仍走 maskedMoney；標準薪 hint 只在有真實底薪時顯示，避免 0 對標準薪誤標「低於標準」）：

```html
<el-descriptions-item v-if="!isHourly" label="底薪">
  <template v-if="baseSalaryNum === 0">
    <span class="crisp-empty">尚未設定</span>
    <el-button v-if="canFix" link type="primary" size="small" @click="emit('fix-salary')">前往補登</el-button>
  </template>
  <template v-else>
    <span>{{ maskedMoney(employee.base_salary) }}</span>
    <template v-if="standardSalary !== null && baseSalaryNum !== null">
      <span class="std-hint">標準：{{ standardSalary.toLocaleString() }}</span>
      <el-tag
        v-if="baseSalaryNum !== standardSalary"
        size="small"
        :type="baseSalaryNum > standardSalary ? 'success' : 'warning'"
        style="margin-left:6px"
      >{{ baseSalaryNum > standardSalary ? '↑ 高於標準' : '↓ 低於標準' }}</el-tag>
      <el-tag v-else size="small" type="info" style="margin-left:6px">符合標準</el-tag>
    </template>
  </template>
</el-descriptions-item>
```

6c. 加保生效日改未填寫模式：

```html
<el-descriptions-item label="加保生效日"><span :class="{ 'crisp-empty': !employee.insurance_effective_date }">{{ employee.insurance_effective_date || '未填寫' }}</span></el-descriptions-item>
```

- [ ] **Step 7: FormDialog openEdit 加 tab 參數**——`src/components/employee/EmployeeFormDialog.vue` 的 `openEdit` 改為：

```ts
const openEdit = async (row: Record<string, unknown>, tab: 'basic' | 'salary' = 'basic') => {
  handleEdit(row)
  await nextTick()
  // handleEdit → populateForm 內會把 activeTab 重置為 basic，故在 nextTick 後指定目標 tab
  activeTab.value = tab
  await employeeDraft.maybePromptRestore()
}
```

（注意：若 populateForm／resetForm 內沒有重置 activeTab 的行為，直接設定亦無害；`defineExpose({ openCreate, openEdit })` 不變，既有呼叫 `openEdit(row)` 向後相容。）

- [ ] **Step 8: DetailView 接線**——`src/views/EmployeeDetailView.vue`：

```html
<SalarySection :employee="employee" :standard-salary="standardSalary" :can-fix="canWriteEmployees" @fix-salary="openEditSalary" />
```

script 追加（放在 `openEdit` 旁）：

```ts
const openEditSalary = () => { if (employee.value) formDialog.value?.openEdit(employee.value, 'salary') }
```

- [ ] **Step 9: ChangesPreviewDialog 自掛皮層**——`src/components/employee/EmployeeChangesPreviewDialog.vue` 的 el-dialog（`append-to-body` teleport 到 body、吃不到根節點 scope）加 class：

```html
<el-dialog v-model="visible" :title="title" width="540px" append-to-body class="crisp-surface">
```

- [ ] **Step 10: 跑測試確認 GREEN＋掃兩樹既有斷言**

Run: `npx vitest run src/components/employee/detail/__tests__/ src/views/__tests__/EmployeeDetailView.test.ts src/components/employee/__tests__/`
Expected: 全綠。

再掃「—」斷言是否被本次改動波及（只掃詳情 section 相關測試）：
Run: `grep -rn "'—'" src/components/employee/detail/__tests__/ tests/ --include="*employee*" --include="*Employee*" -il`
若有斷言落在 BasicSection/JobSection/SalarySection 真空值欄位 → 隨改為「未填寫」。

- [ ] **Step 11: typecheck＋lint 後 Commit**

Run: `npm run typecheck && npm run lint` → 0 errors。

```bash
git commit -m "feat(employee): 詳情空值統一「未填寫」＋底薪未設定就地補登（直達薪資 tab）" -- src/components/employee/detail/BasicSection.vue src/components/employee/detail/JobSection.vue src/components/employee/detail/SalarySection.vue src/components/employee/detail/__tests__/BasicSection.test.ts src/components/employee/detail/__tests__/SalarySection.test.ts src/components/employee/EmployeeFormDialog.vue src/components/employee/EmployeeChangesPreviewDialog.vue src/views/EmployeeDetailView.vue
```

---

### Task 7: 收尾驗證（全 gate＋瀏覽器 light/dark 實測）

**Files:**
- 無新增修改（驗證性 task；如發現皮層規則需微調，改 `src/assets/crisp.css` 並重跑 gate）

**Interfaces:**
- Consumes: Task 1–6 全部產出。

- [ ] **Step 1: 員工模組全量測試（兩樹）**

Run: `npx vitest run src/views/__tests__/EmployeeHubView.spec.ts src/views/__tests__/EmployeeListView.cardview.spec.ts src/views/__tests__/EmployeeDetailView.test.ts src/components/employee/ tests/unit/views/EmployeeListView.test.js tests/unit/utils/employeeDisplay.test.ts tests/components/`
Expected: 全綠。

- [ ] **Step 2: 全案 typecheck＋lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors。

- [ ] **Step 3: 瀏覽器實測（需 user 在自己終端起 `./start.sh`；Claude 不可代跑）**

以 chrome-devtools MCP 開 `http://localhost:5173`，登入 dev 帳號後逐項核實：

| # | Surface | 檢查點 |
|---|---------|--------|
| 1 | 清單頁 | 副標／粗體統計／pill 色點／合併欄雙行／年資欄／hover 左緣藍條／已離職淡化／匯出按鈕非綠色 |
| 2 | 清單互動 | todo chip 選中＝淺色填底＋內框（非黑底）；篩選、搜尋、匯出行為不變 |
| 3 | 詳情頁 | 卡片髮絲線無陰影；descriptions 標籤 muted；空值「未填寫」淡灰；錨點捲動時 active 跟隨；有到期證照時錨點徽章 |
| 4 | 詳情補登 | 底薪 0 員工顯示「尚未設定→前往補登」，點擊開編輯彈窗且落在薪資 tab |
| 5 | 表單彈窗 | 頁首頁尾分隔線；輸入框髮絲線；變更預覽彈窗（append-to-body）也吃到皮層 |
| 6 | 離職管理 | Hub 第二分頁整體皮層一致（scope 由 Hub 根節點涵蓋） |
| 7 | Dark mode | 切換 html.dark：上述 1–6 無白底白字／無淺色殘留；pill 對比可讀 |
| 8 | 對比抽查 | `--crisp-text-faint`（#94a3b8）僅用於表頭標籤/徽章等輔助文字（大面積正文不用）；pill 文字色對底色 ≥ 4.5:1（light 的 #15803d/#b45309/#0369a1 皆過） |

已知限制：<768 手機視口本環境測不出（claude-in-chrome 視窗縮放陷阱），手機卡片樣式以 CSS 層核實＋交 user 真機驗收。

- [ ] **Step 4: 如需微調 crisp.css，改後重跑 Step 1–2，然後 commit**

```bash
git commit -m "style(employee): crisp 皮層瀏覽器實測微調" -- src/assets/crisp.css
```

- [ ] **Step 5: 回報**——彙整：完成清單、commit SHA 列表、瀏覽器實測結果（過/不過逐項）、待 user 真機驗收項（手機卡片、dark 主觀觀感）。

---

## Self-Review 紀錄

- **Spec coverage**：§2 皮層架構→T1；§3.1 清單頁→T3+T4；§3.2 詳情頁→T5+T6；§3.3 彈窗→T1（scope 內自動）＋T6 Step 9（append-to-body 個案）；§4 dark→T1（變數）＋T7（實測）；§6 測試→各 task 內建＋T7。年資 util→T2。「待離職顯示預定日」spec 項：**現行 `getEmployeeStatus` 已輸出 `待離職・YYYY-MM-DD`，無需改動**（勘誤：spec §3.1 該項於現況已成立）。
- **Placeholder scan**：無 TBD/TODO；所有程式碼步驟含完整 code。
- **Type consistency**：`tenureLabel(emp, todayIso?)` T2 定義＝T4 消費；`canFix`/`fix-salary` T6 內部自洽；`openEdit(row, tab?)` 預設 `'basic'` 向後相容既有兩處呼叫（ListView `openEdit(row)`、DetailView `openEdit(employee.value)`）。
