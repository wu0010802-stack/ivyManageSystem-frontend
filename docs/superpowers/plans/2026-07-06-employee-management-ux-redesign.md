# 員工管理 UX 改版實作計畫（詳情頁路由化 + 表單統一）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 員工詳情從 8-tab 彈窗升級為獨立路由頁 `/employees/:id`，新增/編輯表單統一（新增補薪資 tab），並修齊 12 項 UX 體檢發現。

**Architecture:** 純前端改版。`EmployeeView.vue`（1670 行）拆為 `EmployeeListView`（清單）+ `EmployeeDetailView`（路由頁，左 sticky 摘要欄 + 右單頁區塊）+ `EmployeeFormDialog`（統一表單彈窗）。資料層新增 `useEmployeeDetail` composable（主資料 + 子資源並行載入，不依賴清單 store）。後端零改動。

**Tech Stack:** Vue 3 `<script setup lang="ts">` + Element Plus（unplugin 自動匯入元件）+ Pinia + vue-router（hash 模式）+ Vitest。

**Spec:** `docs/superpowers/specs/2026-07-06-employee-management-ux-redesign-design.md`

## Global Constraints

- **TS-only**：業務碼一律 TypeScript，新 SFC 用 `<script setup lang="ts">`；禁 `: any`/`as any`，用 `: unknown` + narrow。
- **後端零改動**：不動 ivy-backend、不跑 OpenAPI codegen（`DELETE /employees/{employee_id}` 已在 schema.d.ts）。
- **Commit 紀律**：Conventional Commits 繁體中文；一 commit 一事；**一律 path 限定 `git commit -m "..." -- <paths>`，嚴禁裸 commit / `-a`**（共用 checkout 有平行 session 的 staged/WIP 檔，裸 commit 會掃走別人的東西）。
- **既有測試斷言不可刪**：搬家可以，消失不行。
- Element Plus 元件模板內直接用（auto-import）；script 只需 import 型別、locale、icon。
- 針對性測試：`npx vitest run <測試檔路徑>`；全套：`npm test`。
- 若在 git worktree 執行：FE worktree 的 `node_modules` **不可 symlink**（vite/vitest 會壞），須在 worktree 內 `npm ci`。預設直接在主 checkout 工作 + path 限定 commit。
- 手動驗證需要 dev stack 時：`start.sh` 由**使用者**在自己終端跑，Claude 不可用任何工具執行它。dev 登入 admin/ivytest123。

---

### Task 1: 全站 Element Plus 中文 locale（修「No Data」）

**Files:**
- Modify: `src/App.vue`（template 根部 + script import）
- Test: `tests/unit/App.test.js`（既有檔案，加一個 test case）

**Interfaces:**
- Consumes: `element-plus/es/locale/lang/zh-tw`
- Produces: 全站 el-table 空狀態、日期選擇器等內建文案變繁中；後續所有 Task 的空表格顯示「暫無資料」。

- [ ] **Step 1: 讀既有測試，寫失敗測試**

先 `Read tests/unit/App.test.js` 了解它怎麼 mount App（沿用其既有 mock/helper），然後加：

```js
import { ElConfigProvider } from 'element-plus'

it('以 ElConfigProvider 提供 zh-tw locale（空表格顯示「暫無資料」而非 No Data）', () => {
  const wrapper = mountApp() // ← 沿用該檔既有的 mount 方式/helper 名稱
  const provider = wrapper.findComponent(ElConfigProvider)
  expect(provider.exists()).toBe(true)
  expect(provider.props('locale').name).toBe('zh-tw')
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/unit/App.test.js`
Expected: FAIL（`provider.exists()` 為 false）

- [ ] **Step 3: 實作**

`src/App.vue` script 加 import：

```ts
import zhTw from 'element-plus/es/locale/lang/zh-tw'
```

template 中 `<ErrorBoundary variant="admin">` 的直接內容包一層 provider（進度條/loading overlay 不必包）：

```html
<ErrorBoundary variant="admin">
  <el-config-provider :locale="zhTw">
    <RouterView v-if="isPortalRoute || isLoginPage || isPublicRoute || isBareRoute" />
    <AdminLayout v-else />
  </el-config-provider>
</ErrorBoundary>
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/unit/App.test.js`
Expected: PASS（含既有 case 全綠）

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ivy-frontend
git add src/App.vue tests/unit/App.test.js
git commit -m "fix: 全站 Element Plus 掛 zh-tw locale，空狀態改繁中" -- src/App.vue tests/unit/App.test.js
```

---

### Task 2: 員工顯示純函式工具（狀態/薪資遮罩/標準薪）

**Files:**
- Create: `src/utils/employeeDisplay.ts`
- Test: `tests/unit/utils/employeeDisplay.test.ts`（目錄不存在則建立）
- Modify: `src/views/EmployeeView.vue`（僅把 `statusKeyOf`/`getEmployeeStatus`/`detectRole`/`standardSalaryFor` 改為 import，行為零變更）

**Interfaces:**
- Consumes: `@/utils/format` 的 `todayISO`；`@/constants/employee` 的 `TITLE_TO_GRADE`、`POSITION_SALARY_KEY`
- Produces（後續 Task 4/6/7/8 依賴的精確簽名）:
  - `type EmployeeStatusKey = 'active' | 'pending' | 'resigned'`
  - `type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined`
  - `statusKeyOf(emp: Record<string, unknown>): EmployeeStatusKey`
  - `getEmployeeStatus(emp: Record<string, unknown>): { label: string; type: ElTagType }`
  - `maskedMoney(v: unknown): string` — null/undefined→'無檢視權限'、NaN→'—'、數字→toLocaleString
  - `insuranceLevelDisplay(v: unknown): string` — null/undefined→'無檢視權限'、0→'未設定'、其餘 toLocaleString
  - `pensionSelfRatePct(v: unknown): string` — 0.06→'6.0%'
  - `bankInfoDisplay(emp: Record<string, unknown>): string`
  - `detectRole(position: string | null | undefined): 'head' | 'assistant' | null`
  - `standardSalaryFor(emp: Record<string, unknown>, cfg: Record<string, number> | null): number | null`

- [ ] **Step 1: 寫失敗測試**

`tests/unit/utils/employeeDisplay.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import {
  statusKeyOf, getEmployeeStatus, maskedMoney, insuranceLevelDisplay,
  pensionSelfRatePct, bankInfoDisplay, detectRole, standardSalaryFor,
} from '@/utils/employeeDisplay'

describe('statusKeyOf / getEmployeeStatus', () => {
  it('is_active=false → resigned', () => {
    expect(statusKeyOf({ is_active: false })).toBe('resigned')
    expect(getEmployeeStatus({ is_active: false })).toEqual({ label: '已離職', type: 'info' })
  })
  it('resign_date 在未來 → pending（標籤帶日期）', () => {
    expect(statusKeyOf({ is_active: true, resign_date: '2999-12-31' })).toBe('pending')
    expect(getEmployeeStatus({ is_active: true, resign_date: '2999-12-31' }).label).toBe('待離職・2999-12-31')
  })
  it('在職', () => {
    expect(statusKeyOf({ is_active: true })).toBe('active')
  })
})

describe('薪資遮罩顯示（後端 role/self 遮罩回 null，嚴禁顯示成 0）', () => {
  it('null/undefined → 無檢視權限', () => {
    expect(maskedMoney(null)).toBe('無檢視權限')
    expect(maskedMoney(undefined)).toBe('無檢視權限')
    expect(insuranceLevelDisplay(null)).toBe('無檢視權限')
  })
  it('數字格式化', () => {
    expect(maskedMoney(45300)).toBe('45,300')
    expect(maskedMoney(0)).toBe('0')
  })
  it('投保級距 0 → 未設定', () => {
    expect(insuranceLevelDisplay(0)).toBe('未設定')
    expect(insuranceLevelDisplay(45300)).toBe('45,300')
  })
  it('非數字 → —', () => {
    expect(maskedMoney('abc')).toBe('—')
  })
  it('勞退自提百分比', () => {
    expect(pensionSelfRatePct(0.06)).toBe('6.0%')
    expect(pensionSelfRatePct(null)).toBe('0.0%')
  })
  it('銀行資訊：全空 → —；有值組合顯示', () => {
    expect(bankInfoDisplay({})).toBe('—')
    expect(bankInfoDisplay({ bank_code: '822', bank_account: '123', bank_account_name: '王' }))
      .toBe('822 - 123（王）')
    expect(bankInfoDisplay({ bank_code: '822', bank_account: '123' })).toBe('822 - 123')
  })
})

describe('detectRole / standardSalaryFor（自 EmployeeView 搬出，行為不變）', () => {
  it('班導/副班導判定', () => {
    expect(detectRole('班導')).toBe('head')
    expect(detectRole('副班導')).toBe('assistant')
    expect(detectRole('廚工')).toBeNull()
    expect(detectRole(null)).toBeNull()
  })
  it('依 role+grade 查 head_teacher_a', () => {
    const cfg = { head_teacher_a: 40000 }
    expect(standardSalaryFor({ position: '班導', bonus_grade: 'A' }, cfg)).toBe(40000)
  })
  it('cfg 為 null → null', () => {
    expect(standardSalaryFor({ position: '班導', bonus_grade: 'A' }, null)).toBeNull()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/unit/utils/employeeDisplay.test.ts`
Expected: FAIL（模組不存在）

- [ ] **Step 3: 實作 `src/utils/employeeDisplay.ts`**

```ts
import { todayISO } from '@/utils/format'
import { TITLE_TO_GRADE, POSITION_SALARY_KEY } from '@/constants/employee'

export type EmployeeStatusKey = 'active' | 'pending' | 'resigned'
export type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined

/** 員工狀態單一來源（自 EmployeeView.vue 搬出，邏輯不變） */
export const statusKeyOf = (emp: Record<string, unknown>): EmployeeStatusKey => {
  if (!emp.is_active) return 'resigned'
  if (emp.resign_date && (emp.resign_date as string) > todayISO()) return 'pending'
  return 'active'
}

export const getEmployeeStatus = (emp: Record<string, unknown>): { label: string; type: ElTagType } => {
  switch (statusKeyOf(emp)) {
    case 'resigned': return { label: '已離職', type: 'info' }
    case 'pending': return { label: `待離職・${emp.resign_date}`, type: 'warning' }
    default: return { label: '在職', type: 'success' }
  }
}

/** 薪資金額顯示：後端依 role/self 遮罩回 null → 顯示無檢視權限，嚴禁 Number(null)→0 */
export const maskedMoney = (v: unknown): string => {
  if (v === null || v === undefined) return '無檢視權限'
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString()
}

export const insuranceLevelDisplay = (v: unknown): string => {
  if (v === null || v === undefined) return '無檢視權限'
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  if (n === 0) return '未設定'
  return n.toLocaleString()
}

export const pensionSelfRatePct = (v: unknown): string =>
  `${((typeof v === 'number' ? v : 0) * 100).toFixed(1)}%`

export const bankInfoDisplay = (emp: Record<string, unknown>): string => {
  const code = (emp.bank_code as string) || ''
  const account = (emp.bank_account as string) || ''
  if (!code && !account) return '—'
  const name = (emp.bank_account_name as string) || ''
  return `${code} - ${account}${name ? `（${name}）` : ''}`
}

/** 職位 → 導師角色（自 EmployeeView.vue 搬出，邏輯不變） */
export const detectRole = (position: string | null | undefined): 'head' | 'assistant' | null => {
  if (!position) return null
  if (position.includes('班導') && !position.includes('副')) return 'head'
  if (position.includes('副班導')) return 'assistant'
  return null
}

/** 查某員工對應的標準薪俸（自 EmployeeView.vue standardSalaryFor 搬出，邏輯不變） */
export const standardSalaryFor = (
  emp: Record<string, unknown>,
  cfg: Record<string, number> | null,
): number | null => {
  if (!cfg || !emp) return null
  const pos = (emp.position as string) || ''
  const role = detectRole(pos)
  if (role) {
    const titleName = (emp.job_title_name as string) || (emp.title as string) || ''
    const grade = ((emp.bonus_grade as string) || (TITLE_TO_GRADE as Record<string, string>)[titleName] || '').toLowerCase()
    if (grade) {
      const key = `${role === 'head' ? 'head_teacher' : 'assistant_teacher'}_${grade}`
      return cfg[key] ?? null
    }
    return null
  }
  const key = (POSITION_SALARY_KEY as Record<string, string>)[pos]
  return key ? (cfg[key] ?? null) : null
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/unit/utils/employeeDisplay.test.ts`
Expected: PASS

- [ ] **Step 5: EmployeeView.vue 改用 import（去重複）**

刪除 `src/views/EmployeeView.vue` 內的本地定義：`detectRole`（L95-100）、`statusKeyOf` + `StatusKey` type（L344-349）、`getEmployeeStatus`（L351-357）、`standardSalaryFor`（L310-326）、`ElTagType`（L328），改為：

```ts
import { statusKeyOf, getEmployeeStatus, detectRole, standardSalaryFor, type ElTagType } from '@/utils/employeeDisplay'
```

注意 `titleToGrade`（L102-107，依賴 configStore）留在原地不搬。

- [ ] **Step 6: 跑既有測試確認零行為變更**

Run: `npx vitest run tests/unit/views/EmployeeView.test.js tests/unit/utils/employeeDisplay.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd ~/Desktop/ivy-frontend
git add src/utils/employeeDisplay.ts tests/unit/utils/employeeDisplay.test.ts src/views/EmployeeView.vue
git commit -m "refactor: 抽出員工狀態/薪資遮罩顯示純函式（null≠0、投保0=未設定）" -- src/utils/employeeDisplay.ts tests/unit/utils/employeeDisplay.test.ts src/views/EmployeeView.vue
```

---

### Task 3: useEmployeeDetail composable（詳情頁資料層）

**Files:**
- Create: `src/composables/useEmployeeDetail.ts`
- Test: `tests/unit/composables/useEmployeeDetail.test.ts`

**Interfaces:**
- Consumes: `@/api/employees` 的 `getEmployee/listEmployeeEducations/listEmployeeCertificates/listEmployeeContracts/listEmployeeClassHistory`
- Produces（Task 6 依賴）:
  ```ts
  useEmployeeDetail(employeeId: Ref<number>): {
    employee: Ref<Record<string, unknown> | null>
    educations: Ref<Record<string, unknown>[]>
    certificates: Ref<Record<string, unknown>[]>
    contracts: Ref<Record<string, unknown>[]>
    classHistory: Ref<ClassHistoryRow[]>
    loading: Ref<boolean>
    error: Ref<string | null>          // 主資料載入失敗才設；子資源失敗不擋頁
    subResourceErrors: Ref<number>     // 子資源失敗數（UI 顯示部分載入警示用）
    load: () => Promise<void>          // 全量重載（id 變更時自動觸發）
    reloadCore: () => Promise<void>    // 只重載主資料（編輯儲存後用）
    reloadEducations: () => Promise<void>
    reloadCertificates: () => Promise<void>
    reloadContracts: () => Promise<void>
  }
  ```

- [ ] **Step 1: 寫失敗測試**

⚠ mock 的 response 形狀**必抄真實後端契約**：`getEmployee` 回 `{ data: {...員工物件} }`、`listEmployeeClassHistory` 回 `{ data: { rows: [...] } }`（是 `rows` 包一層，不是裸陣列——過去憑感覺 mock 裸陣列讓 unwrap bug 假綠過）。

`tests/unit/composables/useEmployeeDetail.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'

const mockGetEmployee = vi.fn()
const mockListEdu = vi.fn()
const mockListCert = vi.fn()
const mockListContract = vi.fn()
const mockListClassHistory = vi.fn()

vi.mock('@/api/employees', () => ({
  getEmployee: (...a: unknown[]) => mockGetEmployee(...a),
  listEmployeeEducations: (...a: unknown[]) => mockListEdu(...a),
  listEmployeeCertificates: (...a: unknown[]) => mockListCert(...a),
  listEmployeeContracts: (...a: unknown[]) => mockListContract(...a),
  listEmployeeClassHistory: (...a: unknown[]) => mockListClassHistory(...a),
}))

import { useEmployeeDetail } from '@/composables/useEmployeeDetail'

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.clearAllMocks()
  // 真實契約形狀：employee 物件直接在 data；class-history 是 { rows: [...] }
  mockGetEmployee.mockResolvedValue({ data: { id: 1, name: '呂麗珍', base_salary: 45300 } })
  mockListEdu.mockResolvedValue({ data: [{ id: 10, school_name: '靜宜大學' }] })
  mockListCert.mockResolvedValue({ data: [] })
  mockListContract.mockResolvedValue({ data: [] })
  mockListClassHistory.mockResolvedValue({ data: { rows: [{ school_year: 114, semester: 1 }] } })
})

describe('useEmployeeDetail', () => {
  it('immediate 載入主資料與四子資源（深連結不依賴清單 store）', async () => {
    const id = ref(1)
    const d = useEmployeeDetail(id)
    await flush(); await nextTick()
    expect(mockGetEmployee).toHaveBeenCalledWith(1)
    expect(d.employee.value).toMatchObject({ id: 1, name: '呂麗珍' })
    expect(d.educations.value).toHaveLength(1)
    expect(d.classHistory.value).toEqual([{ school_year: 114, semester: 1 }])
    expect(d.loading.value).toBe(false)
    expect(d.error.value).toBeNull()
  })

  it('主資料失敗 → error 設定、不打子資源', async () => {
    mockGetEmployee.mockRejectedValueOnce(new Error('404'))
    const d = useEmployeeDetail(ref(999))
    await flush(); await nextTick()
    expect(d.error.value).toBe('載入員工資料失敗')
    expect(d.employee.value).toBeNull()
    expect(mockListEdu).not.toHaveBeenCalled()
    expect(d.loading.value).toBe(false)
  })

  it('子資源單項失敗 → 不設 error、subResourceErrors 計數', async () => {
    mockListCert.mockRejectedValueOnce(new Error('boom'))
    const d = useEmployeeDetail(ref(1))
    await flush(); await nextTick()
    expect(d.error.value).toBeNull()
    expect(d.subResourceErrors.value).toBe(1)
    expect(d.educations.value).toHaveLength(1)
  })

  it('id 變更 → 自動全量重載', async () => {
    const id = ref(1)
    useEmployeeDetail(id)
    await flush()
    id.value = 2
    await flush(); await nextTick()
    expect(mockGetEmployee).toHaveBeenLastCalledWith(2)
  })

  it('reloadCore 只重打主資料', async () => {
    const d = useEmployeeDetail(ref(1))
    await flush()
    vi.clearAllMocks()
    mockGetEmployee.mockResolvedValue({ data: { id: 1, name: '呂麗珍（改）' } })
    await d.reloadCore()
    expect(mockGetEmployee).toHaveBeenCalledTimes(1)
    expect(mockListEdu).not.toHaveBeenCalled()
    expect(d.employee.value).toMatchObject({ name: '呂麗珍（改）' })
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/unit/composables/useEmployeeDetail.test.ts`
Expected: FAIL（模組不存在）

- [ ] **Step 3: 實作 `src/composables/useEmployeeDetail.ts`**

```ts
import { ref, watch, type Ref } from 'vue'
import {
  getEmployee, listEmployeeEducations, listEmployeeCertificates,
  listEmployeeContracts, listEmployeeClassHistory,
} from '@/api/employees'
import type { ClassHistoryRow } from '@/utils/classHistory'

/**
 * 員工詳情頁資料層：主資料必須成功（失敗 → error 擋頁）；
 * 四個子資源並行載入、單項失敗不擋頁（subResourceErrors 供 UI 顯示部分載入警示）。
 * 深連結直接進 /employees/:id 時不經清單 store，自行打 API。
 */
export function useEmployeeDetail(employeeId: Ref<number>) {
  const employee = ref<Record<string, unknown> | null>(null)
  const educations = ref<Record<string, unknown>[]>([])
  const certificates = ref<Record<string, unknown>[]>([])
  const contracts = ref<Record<string, unknown>[]>([])
  const classHistory = ref<ClassHistoryRow[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const subResourceErrors = ref(0)

  const reloadCore = async () => {
    employee.value = (await getEmployee(employeeId.value)).data as Record<string, unknown>
  }
  const reloadEducations = async () => {
    educations.value = (await listEmployeeEducations(employeeId.value)).data as Record<string, unknown>[]
  }
  const reloadCertificates = async () => {
    certificates.value = (await listEmployeeCertificates(employeeId.value)).data as Record<string, unknown>[]
  }
  const reloadContracts = async () => {
    contracts.value = (await listEmployeeContracts(employeeId.value)).data as Record<string, unknown>[]
  }
  const reloadClassHistory = async () => {
    classHistory.value = ((await listEmployeeClassHistory(employeeId.value)).data.rows ?? []) as ClassHistoryRow[]
  }

  const load = async () => {
    loading.value = true
    error.value = null
    subResourceErrors.value = 0
    employee.value = null
    try {
      await reloadCore()
    } catch {
      error.value = '載入員工資料失敗'
      loading.value = false
      return
    }
    const results = await Promise.allSettled([
      reloadEducations(), reloadCertificates(), reloadContracts(), reloadClassHistory(),
    ])
    subResourceErrors.value = results.filter((r) => r.status === 'rejected').length
    loading.value = false
  }

  watch(employeeId, load, { immediate: true })

  return {
    employee, educations, certificates, contracts, classHistory,
    loading, error, subResourceErrors,
    load, reloadCore, reloadEducations, reloadCertificates, reloadContracts,
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/unit/composables/useEmployeeDetail.test.ts`
Expected: PASS（5 case 全綠）

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ivy-frontend
git add src/composables/useEmployeeDetail.ts tests/unit/composables/useEmployeeDetail.test.ts
git commit -m "feat: useEmployeeDetail composable（詳情頁主資料+子資源並行載入）" -- src/composables/useEmployeeDetail.ts tests/unit/composables/useEmployeeDetail.test.ts
```

---

### Task 4: 詳情區塊元件（Basic / Job / Salary）

**Files:**
- Create: `src/components/employee/detail/BasicSection.vue`
- Create: `src/components/employee/detail/JobSection.vue`
- Create: `src/components/employee/detail/SalarySection.vue`
- Test: `tests/unit/components/employee/SalarySection.test.ts`（目錄不存在則建立）

**Interfaces:**
- Consumes: Task 2 的 `maskedMoney/insuranceLevelDisplay/pensionSelfRatePct/bankInfoDisplay`
- Produces（Task 6 依賴）：三個純顯示元件
  - `BasicSection` props: `{ employee: Record<string, unknown> }`
  - `JobSection` props: `{ employee: Record<string, unknown> }`
  - `SalarySection` props: `{ employee: Record<string, unknown>; standardSalary: number | null }`

- [ ] **Step 1: 寫 SalarySection 失敗測試（顯示規範核心）**

`tests/unit/components/employee/SalarySection.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SalarySection from '@/components/employee/detail/SalarySection.vue'

const mountWith = (employee: Record<string, unknown>, standardSalary: number | null = null) =>
  mount(SalarySection, { props: { employee, standardSalary } })

describe('SalarySection 顯示規範', () => {
  it('正職：顯示底薪、不渲染時薪列', () => {
    const w = mountWith({ employee_type: 'regular', base_salary: 45300, hourly_rate: 0, insurance_salary_level: 45300 })
    expect(w.text()).toContain('45,300')
    expect(w.text()).not.toContain('時薪')
  })
  it('時薪制：顯示時薪、不渲染底薪列', () => {
    const w = mountWith({ employee_type: 'hourly', base_salary: 0, hourly_rate: 200 })
    expect(w.text()).toContain('時薪')
    expect(w.text()).not.toContain('底薪')
  })
  it('後端遮罩（null）→ 顯示無檢視權限，不得顯示 0 或 NaN', () => {
    const w = mountWith({ employee_type: 'regular', base_salary: null, insurance_salary_level: null })
    expect(w.text()).toContain('無檢視權限')
    expect(w.text()).not.toContain('NaN')
  })
  it('投保級距 0 → 未設定', () => {
    const w = mountWith({ employee_type: 'regular', base_salary: 30000, insurance_salary_level: 0 })
    expect(w.text()).toContain('未設定')
  })
  it('特殊旗標只列啟用者', () => {
    const w = mountWith({ employee_type: 'regular', base_salary: 30000, health_exempt: true, no_employment_insurance: false })
    expect(w.text()).toContain('健保豁免')
    expect(w.text()).not.toContain('免就保')
  })
  it('標準薪比較：高於標準顯示 tag', () => {
    const w = mountWith({ employee_type: 'regular', base_salary: 50000 }, 40000)
    expect(w.text()).toContain('高於標準')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/unit/components/employee/SalarySection.test.ts`
Expected: FAIL（元件不存在）

- [ ] **Step 3: 實作三個元件**

`src/components/employee/detail/SalarySection.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { maskedMoney, insuranceLevelDisplay, pensionSelfRatePct, bankInfoDisplay } from '@/utils/employeeDisplay'

const props = withDefaults(defineProps<{
  employee: Record<string, unknown>
  standardSalary?: number | null
}>(), { standardSalary: null })

const isHourly = computed(() => props.employee.employee_type === 'hourly')
const baseSalaryNum = computed(() => {
  const v = props.employee.base_salary
  return v === null || v === undefined ? null : Number(v)
})

const FLAG_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['no_employment_insurance', '免就保'],
  ['health_exempt', '健保豁免'],
  ['skip_payroll_bonuses', '不發獎金'],
  ['skip_payroll_transfer', '不入轉帳名冊'],
  ['unreported_for_tax', '不入稅報'],
  ['bypass_standard_base', '個人合約底薪'],
]
const activeFlags = computed(() =>
  FLAG_LABELS.filter(([key]) => Boolean(props.employee[key])).map(([, label]) => label)
)

const hasSplitInsurance = computed(() =>
  props.employee.labor_insured_salary != null
  || props.employee.health_insured_salary != null
  || props.employee.pension_insured_salary != null
)
</script>

<template>
  <el-descriptions :column="2" border>
    <el-descriptions-item v-if="!isHourly" label="底薪">
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
    </el-descriptions-item>
    <el-descriptions-item v-else label="時薪">{{ maskedMoney(employee.hourly_rate) }}</el-descriptions-item>
    <el-descriptions-item label="投保級距">{{ insuranceLevelDisplay(employee.insurance_salary_level) }}</el-descriptions-item>
    <el-descriptions-item label="勞退自提">{{ pensionSelfRatePct(employee.pension_self_rate) }}</el-descriptions-item>
    <el-descriptions-item label="加保生效日">{{ employee.insurance_effective_date || '—' }}</el-descriptions-item>
    <el-descriptions-item label="銀行資訊" :span="2">{{ bankInfoDisplay(employee) }}</el-descriptions-item>
    <el-descriptions-item v-if="hasSplitInsurance" label="分項投保" :span="2">
      勞保 {{ maskedMoney(employee.labor_insured_salary ?? employee.insurance_salary_level) }}
      ・健保 {{ maskedMoney(employee.health_insured_salary ?? employee.insurance_salary_level) }}
      ・勞退 {{ maskedMoney(employee.pension_insured_salary ?? employee.insurance_salary_level) }}
    </el-descriptions-item>
    <el-descriptions-item v-if="activeFlags.length" label="特殊旗標" :span="2">
      <el-tag v-for="f in activeFlags" :key="f" size="small" type="warning" style="margin-right:6px">{{ f }}</el-tag>
    </el-descriptions-item>
  </el-descriptions>
</template>

<style scoped>
.std-hint { color: var(--text-tertiary); font-size: 12px; margin-left: 8px; }
</style>
```

`src/components/employee/detail/BasicSection.vue`（自 EmployeeView.vue L1189-1199 個人資料 tab 搬遷 + 補 Email 欄）：

```vue
<script setup lang="ts">
defineProps<{ employee: Record<string, unknown> }>()
</script>

<template>
  <el-descriptions :column="2" border>
    <el-descriptions-item label="聯絡電話">{{ employee.phone || '—' }}</el-descriptions-item>
    <el-descriptions-item label="生日">{{ employee.birthday || '—' }}</el-descriptions-item>
    <el-descriptions-item label="身分證">{{ employee.id_number || '—' }}</el-descriptions-item>
    <el-descriptions-item label="眷屬人數">{{ employee.dependents ?? '—' }}</el-descriptions-item>
    <el-descriptions-item label="Email">{{ employee.email || '—' }}</el-descriptions-item>
    <el-descriptions-item label="性別">{{ employee.gender || '—' }}</el-descriptions-item>
    <el-descriptions-item label="通訊地址" :span="2">{{ employee.address || '—' }}</el-descriptions-item>
    <el-descriptions-item label="緊急聯絡人">{{ employee.emergency_contact_name || '—' }}</el-descriptions-item>
    <el-descriptions-item label="緊急聯絡電話">{{ employee.emergency_contact_phone || '—' }}</el-descriptions-item>
  </el-descriptions>
</template>
```

`src/components/employee/detail/JobSection.vue`（自 EmployeeView.vue L1202-1216 職務資料 tab 搬遷 + 補教保身分）：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { EMPLOYEE_TYPE_OPTIONS } from '@/constants/employee'

const props = defineProps<{ employee: Record<string, unknown> }>()

const employeeTypeLabel = computed(() => {
  const opt = EMPLOYEE_TYPE_OPTIONS.find((o) => o.value === props.employee.employee_type)
  return opt ? opt.label : ((props.employee.employee_type as string) || '—')
})
const STAFF_ROLE_LABELS: Record<string, string> = {
  teacher_certified: '幼教師（持幼教師證）', educare_certified: '教保員（持教保員證）',
  assistant_educare: '助理教保員', office: '行政人員', kitchen: '廚工', driver: '司機', other: '其他',
}
const staffRoleLabel = computed(() => {
  const v = props.employee.staff_role_category as string
  return v ? (STAFF_ROLE_LABELS[v] || v) : '—'
})
</script>

<template>
  <el-descriptions :column="2" border>
    <el-descriptions-item label="員工類型">{{ employeeTypeLabel }}</el-descriptions-item>
    <el-descriptions-item label="職位">{{ employee.position || '—' }}</el-descriptions-item>
    <el-descriptions-item label="到職日">{{ employee.hire_date || '—' }}</el-descriptions-item>
    <el-descriptions-item label="試用期結束">{{ employee.probation_end_date || '—' }}</el-descriptions-item>
    <el-descriptions-item label="主管職">
      <el-tag v-if="employee.supervisor_role" size="small">{{ employee.supervisor_role }}</el-tag>
      <span v-else>—</span>
    </el-descriptions-item>
    <el-descriptions-item label="班級">{{ employee.classroom_name || '—' }}</el-descriptions-item>
    <el-descriptions-item label="教保身分別">{{ staffRoleLabel }}</el-descriptions-item>
    <el-descriptions-item label="教師/教保員證號">
      {{ employee.teacher_cert_no || '—' }}<span v-if="employee.teacher_cert_type">（{{ employee.teacher_cert_type }}）</span>
    </el-descriptions-item>
    <el-descriptions-item v-if="employee.resign_date" label="離職日">{{ employee.resign_date }}</el-descriptions-item>
    <el-descriptions-item v-if="employee.resign_reason" label="離職原因">{{ employee.resign_reason }}</el-descriptions-item>
  </el-descriptions>
</template>
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/unit/components/employee/SalarySection.test.ts`
Expected: PASS（6 case 全綠）

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ivy-frontend
git add src/components/employee/detail/ tests/unit/components/employee/SalarySection.test.ts
git commit -m "feat: 詳情頁 Basic/Job/Salary 區塊元件（薪資遮罩與類型分流顯示）" -- src/components/employee/detail/ tests/unit/components/employee/SalarySection.test.ts
```

---

### Task 5: 詳情區塊元件（Credentials / Attendance / ClassHistory）

**Files:**
- Create: `src/components/employee/detail/CredentialsSection.vue`（學歷/證照/合約三子表 + 共用子對話框）
- Create: `src/components/employee/detail/AttendanceSection.vue`
- Create: `src/components/employee/detail/ClassHistorySection.vue`

**Interfaces:**
- Consumes: `@/api/employees` 子資源 CRUD、`@/api/attendance`、Task 2 utils
- Produces（Task 6 依賴）:
  - `CredentialsSection` props: `{ employeeId: number; educations/certificates/contracts: Record<string, unknown>[] }`；emits: `(e: 'reload', kind: 'education' | 'certificate' | 'contract')`
  - `AttendanceSection` props: `{ employee: Record<string, unknown> }`（內部自管月份與載入）
  - `ClassHistorySection` props: `{ rows: ClassHistoryRow[]; loading: boolean }`

本 Task 是**行為保持的模板/邏輯搬遷**，靠既有測試 + Task 9 整合驗證把關，不另寫新單元測試（子對話框驗證邏輯已在後端與既有測試覆蓋）。

- [ ] **Step 1: 實作 CredentialsSection**

自 `src/views/EmployeeView.vue` 搬遷以下內容組成 `CredentialsSection.vue`：
- script：`SubDialogKind`/`subDialog`/`subDialogTitle`（L664-674）、六個 `open*Create/Edit`（L676-714）、`submitSub`（L716-748，`currentDetail.value.id` 改 `props.employeeId`；每種 kind 儲存成功後 `emit('reload', kind)` 取代原 `fetch*()`）、`confirmDeleteSub`（L750-763，同樣改 employeeId + emit）、`EduForm/CertForm/ContractForm` interface 與 `subEduForm/subCertForm/subContractForm` computed（L891-896）
- template：學歷 tab 內容（L1249-1276）、證照 tab 內容（L1279-1307）、合約 tab 內容（L1310-1342）三段 `el-table` + 新增按鈕，以及共用子對話框整段（L1418-1518）

元件骨架：

```vue
<script setup lang="ts">
import { computed, reactive } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createEmployeeEducation, updateEmployeeEducation, deleteEmployeeEducation,
  createEmployeeCertificate, updateEmployeeCertificate, deleteEmployeeCertificate,
  createEmployeeContract, updateEmployeeContract, deleteEmployeeContract,
} from '@/api/employees'
import { DEGREE_OPTIONS, CONTRACT_TYPE_OPTIONS } from '@/constants/employee'
import EmptyState from '@/components/common/EmptyState.vue'
import type { ApiBody } from '@/api/_generated/typed'

const props = defineProps<{
  employeeId: number
  educations: Record<string, unknown>[]
  certificates: Record<string, unknown>[]
  contracts: Record<string, unknown>[]
}>()
const emit = defineEmits<{ (e: 'reload', kind: 'education' | 'certificate' | 'contract'): void }>()

// …（搬遷內容如上；submitSub 成功路徑改為 emit('reload', subDialog.kind)）
</script>

<template>
  <div class="cred-block">
    <div class="cred-header"><h4>學歷</h4><el-button type="primary" size="small" @click="openEduCreate"><el-icon><Plus /></el-icon> 新增學歷</el-button></div>
    <!-- 學歷 el-table（搬遷，:data="educations"） -->
    <div class="cred-header"><h4>證照</h4><el-button type="primary" size="small" @click="openCertCreate"><el-icon><Plus /></el-icon> 新增證照</el-button></div>
    <!-- 證照 el-table（搬遷，:data="certificates"） -->
    <div class="cred-header"><h4>合約</h4><el-button type="primary" size="small" @click="openContractCreate"><el-icon><Plus /></el-icon> 新增合約</el-button></div>
    <!-- 合約 el-table（搬遷，:data="contracts"） -->
    <!-- 共用子對話框（搬遷整段 el-dialog，含 footer） -->
  </div>
</template>

<style scoped>
.cred-header { display: flex; justify-content: space-between; align-items: center; margin: 16px 0 8px; }
.cred-header h4 { margin: 0; font-size: 14px; }
.cred-block > .cred-header:first-child { margin-top: 0; }
</style>
```

- [ ] **Step 2: 實作 AttendanceSection**

自 EmployeeView.vue 搬遷：`attendanceRecords`/`attendanceMonth`（L530-531）、`fetchAttendance`（L534-547，`currentDetail.value.id` 改 `props.employee.id`）、`getAttendanceStatusType`（L549-553）、`editAttendance`（L555-595，`currentDetail.value.employee_id/name` 改 `props.employee.employee_id/name`）、`deleteAttendance`（L597-609）；template 搬出勤 tab 內容（L1346-1372）。掛載時載入當月：

```ts
import { onMounted } from 'vue'
// …搬遷的 state 與函式…
onMounted(fetchAttendance)
```

- [ ] **Step 3: 實作 ClassHistorySection**

自 EmployeeView.vue 搬遷班級歷程 tab 內容（L1377-1410 的 el-table 與 el-empty）與 `formatSemester/roleLabel/formatCoTeachers/formatHeadcount/formatNetChange` imports、`.net-up/.net-down/.net-flat/.net-none` scoped 樣式（L1639-1642）：

```vue
<script setup lang="ts">
import { formatSemester, roleLabel, formatCoTeachers, formatHeadcount, formatNetChange, type ClassHistoryRow } from '@/utils/classHistory'
defineProps<{ rows: ClassHistoryRow[]; loading: boolean }>()
</script>

<template>
  <el-table v-if="rows.length" :data="rows" style="width:100%" size="small">
    <!-- 六欄搬遷：學年/學期、班級（年級）、角色、同班搭檔、期初→期末、淨變化 -->
  </el-table>
  <el-empty v-else-if="!loading" description="尚無帶班紀錄" />
</template>
```

- [ ] **Step 4: typecheck 把關**

Run: `cd ~/Desktop/ivy-frontend && npm run typecheck`
Expected: 零錯誤（三個新元件此時尚無使用者，typecheck 仍會編譯它們）

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ivy-frontend
git add src/components/employee/detail/
git commit -m "feat: 詳情頁 Credentials/Attendance/ClassHistory 區塊元件（自 EmployeeView 搬遷）" -- src/components/employee/detail/
```

---

### Task 6: EmployeeDetailView 組頁 + 路由 + 權限 prefix

**Files:**
- Create: `src/views/EmployeeDetailView.vue`
- Modify: `src/router/index.ts`（`/employees` 路由條目後加 `:id` 路由，約 L45-49 後）
- Modify: `src/constants/permissions.ts:96`（`/employees` 規則加 `prefix: true`）
- Test: `tests/unit/constants/routePermissions.test.ts`（新檔或併入既有 constants 測試）

**Interfaces:**
- Consumes: Task 3 `useEmployeeDetail`、Task 4/5 六個 section、Task 2 `getEmployeeStatus/standardSalaryFor`、`@/api/config` `getPositionSalary`、`OffboardingModal`
- Produces: 路由 `name: 'employee-detail'`，path `/employees/:id(\d+)`，`props: true`（id 轉 number）。**編輯入口本 Task 先不接**（Task 7 完成後在 Task 8 接線），左欄先只放「辦理離職」。

- [ ] **Step 1: 寫失敗測試（權限規則守衛）**

`tests/unit/constants/routePermissions.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { ROUTE_PERMISSION_RULES } from '@/constants/permissions'

describe('員工詳情頁路由權限', () => {
  it('/employees 規則必須 prefix:true，讓 /employees/:id 繼承 EMPLOYEES_READ（default-deny 下漏掉會全員 403）', () => {
    const rule = ROUTE_PERMISSION_RULES.find((r) => r.path === '/employees')
    expect(rule).toBeDefined()
    expect(rule?.permission).toBe('EMPLOYEES_READ')
    expect(rule?.prefix).toBe(true)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/unit/constants/routePermissions.test.ts`
Expected: FAIL（`prefix` 為 undefined）

- [ ] **Step 3: 改權限規則與路由**

`src/constants/permissions.ts` L96：

```ts
  { path: '/employees', permission: 'EMPLOYEES_READ', prefix: true },
```

`src/router/index.ts` 在 `/employees` 條目（L45-49）之後插入（比照 `/students/profile/:id` 前例）：

```ts
        {
            path: '/employees/:id(\\d+)',
            name: 'employee-detail',
            component: () => import('../views/EmployeeDetailView.vue'),
            props: (route) => ({ id: Number(route.params.id) }),
            meta: { title: '員工詳情' }
        },
```

- [ ] **Step 4: 實作 `src/views/EmployeeDetailView.vue`**

```vue
<script setup lang="ts">
import { computed, ref, toRef, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, User } from '@element-plus/icons-vue'
import { useEmployeeDetail } from '@/composables/useEmployeeDetail'
import { getEmployeeStatus, standardSalaryFor } from '@/utils/employeeDisplay'
import { getPositionSalary } from '@/api/config'
import { hasPermission } from '@/utils/auth'
import { useEmployeeStore } from '@/stores/employee'
import { useIsMobile } from '@/composables/useIsMobile'
import BasicSection from '@/components/employee/detail/BasicSection.vue'
import JobSection from '@/components/employee/detail/JobSection.vue'
import SalarySection from '@/components/employee/detail/SalarySection.vue'
import CredentialsSection from '@/components/employee/detail/CredentialsSection.vue'
import AttendanceSection from '@/components/employee/detail/AttendanceSection.vue'
import ClassHistorySection from '@/components/employee/detail/ClassHistorySection.vue'
import OffboardingModal from '@/components/offboarding/OffboardingModal.vue'

const props = defineProps<{ id: number }>()
const router = useRouter()
const { isMobile } = useIsMobile()
const employeeStore = useEmployeeStore()

const detail = useEmployeeDetail(toRef(props, 'id'))
const { employee, educations, certificates, contracts, classHistory, loading, error, subResourceErrors } = detail

const canWriteEmployees = computed(() => hasPermission('EMPLOYEES_WRITE'))

// 標準薪比較（沿用清單頁的 position-salary 設定）
const positionSalaryConfig = ref<Record<string, number> | null>(null)
onMounted(async () => {
  try {
    positionSalaryConfig.value = (await getPositionSalary()).data as Record<string, number>
  } catch { /* 設定載入失敗只影響標準薪 hint，不擋頁 */ }
})
const standardSalary = computed(() =>
  employee.value ? standardSalaryFor(employee.value, positionSalaryConfig.value) : null
)

// 錨點導覽
const SECTIONS = [
  { key: 'basic', label: '基本資料' },
  { key: 'job', label: '職務・班級' },
  { key: 'salary', label: '薪資・投保' },
  { key: 'credentials', label: '學歷・證照・合約' },
  { key: 'attendance', label: '出勤紀錄' },
] as const
const scrollToSection = (key: string) => {
  document.getElementById(`emp-sec-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const goBack = () => {
  if (window.history.length > 1) router.back()
  else router.push('/employees')
}

// 辦理離職
const offboardVisible = ref(false)
const onOffboarded = async () => {
  await detail.reloadCore()
  employeeStore.fetchEmployees(true)
}

const reloadSub = (kind: 'education' | 'certificate' | 'contract') => {
  if (kind === 'education') detail.reloadEducations()
  else if (kind === 'certificate') detail.reloadCertificates()
  else detail.reloadContracts()
}
</script>

<template>
  <div class="employee-detail-page">
    <el-button link class="back-btn" @click="goBack">
      <el-icon><ArrowLeft /></el-icon> 返回員工列表
    </el-button>

    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false">
      <el-button size="small" style="margin-top:8px" @click="detail.load()">重試</el-button>
    </el-alert>
    <TableSkeletonWrapper v-else-if="loading && !employee" />

    <div v-else-if="employee" class="detail-layout" :class="{ 'is-mobile': isMobile }">
      <!-- 左欄：sticky 摘要 + 快速操作 + 錨點導覽 -->
      <aside class="detail-aside">
        <div class="avatar-placeholder"><el-icon :size="64" color="#909399"><User /></el-icon></div>
        <h3 class="emp-name">{{ employee.name || '—' }}</h3>
        <div class="emp-meta">
          <div><span class="meta-label">編號</span>{{ employee.employee_id || '—' }}</div>
          <div><span class="meta-label">職稱</span>{{ employee.job_title_name || employee.title || '—' }}</div>
          <div v-if="employee.position"><span class="meta-label">職位</span>{{ employee.position }}</div>
          <div v-if="employee.classroom_name"><span class="meta-label">班級</span>{{ employee.classroom_name }}</div>
          <div style="margin-top:12px">
            <el-tag :type="getEmployeeStatus(employee).type" size="small">{{ getEmployeeStatus(employee).label }}</el-tag>
            <el-tag v-if="employee.supervisor_role" size="small" type="warning" style="margin-left:6px">{{ employee.supervisor_role }}</el-tag>
          </div>
        </div>
        <div v-if="canWriteEmployees" class="aside-actions">
          <!-- 編輯按鈕於 Task 8 接 EmployeeFormDialog -->
          <el-button v-if="employee.is_active" type="warning" plain size="small" @click="offboardVisible = true">辦理離職</el-button>
        </div>
        <nav class="anchor-nav" aria-label="區塊導覽">
          <a v-for="s in SECTIONS" :key="s.key" class="anchor-link" @click.prevent="scrollToSection(s.key)">{{ s.label }}</a>
        </nav>
      </aside>

      <!-- 右欄：單頁區塊 -->
      <main class="detail-sections">
        <el-alert v-if="subResourceErrors > 0" type="warning" show-icon :closable="false"
          title="部分區塊載入失敗，顯示可能不完整" style="margin-bottom:12px" />
        <section :id="`emp-sec-basic`" class="detail-section">
          <h3 class="section-title">基本資料</h3>
          <BasicSection :employee="employee" />
        </section>
        <section :id="`emp-sec-job`" class="detail-section">
          <h3 class="section-title">職務・班級</h3>
          <JobSection :employee="employee" />
          <h4 class="subsection-title">班級歷程</h4>
          <ClassHistorySection :rows="classHistory" :loading="loading" />
        </section>
        <section :id="`emp-sec-salary`" class="detail-section">
          <h3 class="section-title">薪資・投保</h3>
          <SalarySection :employee="employee" :standard-salary="standardSalary" />
        </section>
        <section :id="`emp-sec-credentials`" class="detail-section">
          <h3 class="section-title">學歷・證照・合約</h3>
          <CredentialsSection
            :employee-id="id" :educations="educations" :certificates="certificates" :contracts="contracts"
            @reload="reloadSub"
          />
        </section>
        <section :id="`emp-sec-attendance`" class="detail-section">
          <h3 class="section-title">出勤紀錄</h3>
          <AttendanceSection :employee="employee" />
        </section>
      </main>
    </div>

    <OffboardingModal
      v-if="employee"
      v-model="offboardVisible"
      :employee-id="id"
      :employee-name="(employee.name as string) || ''"
      @success="onOffboarded"
    />
  </div>
</template>

<style scoped>
.back-btn { margin-bottom: 12px; }
.detail-layout { display: flex; gap: 20px; align-items: flex-start; }
.detail-aside {
  flex: 0 0 240px; position: sticky; top: 16px;
  background: var(--el-bg-color); border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px; padding: 20px 16px; text-align: center;
}
.detail-sections { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 20px; }
.detail-section { background: var(--el-bg-color); border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 16px 20px; scroll-margin-top: 12px; }
.section-title { margin: 0 0 12px; font-size: 15px; }
.subsection-title { margin: 16px 0 8px; font-size: 13px; color: var(--el-text-color-secondary); }
.avatar-placeholder { width: 96px; height: 96px; border-radius: 50%; background: var(--el-color-info-light-9); display: flex; align-items: center; justify-content: center; margin: 4px auto 12px; }
.emp-name { margin: 0 0 12px; font-size: 18px; }
.emp-meta { text-align: left; font-size: 13px; color: var(--el-text-color-regular); line-height: 1.9; padding: 0 4px; }
.emp-meta .meta-label { display: inline-block; width: 48px; color: var(--el-text-color-secondary); }
.aside-actions { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
.anchor-nav { margin-top: 16px; border-top: 1px solid var(--el-border-color-lighter); padding-top: 12px; display: flex; flex-direction: column; gap: 6px; text-align: left; }
.anchor-link { cursor: pointer; font-size: 13px; color: var(--el-text-color-regular); }
.anchor-link:hover { color: var(--el-color-primary); }

/* 手機：左欄變頂部卡片、錨點變橫向 chip */
.detail-layout.is-mobile { flex-direction: column; }
.detail-layout.is-mobile .detail-aside { position: static; flex: 0 0 auto; width: 100%; }
.detail-layout.is-mobile .anchor-nav { flex-direction: row; flex-wrap: wrap; gap: 10px; }
</style>
```

注意：`TableSkeletonWrapper` 不存在——loading 態直接用既有 `TableSkeleton`（`import TableSkeleton from '@/components/common/TableSkeleton.vue'`，`<TableSkeleton v-else-if="loading && !employee" :columns="2" />`）。上方骨架中該行以此為準。

- [ ] **Step 5: 跑測試 + typecheck**

Run: `npx vitest run tests/unit/constants/routePermissions.test.ts && npm run typecheck`
Expected: PASS + 零型別錯誤

- [ ] **Step 6: 手動驗證深連結（需 dev stack，請使用者先跑 start.sh）**

瀏覽器開 `http://localhost:5173/login#/employees/1`（用清單任一真實 id）：頁面渲染五區塊、左欄 sticky、「返回員工列表」可用；直接重新整理（深連結、store 為空）仍能載入。

- [ ] **Step 7: Commit**

```bash
cd ~/Desktop/ivy-frontend
git add src/views/EmployeeDetailView.vue src/router/index.ts src/constants/permissions.ts tests/unit/constants/routePermissions.test.ts
git commit -m "feat: 員工詳情頁路由化 /employees/:id（左摘要欄+單頁區塊+錨點導覽）" -- src/views/EmployeeDetailView.vue src/router/index.ts src/constants/permissions.ts tests/unit/constants/routePermissions.test.ts
```

---

### Task 7: EmployeeFormDialog 統一表單彈窗

**Files:**
- Create: `src/components/employee/EmployeeFormDialog.vue`
- Modify: `src/components/employee/EmployeeFormBasic.vue:132-136`（員工編號顯示修正）
- Test: `tests/unit/components/employee/EmployeeFormDialog.test.ts`

**Interfaces:**
- Consumes: `EmployeeFormBasic`/`EmployeeFormSalary`/`EmployeeChangesPreviewDialog`/`useEmployeeFormDirty`/`useFormDraft`/`useCrudDialog`、stores（config/classroom）、`@/api/employees`
- Produces（Task 8 依賴）:
  ```ts
  // <EmployeeFormDialog ref="formDialog" @saved="onSaved" />
  defineExpose({
    openCreate: () => Promise<void>,          // 開新增（含草稿還原提示）
    openEdit: (row: Record<string, unknown>) => Promise<void>,
  })
  emits: { (e: 'saved'): void }               // create 或任一 tab 儲存成功後觸發
  ```

- [ ] **Step 1: 搬遷範圍（從 EmployeeView.vue script 區搬入新元件，行為保持）**

搬遷清單（EmployeeView.vue 行號）：`rules`（L80-90）、`positionSalaryConfig/suggestedSalary`（L92-93）、`titleToGrade`（L102-107）、`EmployeeForm` interface + `form` reactive（L109-204）、`activeTab` + `useEmployeeFormDirty`（L207-208）、`SALARY_AMOUNT_FIELDS`/`ChangeEntry`/`previewDialog`（L213-218）、suggestion 機制（L221-224、L272-307）、`FIELD_LABELS`（L227-244）、`dirtyToPayload/showError`（L246-254）、`bureauJobTitleOptions`（L256-269）、`resetForm/populateForm`（L436-471）、`useCrudDialog`（L473）、draft 機制（L476-504）、`isSelfEdit/isSalaryReadonly/salaryReadonlyReason`（L507-515）、`saveCreate/saveBasic/submitSalary/saveSalary/showBasicPreview`（L786-884）、`formAsBasicData/classroomOptions`（L888-889）、`getPositionSalary` 載入（onMounted 內 L913-916）；template 搬 Add/Edit Dialog 整段（L1054-1137）+ `EmployeeChangesPreviewDialog`（L1140-1148）+ `.required-legend` 樣式。

對外接線改為：
- `openCreate = async () => { handleAdd(); await nextTick(); await employeeDraft.maybePromptRestore() }`（原 `openCreateWithDraft`）
- `openEdit = async (row) => { handleEdit(row); await nextTick(); await employeeDraft.maybePromptRestore() }`
- `saveCreate` 成功路徑、`saveBasic`/`submitSalary` 成功路徑的 `await fetchEmployees()` 改為 `emit('saved')`（由外部決定刷新清單或詳情頁）。

- [ ] **Step 2: 新增模式改兩 tab（統一架構 + 薪資接線）**

template 的表單區不再 `v-if="!isEdit"` 走單捲動，統一為：

```html
<el-form :model="form" :rules="rules" ref="formRef" label-position="top">
  <p v-if="!isEdit" class="required-legend"><span class="req">*</span> 為必填，其餘可日後補</p>
  <el-tabs type="border-card" v-model="activeTab">
    <el-tab-pane label="基本資料" name="basic">
      <EmployeeFormBasic
        ref="basicFormRef"
        :form="formAsBasicData"
        :bureau-job-title-options="bureauJobTitleOptions"
        :classroom-options="classroomOptions"
        :is-self-edit="isSelfEdit"
        :pending-suggestion="isEdit ? pendingSuggestion : false"
        :suggested-salary="isEdit ? suggestedSalary : null"
      />
    </el-tab-pane>
    <el-tab-pane :label="isEdit ? '薪資 / 投保 / 銀行' : '薪資 / 投保 / 銀行（選填）'" name="salary">
      <!-- 新增模式且無薪資權限：明確告知兩段式流程 -->
      <el-alert
        v-if="!isEdit && !canWriteSalary"
        type="info" show-icon :closable="false"
        title="你沒有薪資編輯權限"
        description="可先建立員工基本資料，薪資/投保/銀行由具薪資權限者（HR）事後補登。"
      />
      <EmployeeFormSalary
        v-else
        :form="form"
        :is-readonly="isEdit ? isSalaryReadonly : false"
        :readonly-reason="salaryReadonlyReason"
        :pending-suggestion="pendingSuggestion"
        :suggested-salary="suggestedSalary"
        :insurance-error="insuranceError"
        @apply-suggestion="applySuggestion"
        @dismiss-suggestion="dismissSuggestion"
        @sync-insurance="syncInsuranceToBase"
      />
    </el-tab-pane>
  </el-tabs>
</el-form>
```

`canWriteSalary = computed(() => hasPermission('SALARY_WRITE'))` 一併搬入本元件。footer 邏輯不變（create：取消/儲存；edit：關閉/檢視變更/儲存基本資料 或 儲存薪資）。`saveCreate` 送整包 `form`（後端 `EmployeeCreate` 全收薪資欄位；create 不需 adjustment_reason）。

- [ ] **Step 3: 彈窗工學（限高內捲 + tab 列與 footer 永遠可見）**

el-dialog 加 class 與樣式（修「941px 彈窗超出 900px 視窗、footer 要捲到底」）：

```html
<el-dialog
  v-model="dialogVisible"
  :title="isEdit ? '編輯員工' : '新增員工'"
  :width="isMobile ? '100%' : '800px'"
  :top="isMobile ? '0' : '6vh'"
  :fullscreen="isMobile"
  class="employee-form-dialog"
  destroy-on-close
>
```

非 scoped style block（dialog teleport 到 body，scoped 穿不透；比照檔尾既有的全域 fallback 做法）：

```css
/* 桌機：tabs 內容區內捲，tab 列與 dialog footer 永遠可見 */
.employee-form-dialog:not(.is-fullscreen) .el-tabs--border-card > .el-tabs__content {
  max-height: calc(100vh - 340px);
  overflow-y: auto;
}
```

- [ ] **Step 4: 修編輯模式員工編號顯示**

`src/components/employee/EmployeeFormBasic.vue` L132-136 改為（有編號顯示編號、無編號才顯示自動配號 hint）：

```html
<el-form-item label="員工編號">
  <el-tag v-if="form.employee_id" data-test="employee-id-value" effect="plain">{{ form.employee_id }}</el-tag>
  <div v-else data-test="employee-id-auto" class="form-hint" style="margin-top:0">
    <el-tag type="success" effect="plain">儲存後自動配號（例：114001）</el-tag>
  </div>
</el-form-item>
```

先 `grep -rn "employee-id-auto" tests/` — 若有既有測試斷言此 data-test，補「編輯模式顯示現有編號」case 而不是改壞原斷言。

- [ ] **Step 5: 寫測試**

`tests/unit/components/employee/EmployeeFormDialog.test.ts`（mock stores 與 `@/api/employees`，mock 形狀抄真實契約）：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const mockCreateEmployee = vi.fn(() => Promise.resolve({ data: { id: 99 } }))
vi.mock('@/api/employees', () => ({
  createEmployee: (...a: unknown[]) => mockCreateEmployee(...a),
  updateEmployeeBasic: vi.fn(() => Promise.resolve({ data: {} })),
  updateEmployeeSalary: vi.fn(() => Promise.resolve({ data: {} })),
}))
vi.mock('@/api/config', () => ({ getPositionSalary: vi.fn(() => Promise.resolve({ data: {} })) }))

// hasPermission mock：預設全有權限；個別 case 覆寫
const mockHasPermission = vi.fn(() => true)
vi.mock('@/utils/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/auth')>()),
  hasPermission: (...a: unknown[]) => mockHasPermission(...a),
  getUserInfo: () => ({ employee_id: 1, role: 'admin' }),
}))

import EmployeeFormDialog from '@/components/employee/EmployeeFormDialog.vue'

// pinia stores 依 repo 既有測試慣例 mock（參考 tests/unit/views/EmployeeView.test.js 開頭的 store mock 寫法照抄）

describe('EmployeeFormDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('新增模式有兩個 tab（基本資料 + 薪資選填）', async () => {
    const w = mount(EmployeeFormDialog, { /* global mocks 同上參考 */ })
    await (w.vm as unknown as { openCreate: () => Promise<void> }).openCreate()
    await nextTick()
    expect(w.text()).toContain('基本資料')
    expect(w.text()).toContain('薪資 / 投保 / 銀行')
  })

  it('新增：具 SALARY_WRITE 者填的薪資欄位隨整包 form 送出（不再是 0）', async () => {
    const w = mount(EmployeeFormDialog, { /* ... */ })
    const vm = w.vm as unknown as { openCreate: () => Promise<void>; form: Record<string, unknown>; saveCreate: () => Promise<void> }
    await vm.openCreate()
    vm.form.name = '測試員工'
    vm.form.base_salary = 32000
    await vm.saveCreate()
    await nextTick()
    expect(mockCreateEmployee).toHaveBeenCalledWith(expect.objectContaining({ name: '測試員工', base_salary: 32000 }))
  })

  it('新增：無 SALARY_WRITE → 薪資 tab 顯示補登提示、不渲染薪資表單', async () => {
    mockHasPermission.mockImplementation((p: unknown) => p !== 'SALARY_WRITE')
    const w = mount(EmployeeFormDialog, { /* ... */ })
    await (w.vm as unknown as { openCreate: () => Promise<void> }).openCreate()
    await nextTick()
    expect(w.text()).toContain('由具薪資權限者（HR）事後補登')
  })

  it('儲存成功 emit saved', async () => {
    const w = mount(EmployeeFormDialog, { /* ... */ })
    const vm = w.vm as unknown as { openCreate: () => Promise<void>; form: Record<string, unknown>; saveCreate: () => Promise<void> }
    await vm.openCreate()
    vm.form.name = '測試員工'
    await vm.saveCreate()
    await nextTick()
    expect(w.emitted('saved')).toBeTruthy()
  })
})
```

註：`saveCreate` 內 `formEl.validate(callback)` 依賴 el-form 實例；若 mount 淺層導致 validate 不可用，依 EmployeeView.test.js 既有做法（它已測過 saveBasic 流程）取得可運作的 mount 配置——**照抄該檔的 global stubs/plugins 設定**，不要自創。

- [ ] **Step 6: 跑測試**

Run: `npx vitest run tests/unit/components/employee/EmployeeFormDialog.test.ts`
Expected: PASS（4 case）

- [ ] **Step 7: typecheck**

Run: `npm run typecheck`
Expected: 零錯誤（此時 EmployeeView.vue 仍保有舊 dialog，兩份並存 OK——Task 8 才移除）

- [ ] **Step 8: Commit**

```bash
cd ~/Desktop/ivy-frontend
git add src/components/employee/EmployeeFormDialog.vue src/components/employee/EmployeeFormBasic.vue tests/unit/components/employee/EmployeeFormDialog.test.ts
git commit -m "feat: 統一員工表單彈窗（新增補薪資tab+權限分流+限高內捲+編號顯示修正）" -- src/components/employee/EmployeeFormDialog.vue src/components/employee/EmployeeFormBasic.vue tests/unit/components/employee/EmployeeFormDialog.test.ts
```

---

### Task 8: EmployeeListView 抽出 + 清單改善 + EmployeeView 退役

**Files:**
- Create: `src/views/EmployeeListView.vue`
- Modify: `src/views/EmployeeHubView.vue`（lazy import 換成 EmployeeListView）
- Modify: `src/api/employees.ts`（加 `deleteEmployee` wrapper）
- Delete: `src/views/EmployeeView.vue`
- Test: `tests/unit/views/EmployeeListView.test.js`（自 EmployeeView.test.js 遷移）
- Modify: `src/views/EmployeeDetailView.vue`（左欄接上編輯按鈕）

**Interfaces:**
- Consumes: Task 7 `EmployeeFormDialog`（`openCreate/openEdit` + `@saved`）、Task 2 utils、`OffboardingModal`、`useResetPunchPin`、`useLatestSearch`、stores
- Produces: `/employees` 頁的新實體；`deleteEmployee(id: number): AxiosResp<'/employees/{employee_id}', 'delete'>`

- [ ] **Step 1: api 加 deleteEmployee wrapper**

`src/api/employees.ts` 在 `updateEmployee` 之後加：

```ts
/** 快速標記離職（軟刪：設離職+撤帳號，跳過 offboarding 流程）——非資料刪除 */
export const deleteEmployee = (id: number): AxiosResp<'/employees/{employee_id}', 'delete'> =>
    api.delete(`/employees/${id}`)
```

- [ ] **Step 2: 建立 EmployeeListView.vue**

以 EmployeeView.vue 為底建立新檔，**保留**：手機卡片欄位（L59-65）、權限 computed（L74-78）+ `useResetPunchPin`、搜尋/篩選/統計/匯出/`fetchEmployees`（L364-434）、page-header 與清單 template（L921-1051）、清單相關 scoped 樣式（L1534-1563）。**移除**（已搬走或退役）：表單/詳情彈窗全部 script 與 template、子對話框、出勤/班級歷程/子資源邏輯、`handleDetail`。**新增**以下改動：

(a) 職稱篩選（清單 title 欄位的去重值，純前端 chain 在狀態篩選之後）：

```ts
const titleFilter = ref<string>('all')
const titleOptions = computed(() => {
  const titles = (employeeStore.employees as Record<string, unknown>[])
    .map((e) => (e.title as string) || '')
    .filter(Boolean)
  return [...new Set(titles)]
})
const matchesTitle = (emp: Record<string, unknown>) =>
  titleFilter.value === 'all' || emp.title === titleFilter.value
const displayedEmployees = computed(() =>
  (filteredEmployees.value as Record<string, unknown>[]).filter((e) => matchesStatus(e) && matchesTitle(e))
)
// clearFilters 一併重置 titleFilter.value = 'all'
```

template 狀態篩選旁加：

```html
<el-select v-model="titleFilter" class="title-filter" aria-label="職稱篩選">
  <el-option label="全部職稱" value="all" />
  <el-option v-for="t in titleOptions" :key="t" :label="t" :value="t" />
</el-select>
```

（樣式 `.title-filter { width: 140px; }`，窄螢幕 media query 比照 status-filter 加 flex 規則）

(b) 整列點擊進詳情頁 + 移除「詳情」按鈕：

```ts
import { useRouter } from 'vue-router'
const router = useRouter()
const goDetail = (row: Record<string, unknown>) => router.push(`/employees/${row.id}`)
// row-click：點到操作欄不導航（操作欄有自己的按鈕）
const onRowClick = (row: Record<string, unknown>, column: { label?: string }) => {
  if (column?.label === '操作') return
  goDetail(row)
}
```

```html
<el-table :data="displayedEmployees" v-loading="loading" stripe style="width: 100%" max-height="600"
  :row-class-name="rowClassName" @row-click="onRowClick">
```

移除桌機與手機兩處的「詳情」`el-button`；手機卡片標題改可點：

```html
<template #title="{ item }">
  <span class="card-title-link" @click="goDetail(item)">{{ item.name }}</span>
</template>
```

(c) 已離職/待離職列淡化：

```ts
import { statusKeyOf } from '@/utils/employeeDisplay'
const rowClassName = ({ row }: { row: Record<string, unknown> }) => {
  const k = statusKeyOf(row)
  return k === 'resigned' ? 'row-resigned' : k === 'pending' ? 'row-pending' : ''
}
```

```css
:deep(.el-table .row-resigned) { opacity: 0.55; }
:deep(.el-table .row-pending) { opacity: 0.8; }
.el-table :deep(tbody tr) { cursor: pointer; }
.card-title-link { cursor: pointer; color: var(--el-color-primary); }
```

(d) 「刪除」→「快速標記離職」＋後果明列確認框（取代 `useConfirmDelete`）：

```ts
import { h } from 'vue'
import { deleteEmployee } from '@/api/employees'

const quickResign = (row: Record<string, unknown>) => {
  ElMessageBox.confirm(
    h('div', null, [
      h('p', null, `確定將「${row.name}」快速標記離職？此操作會：`),
      h('ul', { style: 'margin:8px 0 8px 18px; line-height:1.9' }, [
        h('li', null, '立即設定離職（今日）並撤銷登入帳號'),
        h('li', null, '不產生離職證明、不做假別結算快照'),
        h('li', null, '不計算最終薪資預覽'),
      ]),
      h('p', { style: 'color:var(--el-color-warning)' }, '正式離職請優先走「辦理離職」完整流程；本功能適用於誤建帳號或極簡情境。'),
    ]),
    '快速標記離職',
    { type: 'warning', confirmButtonText: '確認標記離職', cancelButtonText: '取消' },
  ).then(async () => {
    try {
      await deleteEmployee(row.id as number)
      ElMessage.success('已標記離職')
      fetchEmployees()
    } catch (err) {
      showError(err)  // showError 一併保留在本檔（L249-254 搬遷）
    }
  }).catch(() => {})
}
```

「更多」選單（桌機與手機兩處同步改）：

```html
<el-dropdown-menu>
  <el-dropdown-item v-if="scope.row.is_active" command="offboard">辦理離職</el-dropdown-item>
  <el-dropdown-item v-if="canResetPunchPin" command="reset-punch-pin">重置打卡 PIN</el-dropdown-item>
  <el-dropdown-item command="quick-resign" divided>快速標記離職</el-dropdown-item>
</el-dropdown-menu>
```

```ts
const handleRowCommand = (cmd: string, row: Record<string, unknown>) => {
  if (cmd === 'offboard') openOffboard(row)
  else if (cmd === 'reset-punch-pin') resetEmployeePin(row as { id: number; name: string })
  else if (cmd === 'quick-resign') quickResign(row)
}
```

(e) 接上 EmployeeFormDialog：

```html
<EmployeeFormDialog ref="formDialog" @saved="fetchEmployees" />
```

```ts
import EmployeeFormDialog from '@/components/employee/EmployeeFormDialog.vue'
const formDialog = ref<InstanceType<typeof EmployeeFormDialog> | null>(null)
// 「新增員工」按鈕 → formDialog?.openCreate()；操作欄「編輯」→ formDialog?.openEdit(row)
```

(f) `onMounted` 保留 store TTL 載入與 `?search=` 預填（L901-917），但 `getPositionSalary` 載入已移入 FormDialog，本檔不再需要。

- [ ] **Step 3: EmployeeHubView 換 import + 刪除 EmployeeView.vue**

`src/views/EmployeeHubView.vue`：`grep -n "EmployeeView" src/views/EmployeeHubView.vue`，把 lazy import 的 `'./EmployeeView.vue'` 改 `'./EmployeeListView.vue'`（變數名一併更名）。然後：

```bash
git rm src/views/EmployeeView.vue
```

全 repo 確認無殘留引用：`grep -rn "EmployeeView" src/ tests/`（tests 的引用下一步處理）。

- [ ] **Step 4: 測試遷移（斷言不可刪）**

```bash
git mv tests/unit/views/EmployeeView.test.js tests/unit/views/EmployeeListView.test.js
```

逐 describe 處理（先 Read 全檔）：
- import 改 `EmployeeListView`；清單/搜尋/篩選/統計相關 case 原地保留。
- 涉及編輯/新增 dialog 流程（`saveBasic`/`saveCreate`/dirty/preview）的 case → 搬到 `tests/unit/components/employee/EmployeeFormDialog.test.ts`（Task 7 檔案，調整為透過 `openCreate/openEdit` 驅動；斷言邏輯保持）。
- 涉及詳情彈窗（`handleDetail`/detail tabs/子資源）的 case → 語意由 `useEmployeeDetail.test.ts`（Task 3）與 `SalarySection.test.ts`（Task 4）承接；若有未覆蓋的斷言（如出勤編輯 payload 組裝），搬到新檔 `tests/unit/components/employee/AttendanceSection.test.ts` 針對元件重寫。
- 新增 case：`quick-resign` 指令觸發確認框、確認後呼叫 `DELETE /employees/{id}`；職稱篩選與狀態篩選可疊加。

- [ ] **Step 5: 跑全部相關測試 + typecheck + lint**

Run: `npx vitest run tests/unit/views/EmployeeListView.test.js tests/unit/components/employee/ tests/unit/composables/useEmployeeDetail.test.ts && npm run typecheck && npm run lint`
Expected: 全 PASS、零型別/lint 錯誤

- [ ] **Step 6: EmployeeDetailView 接編輯按鈕**

`src/views/EmployeeDetailView.vue` 左欄 `.aside-actions` 補：

```html
<el-button type="primary" plain size="small" @click="openEdit">編輯</el-button>
```

```ts
import EmployeeFormDialog from '@/components/employee/EmployeeFormDialog.vue'
const formDialog = ref<InstanceType<typeof EmployeeFormDialog> | null>(null)
const openEdit = () => { if (employee.value) formDialog.value?.openEdit(employee.value) }
const onSaved = async () => {
  await detail.reloadCore()
  employeeStore.fetchEmployees(true)
}
```

template 尾端（OffboardingModal 旁）加 `<EmployeeFormDialog ref="formDialog" @saved="onSaved" />`。

- [ ] **Step 7: Commit**

```bash
cd ~/Desktop/ivy-frontend
git add src/views/EmployeeListView.vue src/views/EmployeeHubView.vue src/views/EmployeeDetailView.vue src/api/employees.ts tests/unit/views/EmployeeListView.test.js tests/unit/components/employee/
git rm --cached src/views/EmployeeView.vue 2>/dev/null || true
git commit -m "feat: 清單頁改版（列點擊進詳情/職稱篩選/離職列淡化/快速標記離職）並退役 EmployeeView" -- src/views/ src/api/employees.ts tests/unit/views/ tests/unit/components/employee/
```

（若 `git rm` 已在 Step 3 執行過，commit 的 pathspec `src/views/` 會涵蓋刪除紀錄。）

---

### Task 9: 離職管理術語中文化

**Files:**
- Modify: `src/views/admin/OffboardingView.vue:73`（`no_record: '無 record'` → `'未建立紀錄'`）、`:157`（label `"Checklist 狀態"` → `"離職檢核"`）

- [ ] **Step 1: 先查測試依賴**

`grep -rn "無 record\|Checklist 狀態" tests/` — 有斷言就同步更新（斷言目標文字改為新文案，不刪 case）。

- [ ] **Step 2: 改字串**

上述兩處直接替換；同檔 `grep -n "record"` 掃一遍確認無其他中英夾雜殘留。

- [ ] **Step 3: 跑相關測試**

Run: `grep -rln "OffboardingView" tests/ | xargs -r npx vitest run`（無檔則跑 `npm test` 抽查）
Expected: PASS

- [ ] **Step 4: Commit**

```bash
cd ~/Desktop/ivy-frontend
git add src/views/admin/OffboardingView.vue
git commit -m "fix: 離職管理術語中文化（未建立紀錄/離職檢核）" -- src/views/admin/OffboardingView.vue tests/
```

---

### Task 10: 整合驗證與收尾

**Files:**
- 無新檔；全套驗證 + dev 實走

- [ ] **Step 1: 全套 gate**

```bash
cd ~/Desktop/ivy-frontend && npm run typecheck && npm run lint && npm test
```
Expected: 全綠。

- [ ] **Step 2: dev 實走（使用者先跑 start.sh；Claude 用 Playwright 驗證）**

核對 spec 附錄 A 12 項逐項確認：
1. 清單列點擊 → `/employees/:id` 詳情頁渲染五區塊、深連結重新整理可用、返回可用
2. 新增員工：兩 tab、薪資可填、儲存成功後清單出現且無「待補薪資」tag
3. 編輯：彈窗不超視窗、tab 列與儲存鈕固定可見、員工編號顯示現有編號
4. 更多選單：辦理離職／重置打卡 PIN／快速標記離職（確認框列後果）——**驗證確認框後點「取消」**，勿真的標記 dev 資料
5. 已離職列淡化、職稱篩選與狀態篩選疊加
6. 出勤區塊空月份顯示「暫無資料」（繁中）
7. 離職管理顯示「未建立紀錄」「離職檢核」
8. 薪資區塊：正職不顯示時薪列；（如有非 admin 測試帳號）遮罩顯示「無檢視權限」

- [ ] **Step 3: e2e smoke 評估（判斷步驟）**

查 `ivy-backend/e2e/`（CI 實跑副本）的 admin 頁面渲染測試是否含 `/employees`：
- 若有且是「頁面可渲染」等級：補一條「點清單第一列 → URL 變 `/employees/\d+` → 頁面含『基本資料』」的 case，**落在 ivy-backend/e2e/ 並在 backend repo commit**（workspace `e2e/` 為本地副本，不進 CI）。
- 若無 employees 條目：跳過（不擴 e2e 範圍）。

- [ ] **Step 4: 收尾提醒（不自動執行）**

本計畫預設**併 local main、不 push**。是否 push（= 觸發 Zeabur prod 部署）由使用者決定；宣稱「完成」前若要 push，走 `./scripts/finish-check.sh` 收尾 gate。

---

## Self-Review 紀錄

- **Spec coverage**：§2 路由（Task 6）、§3 詳情頁（Task 3-6）、§4 表單統一（Task 7）、§5 清單/離職入口（Task 8）、§6 顯示規範（Task 1/2/4/9）、§7 拆檔（Task 5/7/8）、§8 測試（各 Task + Task 10）。附錄 A 12 項全數對應。
- **型別一致性**：`useEmployeeDetail` 回傳簽名（Task 3 Produces）與 Task 6 的解構使用一致；`EmployeeFormDialog` expose（Task 7）與 Task 8 (e)/Step 6 呼叫一致；`deleteEmployee`（Task 8 Step 1）先於使用處（Step 2d）。
- **已知風險**：Task 7 的 mount 配置依賴既有 EmployeeView.test.js 的 stubs 慣例（已指示照抄）；Task 8 測試遷移是最大不確定點（已給 describe→目的地對照規則）。
