# 補休到期與特休週年制 — Frontend (Phase B) Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 前端落地 HR Leave Quota Expiry 介面（即將到期補休 / 即將滿週年 / 折算歷史）+ LeaveQuotaManager 補休 row 顯示「最早到期日」。

**Architecture:** 新 api wrapper `src/api/leaveQuotaExpiry.ts` 4 函式（用 OpenAPI `AxiosResp` 型別） → 新 component `LeaveQuotaExpiryTab.vue` 用 el-tabs 內 3 sub-section → 整合到 `LeaveView.vue` 既有 el-tabs 加第 3 個 tab → `LeaveQuotaManager.vue` 內 compensatory row 加 tooltip 顯示最早到期日。

**Tech Stack:** Vue 3 Composition API + `<script setup lang="ts">` + Pinia + Element Plus + Vitest + axios (透過 `src/api/index.ts` wrapper)

**Spec:** `ivy-backend/docs/superpowers/specs/2026-05-26-leave-quota-lifecycle-design.md` §5.4

**前提：**
- Backend `516dabf` (T1-T18) 已 merge local main，4 endpoints 可用
- OpenAPI regen `schema.d.ts` 已 commit (`53f8f4b7`) 含 `/leave-quota-expiry/*` 4 endpoint types
- Scheduler 預設 `enabled=False`，HR 可用 `/run-now` 手動測

**Out of Scope（defer）：**
- SalaryView.vue tooltip 展開 unused_leave_payout_log 證據鏈 — 既有 UI 無 `unused_leave_payout` 獨立欄位（僅 net_pay 聚合顯示），需先擴 SalaryView schema 再做。Phase C
- LINE Bot 即將到期推播

---

## File Structure

**新檔：**
- `src/api/leaveQuotaExpiry.ts` — 4 函式 wrapper
- `src/components/leave/LeaveQuotaExpiryTab.vue` — 3 sub-section 主元件
- `tests/components/leave/LeaveQuotaExpiryTab.test.ts` — vitest

**修改檔：**
- `src/views/LeaveView.vue` — 加第 3 個 tab 容納新元件
- `src/views/leave/LeaveQuotaManager.vue` — compensatory row 加 tooltip
- `src/composables/useLeaveQuota.ts` (optional)

---

## Task F1: src/api/leaveQuotaExpiry.ts

**Files:**
- Create: `src/api/leaveQuotaExpiry.ts`
- Test: `tests/api/leaveQuotaExpiry.test.ts`

- [ ] **Step 1: 寫 failing test**

```typescript
// tests/api/leaveQuotaExpiry.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import api from '@/api'
import {
  listUpcomingGrants,
  listUpcomingAnniversaries,
  listPayoutHistory,
  runSchedulerNow,
} from '@/api/leaveQuotaExpiry'

vi.mock('@/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

describe('leaveQuotaExpiry api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listUpcomingGrants calls /leave-quota-expiry/upcoming with days', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { grants: [] } })
    await listUpcomingGrants(30)
    expect(api.get).toHaveBeenCalledWith('/leave-quota-expiry/upcoming', { params: { days: 30 } })
  })

  it('listUpcomingAnniversaries calls /leave-quota-expiry/anniversaries', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { anniversaries: [] } })
    await listUpcomingAnniversaries(30)
    expect(api.get).toHaveBeenCalledWith('/leave-quota-expiry/anniversaries', { params: { days: 30 } })
  })

  it('listPayoutHistory calls /leave-quota-expiry/payout-history', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { logs: [] } })
    await listPayoutHistory(50)
    expect(api.get).toHaveBeenCalledWith('/leave-quota-expiry/payout-history', { params: { limit: 50 } })
  })

  it('runSchedulerNow POSTs', async () => {
    ;(api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { comp_summary: {}, cutover_summary: {} } })
    await runSchedulerNow()
    expect(api.post).toHaveBeenCalledWith('/leave-quota-expiry/run-now')
  })
})
```

- [ ] **Step 2: 跑測試 FAIL** (`npm run test -- leaveQuotaExpiry`)

- [ ] **Step 3: 實作 api wrapper**

```typescript
// src/api/leaveQuotaExpiry.ts
/**
 * 補休到期與特休週年制 HR 管理 API.
 * Backend: ivy-backend/api/leave_quota_expiry.py
 */
import api from '@/api'
import type { AxiosResp } from './_generated/typed'

/** 列即將到期 active grant（補休 ledger） */
export function listUpcomingGrants(days = 30) {
  return api.get('/leave-quota-expiry/upcoming', { params: { days } }) as Promise<
    AxiosResp<'/leave-quota-expiry/upcoming', 'get'>
  >
}

/** 列未來 N 天滿週年員工（特休 cutover 預告） */
export function listUpcomingAnniversaries(days = 30) {
  return api.get('/leave-quota-expiry/anniversaries', { params: { days } }) as Promise<
    AxiosResp<'/leave-quota-expiry/anniversaries', 'get'>
  >
}

/** 列 unused_leave_payout_log 折算歷史 */
export function listPayoutHistory(limit = 50) {
  return api.get('/leave-quota-expiry/payout-history', { params: { limit } }) as Promise<
    AxiosResp<'/leave-quota-expiry/payout-history', 'get'>
  >
}

/** 手動 trigger scheduler（idempotent，含 try_scheduler_lock 防並發） */
export function runSchedulerNow() {
  return api.post('/leave-quota-expiry/run-now') as Promise<
    AxiosResp<'/leave-quota-expiry/run-now', 'post'>
  >
}
```

- [ ] **Step 4: 跑測試 PASS**

- [ ] **Step 5: Commit**

```bash
git add src/api/leaveQuotaExpiry.ts tests/api/leaveQuotaExpiry.test.ts
git commit -m "feat(api): leaveQuotaExpiry wrapper 4 函式（含 OpenAPI AxiosResp 型別）"
```

---

## Task F2: LeaveQuotaExpiryTab.vue 主元件

**Files:**
- Create: `src/components/leave/LeaveQuotaExpiryTab.vue`
- Test: `tests/components/leave/LeaveQuotaExpiryTab.test.ts`

- [ ] **Step 1: 寫 failing test**

```typescript
// tests/components/leave/LeaveQuotaExpiryTab.test.ts
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import LeaveQuotaExpiryTab from '@/components/leave/LeaveQuotaExpiryTab.vue'

vi.mock('@/api/leaveQuotaExpiry', () => ({
  listUpcomingGrants: vi.fn().mockResolvedValue({
    data: { grants: [
      { grant_id: 1, employee_id: 10, granted_hours: 8, consumed_hours: 2, unexpired_hours: 6, granted_at: '2025-04-01', expires_at: '2026-04-01' }
    ] }
  }),
  listUpcomingAnniversaries: vi.fn().mockResolvedValue({
    data: { anniversaries: [
      { employee_id: 10, hire_date: '2020-04-01', next_anniversary: '2026-04-01' }
    ] }
  }),
  listPayoutHistory: vi.fn().mockResolvedValue({
    data: { logs: [
      { log_id: 1, employee_id: 10, source_type: 'comp_grant_expiry', hours: 6, amount: 1200, salary_period: '2026-05', salary_record_id: 100, wage_basis_date: '2026-04-01', meta: {} }
    ] }
  }),
  runSchedulerNow: vi.fn().mockResolvedValue({ data: { comp_summary: { paid_employees: 1 }, cutover_summary: {} } }),
}))

describe('LeaveQuotaExpiryTab', () => {
  it('renders 3 sub-sections', async () => {
    const wrapper = mount(LeaveQuotaExpiryTab, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.text()).toContain('即將到期補休')
    expect(wrapper.text()).toContain('即將滿週年')
    expect(wrapper.text()).toContain('折算歷史')
  })

  it('shows grant row from upcoming', async () => {
    const wrapper = mount(LeaveQuotaExpiryTab, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.text()).toContain('6')  // unexpired_hours
  })

  it('clicking run-now triggers scheduler', async () => {
    const { runSchedulerNow } = await import('@/api/leaveQuotaExpiry')
    const wrapper = mount(LeaveQuotaExpiryTab, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const btn = wrapper.find('[data-testid="run-now-btn"]')
    if (btn.exists()) {
      await btn.trigger('click')
      expect(runSchedulerNow).toHaveBeenCalled()
    }
  })
})
```

- [ ] **Step 2: 跑測試 FAIL**

- [ ] **Step 3: 實作元件**

```vue
<!-- src/components/leave/LeaveQuotaExpiryTab.vue -->
<script setup lang="ts">
/**
 * HR Leave Quota Expiry 管理頁籤：
 * - 即將到期補休（30 天內 expires_at 的 active grant）
 * - 即將滿週年員工（30 天內 hire_date anniversary）
 * - 折算歷史（unused_leave_payout_log）
 * - 手動 trigger scheduler（含 try_scheduler_lock 防並發）
 */
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listUpcomingGrants,
  listUpcomingAnniversaries,
  listPayoutHistory,
  runSchedulerNow,
} from '@/api/leaveQuotaExpiry'

const grants = ref<Array<Record<string, unknown>>>([])
const anniversaries = ref<Array<Record<string, unknown>>>([])
const logs = ref<Array<Record<string, unknown>>>([])
const loading = ref(false)
const running = ref(false)
const days = ref(30)

const refresh = async () => {
  loading.value = true
  try {
    const [up, anv, hist] = await Promise.all([
      listUpcomingGrants(days.value),
      listUpcomingAnniversaries(days.value),
      listPayoutHistory(50),
    ])
    grants.value = (up.data as { grants: Array<Record<string, unknown>> }).grants
    anniversaries.value = (anv.data as { anniversaries: Array<Record<string, unknown>> }).anniversaries
    logs.value = (hist.data as { logs: Array<Record<string, unknown>> }).logs
  } catch (e) {
    ElMessage.error('讀取失敗')
  } finally {
    loading.value = false
  }
}

const runNow = async () => {
  try {
    await ElMessageBox.confirm(
      '確認手動 trigger 結算？已啟用 scheduler 後通常無需手動跑。',
      '確認手動結算',
      { type: 'warning' },
    )
  } catch {
    return
  }
  running.value = true
  try {
    const res = await runSchedulerNow()
    const data = res.data as { comp_summary?: Record<string, unknown>; cutover_summary?: Record<string, unknown> }
    ElMessage.success(
      `補休結算 ${data.comp_summary?.paid_employees ?? 0} 人 / 特休 cutover ${data.cutover_summary?.paid_employees ?? 0} 人`,
    )
    await refresh()
  } catch (e: unknown) {
    const err = e as { response?: { status?: number } }
    if (err.response?.status === 409) {
      ElMessage.warning('scheduler 今日已跑過或正在執行，請稍後再試')
    } else {
      ElMessage.error('結算失敗')
    }
  } finally {
    running.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <div class="leave-quota-expiry-tab">
    <div class="header">
      <el-input-number v-model="days" :min="1" :max="365" size="small" />
      <span class="hint">天內</span>
      <el-button type="primary" size="small" @click="refresh" :loading="loading">重新整理</el-button>
      <el-button type="warning" size="small" :loading="running" data-testid="run-now-btn" @click="runNow">
        手動結算
      </el-button>
    </div>

    <el-tabs class="sub-tabs">
      <el-tab-pane label="即將到期補休">
        <el-table :data="grants" border stripe size="small">
          <el-table-column prop="grant_id" label="ID" width="80" />
          <el-table-column prop="employee_id" label="員工 ID" width="100" />
          <el-table-column prop="granted_hours" label="發放" width="80" />
          <el-table-column prop="consumed_hours" label="已用" width="80" />
          <el-table-column prop="unexpired_hours" label="待領" width="80" />
          <el-table-column prop="granted_at" label="加班日" width="120" />
          <el-table-column prop="expires_at" label="到期日" width="120" />
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="即將滿週年">
        <el-table :data="anniversaries" border stripe size="small">
          <el-table-column prop="employee_id" label="員工 ID" width="100" />
          <el-table-column prop="hire_date" label="到職日" width="120" />
          <el-table-column prop="next_anniversary" label="下個週年" width="120" />
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="折算歷史">
        <el-table :data="logs" border stripe size="small">
          <el-table-column prop="log_id" label="ID" width="80" />
          <el-table-column prop="employee_id" label="員工 ID" width="100" />
          <el-table-column prop="source_type" label="來源" width="180">
            <template #default="{ row }">
              <el-tag :type="row.source_type === 'comp_grant_expiry' ? 'warning' : 'success'" size="small">
                {{ row.source_type === 'comp_grant_expiry' ? '補休到期' : (row.source_type === 'annual_anniversary' ? '特休週年' : row.source_type) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="hours" label="時數" width="80" />
          <el-table-column prop="amount" label="金額" width="100">
            <template #default="{ row }">${{ Number(row.amount).toLocaleString() }}</template>
          </el-table-column>
          <el-table-column prop="salary_period" label="入帳月" width="100" />
          <el-table-column prop="wage_basis_date" label="時薪基準" width="120" />
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.leave-quota-expiry-tab { padding: 12px; }
.header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.hint { color: var(--el-text-color-secondary); font-size: 12px; }
.sub-tabs { margin-top: 8px; }
</style>
```

- [ ] **Step 4: 跑測試 PASS**

- [ ] **Step 5: Commit**

```bash
git add src/components/leave/LeaveQuotaExpiryTab.vue tests/components/leave/LeaveQuotaExpiryTab.test.ts
git commit -m "feat(leave): LeaveQuotaExpiryTab.vue — HR 補休到期/特休週年/折算歷史 3 sub-section"
```

---

## Task F3: LeaveView.vue 加第 3 個 tab

**Files:**
- Modify: `src/views/LeaveView.vue:395-587`（el-tabs 結構區）

- [ ] **Step 1: 加 import + 新 tab pane**

於 `<script setup>` 加：
```typescript
import LeaveQuotaExpiryTab from '@/components/leave/LeaveQuotaExpiryTab.vue'
import { hasPermission } from '@/utils/auth'
```

於 `<el-tabs>` 加第 3 個 pane（行事曆 tab 後）：

```vue
<el-tab-pane
  v-if="hasPermission('LEAVES_READ') || hasPermission('SALARY_READ')"
  label="到期管理"
  name="expiry"
>
  <LeaveQuotaExpiryTab v-if="activeTab === 'expiry'" />
</el-tab-pane>
```

`v-if` 確保元件僅在 activeTab='expiry' 時才 mount（節省 API 呼叫）。

- [ ] **Step 2: 跑 `npm run dev` 手測 — tab 顯示 + 切換載入正常**

- [ ] **Step 3: 跑 vitest 確認 LeaveView 既有 test 無 regression**

```bash
npm run test -- LeaveView
```

- [ ] **Step 4: Commit**

```bash
git add src/views/LeaveView.vue
git commit -m "feat(leave): LeaveView 加「到期管理」sub-tab 整合 LeaveQuotaExpiryTab"
```

---

## Task F4: LeaveQuotaManager compensatory row 加最早到期日 tooltip

**Files:**
- Modify: `src/views/leave/LeaveQuotaManager.vue`
- Modify: `src/api/leaveQuotaExpiry.ts`（追加 helper）

- [ ] **Step 1: 在 leaveQuotaExpiry.ts 加 helper**

```typescript
// 追加至 src/api/leaveQuotaExpiry.ts 尾端
export interface EarliestExpiringGrant {
  expires_at: string
  unexpired_hours: number
}

/**
 * 查詢員工最早到期的 active grant（前端 LeaveQuotaManager 補休 row 用）。
 * 從 listUpcomingGrants(365) 過濾 employee_id 後取 expires_at 最小。
 */
export async function getEarliestExpiringGrantForEmployee(
  employeeId: number,
): Promise<EarliestExpiringGrant | null> {
  const res = await listUpcomingGrants(365)
  const grants = (res.data as { grants: Array<{
    employee_id: number; expires_at: string; unexpired_hours: number
  }> }).grants
  const own = grants
    .filter((g) => g.employee_id === employeeId)
    .sort((a, b) => a.expires_at.localeCompare(b.expires_at))
  return own[0] ?? null
}
```

- [ ] **Step 2: LeaveQuotaManager compensatory row 加 tooltip**

於既有 compensatory row 顯示處 (`leaveQuotas` table) 加 tooltip：

```vue
<el-table-column label="剩餘時數" width="120">
  <template #default="{ row }">
    <span>{{ row.remaining_hours }}h</span>
    <el-tooltip
      v-if="row.leave_type === 'compensatory' && earliestExpiringMap[row.employee_id]"
      :content="`最早到期：${earliestExpiringMap[row.employee_id].expires_at}（${earliestExpiringMap[row.employee_id].unexpired_hours}h）`"
      placement="top"
    >
      <el-icon class="warn-icon"><Warning /></el-icon>
    </el-tooltip>
  </template>
</el-table-column>
```

於 `<script setup>` 加：

```typescript
import { Warning } from '@element-plus/icons-vue'
import { getEarliestExpiringGrantForEmployee, type EarliestExpiringGrant } from '@/api/leaveQuotaExpiry'

const earliestExpiringMap = ref<Record<number, EarliestExpiringGrant>>({})

// 在 loadQuotas() 內，撈完 quotas 後並行撈 earliest expiring：
const loadEarliestExpiring = async () => {
  const empIds = [...new Set(leaveQuotas.value.filter((q) => q.leave_type === 'compensatory').map((q) => q.employee_id))]
  const results = await Promise.allSettled(empIds.map((id) => getEarliestExpiringGrantForEmployee(id)))
  const map: Record<number, EarliestExpiringGrant> = {}
  results.forEach((res, i) => {
    if (res.status === 'fulfilled' && res.value) {
      map[empIds[i]] = res.value
    }
  })
  earliestExpiringMap.value = map
}
```

注意：若 LeaveQuotaManager 內 `QuotaRow` 無 employee_id 欄位 — 從 employeeStore 對應補上或從 quota row 既有資料取。**先 grep 確認 LeaveQuotaManager 既有 QuotaRow 是否含 employee_id**。如缺，wire 處改為 `currentEmployeeId`（單一員工 view 時）。

- [ ] **Step 3: 跑 vitest 既有 LeaveQuotaManager test 無 regression**

- [ ] **Step 4: Commit**

```bash
git add src/views/leave/LeaveQuotaManager.vue src/api/leaveQuotaExpiry.ts
git commit -m "feat(leave): LeaveQuotaManager 補休 row 加最早到期日 tooltip + earliest expiring helper"
```

---

## Final: typecheck + build + 全套 vitest

- [ ] 跑 `npm run typecheck` 確認 0 error
- [ ] 跑 `npm run build` 確認 build success
- [ ] 跑 `npm run test` 確認 vitest 全綠（含新加 + 既有）
- [ ] 手測 `npm run dev` 在 LeaveView 切到「到期管理」tab 確認三個 sub-section 載入

---

## Out of Scope（defer 至 Phase C）

- SalaryView.vue tooltip 展開 unused_leave_payout_log 證據鏈（需先擴 SalaryView UI 加 `unused_leave_payout` 獨立欄位）
- LINE Bot 即將到期推播
- 員工自助頁顯示「下個結算月」預告
