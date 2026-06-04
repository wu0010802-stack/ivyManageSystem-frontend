# 招生↔學生/班級整合 Phase 1（records-as-hub）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以「招生訪視名單」為參觀→入學流程主軸，接上已存在的名額規劃/座位保留，並讓班級頁看得到準新生；全程走正確路由的 records/intake 端點，移除壞掉且不需要的招生漏斗 tab。

**Architecture:** 呈現層整合（準新生不變 Student、不計入人數/點名/收費）。唯一後端改動：`RecruitmentRecordOut` 補 3 個既有欄位。前端新增 api 層 + 名額規劃面板 + 訪視記錄保留座位入口 + 班級頁準新生區塊 + 移除漏斗 tab。

**Tech Stack:** 後端 FastAPI + Pydantic + pytest；前端 Vue 3 `<script setup lang="ts">` + Element Plus + Pinia + Vitest；OpenAPI→TS codegen。

**Spec:** `docs/superpowers/specs/2026-06-04-recruitment-student-integration-phase1-design.md`

---

## 前置（執行前先做，非 TDD 任務）

- **後端 worktree**：在 `~/Desktop/ivy-backend` 從 local main 開 `feat/recruit-records-provisional-fields-be`（用 `git worktree add`，沿用既有 `.worktrees/` 或 `.claude/worktrees/` 慣例；`git -C <worktree> branch --show-current` 驗證）。
- **前端 worktree**：已存在 `~/Desktop/ivy-frontend/.worktrees/recruit-student-integration-p1-fe`（branch `feat/recruit-student-integration-p1-fe`）。
- **前端 worktree node_modules（必修，否則 vite/vitest 炸）**：
  ```bash
  cd ~/Desktop/ivy-frontend/.worktrees/recruit-student-integration-p1-fe
  rm -f node_modules
  ln -s ~/Desktop/ivy-frontend/node_modules node_modules
  ls node_modules/.bin/vitest   # 應存在
  ```
- **dev DB upgrade（手動整合測試前必跑，單元測試不需要）**：
  ```bash
  cd ~/Desktop/ivy-backend && .venv/bin/python -m alembic upgrade heads
  ```
- 後端 python 用 `~/Desktop/ivy-backend/.venv/bin/python`。

---

## Task 1（後端）：`RecruitmentRecordOut` 補 3 個 provisional 欄位

**Files:**
- Modify: `ivy-backend/schemas/recruitment_records.py`（`RecruitmentRecordOut`，約 line 30-56）
- Modify（如序列化為手動 dict）：`ivy-backend/api/recruitment/records.py`（list/get 端點組裝處）
- Test: `ivy-backend/tests/test_recruitment_records_provisional_fields.py`（新檔）

- [ ] **Step 1: 寫失敗測試**

先確認序列化方式：`grep -n "RecruitmentRecordOut" ivy-backend/api/recruitment/records.py`。若是 `RecruitmentRecordOut.model_validate(visit)`／`from_attributes`，新增欄位會自動帶出；若是手動 `RecruitmentRecordOut(id=..., ...)` 則 Step 3 要補欄位賦值。

```python
# tests/test_recruitment_records_provisional_fields.py
"""RecruitmentRecordOut 應曝露 provisional 座位欄位（班級頁準新生用）。"""
from models.base import session_scope
from models.recruitment import RecruitmentVisit
from schemas.recruitment_records import RecruitmentRecordOut


def test_record_out_has_provisional_fields():
    # schema 欄位存在
    fields = RecruitmentRecordOut.model_fields
    assert "provisional_grade_id" in fields
    assert "target_school_year" in fields
    assert "target_semester" in fields


def test_record_out_serializes_provisional_values_from_orm():
    visit = RecruitmentVisit(
        month="115.03",
        child_name="測試童",
        has_deposit=True,
        provisional_grade_id=None,
        target_school_year=None,
        target_semester=None,
    )
    out = RecruitmentRecordOut.model_validate(visit)
    assert out.provisional_grade_id is None
    # 設值情境
    visit.provisional_grade_id = 7
    visit.target_school_year = 115
    visit.target_semester = 1
    out2 = RecruitmentRecordOut.model_validate(visit)
    assert out2.provisional_grade_id == 7
    assert out2.target_school_year == 115
    assert out2.target_semester == 1
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd ~/Desktop/ivy-backend && .venv/bin/python -m pytest tests/test_recruitment_records_provisional_fields.py -v`
Expected: FAIL（`provisional_grade_id` 不在 model_fields）

- [ ] **Step 3: 加欄位**

在 `schemas/recruitment_records.py` 的 `RecruitmentRecordOut` 內（緊接 `enrolled` 之後）加：

```python
    provisional_grade_id: Optional[int] = None
    target_school_year: Optional[int] = None
    target_semester: Optional[int] = None
```

若 `RecruitmentRecordOut` 非 `from_attributes`（`grep "model_config\|from_attributes\|class Config" schemas/recruitment_records.py schemas/_base*.py`），且 records 端點是手動組 dict，於 `api/recruitment/records.py` 對應組裝處補上同名 key=`visit.<col>`。

> 注意：`.py` 存檔後 PostToolUse black hook 會自動格式化；surgical edit 若需繞過用 `bash python3 string.replace`（見記憶 feedback_subagent_posttooluse_black_hook）。

- [ ] **Step 4: 跑測試確認通過**

Run: `.venv/bin/python -m pytest tests/test_recruitment_records_provisional_fields.py -v`
Expected: PASS（2 passed）

- [ ] **Step 5: 確認無回歸**

Run: `.venv/bin/python -m pytest tests/test_recruitment_api.py tests/test_recruitment_records_provisional_fields.py -q`
Expected: 全綠

- [ ] **Step 6: Commit（後端 worktree）**

```bash
git -C ~/Desktop/ivy-backend/.worktrees/<be-worktree> add schemas/recruitment_records.py api/recruitment/records.py tests/test_recruitment_records_provisional_fields.py
git -C ~/Desktop/ivy-backend/.worktrees/<be-worktree> commit -m "feat(recruitment): RecruitmentRecordOut 曝露 provisional 座位欄位

班級頁準新生/訪視記錄保留座位顯示用；皆為 recruitment_visits 既有欄位（免 join）。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2（跨 repo）：OpenAPI codegen 同步 schema.d.ts

**Files:**
- Modify: `ivy-frontend/.worktrees/recruit-student-integration-p1-fe/src/api/_generated/schema.d.ts`（產出）

- [ ] **Step 1: 後端 dump OpenAPI**

Run:
```bash
cd ~/Desktop/ivy-backend && .venv/bin/python scripts/dump_openapi.py
# 預設輸出供前端 gen:api 取用（local-only artifact，.gitignore 擋；勿 commit openapi.json）
```
Expected: `[dump_openapi] wrote ... openapi.json`

- [ ] **Step 2: 前端 gen:api**

Run:
```bash
cd ~/Desktop/ivy-frontend/.worktrees/recruit-student-integration-p1-fe && npm run gen:api
```

- [ ] **Step 3: 驗證 key 存在**

Run:
```bash
grep -nE "intake-plan|intake-targets|reserve-seat" src/api/_generated/schema.d.ts | head
grep -nE "provisional_grade_id|target_school_year" src/api/_generated/schema.d.ts | head
```
Expected: intake 三 key 形態為 `'/recruitment/intake-plan'`、`'/recruitment/intake-targets'`、`'/recruitment/funnel/visits/{visit_id}/reserve-seat'`；records schema 含新欄位。
**若 key 與下列任務假設不同，以 schema.d.ts 實際 key 為準改 wrapper。**

- [ ] **Step 4: Commit schema.d.ts**

```bash
git add src/api/_generated/schema.d.ts
git commit -m "chore(api): regen schema.d.ts（intake 端點 + records provisional 欄位）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3（前端）：`recruitmentIntake.ts` api 層

**Files:**
- Create: `src/api/recruitmentIntake.ts`
- Test: `src/api/__tests__/recruitmentIntake.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
// src/api/__tests__/recruitmentIntake.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}))

import api from '@/api'
import * as intake from '../recruitmentIntake'

describe('recruitmentIntake API wrapper', () => {
  beforeEach(() => vi.clearAllMocks())

  it('getIntakePlan sends GET with school_year + semester', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { rows: [] } })
    await intake.getIntakePlan({ school_year: 115, semester: 1 })
    expect(api.get).toHaveBeenCalledWith(
      '/recruitment/intake-plan',
      expect.objectContaining({ params: { school_year: 115, semester: 1 } }),
    )
  })

  it('setIntakeTargets sends PUT with body', async () => {
    ;(api.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    const body = { school_year: 115, semester: 1, targets: [{ grade_id: 1, target_seats: 10 }] }
    await intake.setIntakeTargets(body)
    expect(api.put).toHaveBeenCalledWith('/recruitment/intake-targets', body)
  })

  it('reserveSeat sends POST with body', async () => {
    ;(api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    await intake.reserveSeat(42, { provisional_grade_id: 7, target_school_year: 115, target_semester: 1 })
    expect(api.post).toHaveBeenCalledWith(
      '/recruitment/funnel/visits/42/reserve-seat',
      { provisional_grade_id: 7, target_school_year: 115, target_semester: 1 },
    )
  })

  it('reserveSeat release sends null grade', async () => {
    ;(api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    await intake.reserveSeat(42, { provisional_grade_id: null })
    expect(api.post).toHaveBeenCalledWith(
      '/recruitment/funnel/visits/42/reserve-seat',
      { provisional_grade_id: null },
    )
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/api/__tests__/recruitmentIntake.test.ts`
Expected: FAIL（找不到模組 `../recruitmentIntake`）

- [ ] **Step 3: 實作 wrapper**

```typescript
// src/api/recruitmentIntake.ts
/**
 * /recruitment/intake* + reserve-seat API wrappers — 新生名額規劃 / 暫定編班。
 */
import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

/** GET /recruitment/intake-plan — 名額彙總（年級 × 計畫/保留/註冊/剩餘）。 */
export function getIntakePlan(
  params: ApiQuery<'/recruitment/intake-plan', 'get'>,
): AxiosResp<'/recruitment/intake-plan', 'get'> {
  return api.get('/recruitment/intake-plan', { params })
}

/** PUT /recruitment/intake-targets — 設定每年級計畫名額。 */
export function setIntakeTargets(
  payload: ApiBody<'/recruitment/intake-targets', 'put'>,
): AxiosResp<'/recruitment/intake-targets', 'put'> {
  return api.put('/recruitment/intake-targets', payload)
}

/** POST /recruitment/funnel/visits/{visit_id}/reserve-seat — 設定/釋放暫定編班（null grade = 釋放）。 */
export function reserveSeat(
  visitId: number,
  payload: ApiBody<'/recruitment/funnel/visits/{visit_id}/reserve-seat', 'post'>,
): AxiosResp<'/recruitment/funnel/visits/{visit_id}/reserve-seat', 'post'> {
  return api.post(`/recruitment/funnel/visits/${visitId}/reserve-seat`, payload)
}
```

> 若 Task 2 Step 3 顯示 key 不同，替換上述字串與泛型參數為 schema.d.ts 實際 key。

- [ ] **Step 4: 跑測試確認通過 + typecheck**

Run: `npx vitest run src/api/__tests__/recruitmentIntake.test.ts && npm run typecheck`
Expected: PASS + typecheck 0 error

- [ ] **Step 5: Commit**

```bash
git add src/api/recruitmentIntake.ts src/api/__tests__/recruitmentIntake.test.ts
git commit -m "feat(api): 新增 recruitmentIntake api（名額規劃/座位保留）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4（前端）：`IntakePlanPanel.vue` 名額規劃面板

**Files:**
- Create: `src/components/recruitment/IntakePlanPanel.vue`
- Test: `tests/components/IntakePlanPanel.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
// tests/components/IntakePlanPanel.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import IntakePlanPanel from '@/components/recruitment/IntakePlanPanel.vue'

vi.mock('@/api/recruitmentIntake', () => ({
  getIntakePlan: vi.fn().mockResolvedValue({
    data: { school_year: 115, semester: 1, rows: [
      { grade_id: 1, grade_name: '小班', target_seats: 10, reserved_count: 8, enrolled_count: 1, remaining: 1, over_capacity: false },
      { grade_id: 2, grade_name: '中班', target_seats: 5, reserved_count: 4, enrolled_count: 3, remaining: -2, over_capacity: true },
    ] },
  }),
  setIntakeTargets: vi.fn().mockResolvedValue({ data: {} }),
}))
vi.mock('@/api/classrooms', () => ({
  getGrades: vi.fn().mockResolvedValue({ data: [
    { id: 1, name: '小班', sort_order: 1 }, { id: 2, name: '中班', sort_order: 2 }, { id: 3, name: '大班', sort_order: 3 },
  ] }),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
vi.mock('@/utils/academic', () => ({ currentRocYear: () => 115 }))

describe('IntakePlanPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders one row per grade and flags over_capacity', async () => {
    const wrapper = mount(IntakePlanPanel, { global: { stubs: { transition: true } } })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('小班')
    expect(text).toContain('中班')
    // 第三個年級（大班）無 plan row，仍應出現（getGrades 補齊）
    expect(text).toContain('大班')
    // over_capacity 列有 red class
    expect(wrapper.html()).toMatch(/over-capacity/)
  })

  it('saving a target calls setIntakeTargets', async () => {
    const { setIntakeTargets } = await import('@/api/recruitmentIntake')
    const wrapper = mount(IntakePlanPanel, { global: { stubs: { transition: true } } })
    await flushPromises()
    // 觸發儲存（元件對外暴露 save()）
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save()
    await flushPromises()
    expect(setIntakeTargets).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/components/IntakePlanPanel.test.ts`
Expected: FAIL（找不到元件）

- [ ] **Step 3: 實作元件**

```vue
<!-- src/components/recruitment/IntakePlanPanel.vue -->
<template>
  <div class="intake-plan-panel" v-loading="loading">
    <div class="intake-plan-panel__toolbar">
      <el-select v-model="schoolYear" size="small" style="width: 130px" @change="reload">
        <el-option v-for="y in yearOptions" :key="y" :value="y" :label="`${y} 學年`" />
      </el-select>
      <el-radio-group v-model="semester" size="small" @change="reload">
        <el-radio-button :value="1">上學期</el-radio-button>
        <el-radio-button :value="2">下學期</el-radio-button>
      </el-radio-group>
      <el-button v-if="canWrite" size="small" type="primary" :loading="saving" @click="save">儲存計畫名額</el-button>
    </div>

    <el-table :data="rows" border size="small" :row-class-name="rowClass">
      <el-table-column prop="grade_name" label="年級" min-width="100" />
      <el-table-column label="計畫名額" align="center" width="120">
        <template #default="{ row }">
          <el-input-number
            v-if="canWrite"
            v-model="row.target_seats"
            :min="0"
            size="small"
            controls-position="right"
            style="width: 100px"
          />
          <span v-else>{{ row.target_seats }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="reserved_count" label="已保留" align="center" width="90" />
      <el-table-column prop="enrolled_count" label="已註冊" align="center" width="90" />
      <el-table-column label="剩餘" align="center" width="90">
        <template #default="{ row }">
          <span :class="{ 'remaining-neg': row.remaining < 0 }">{{ row.remaining }}</span>
        </template>
      </el-table-column>
    </el-table>

    <div class="intake-plan-panel__total">
      合計：計畫 {{ total.target }} · 保留 {{ total.reserved }} · 註冊 {{ total.enrolled }} · 剩餘 {{ total.remaining }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  ElSelect, ElOption, ElRadioGroup, ElRadioButton, ElButton,
  ElTable, ElTableColumn, ElInputNumber, ElMessage,
} from 'element-plus'
import { getIntakePlan, setIntakeTargets } from '@/api/recruitmentIntake'
import { getGrades } from '@/api/classrooms'
import { hasPermission } from '@/utils/auth'
import { currentRocYear } from '@/utils/academic'

interface PlanRow {
  grade_id: number
  grade_name: string
  target_seats: number
  reserved_count: number
  enrolled_count: number
  remaining: number
  over_capacity: boolean
}
interface GradeRow { id: number; name: string; sort_order?: number }

const canWrite = computed(() => hasPermission('RECRUITMENT_WRITE'))
const schoolYear = ref<number>(currentRocYear())
const semester = ref<1 | 2>(1)
const loading = ref(false)
const saving = ref(false)
const rows = ref<PlanRow[]>([])

const yearOptions = computed(() => {
  const y = currentRocYear()
  return [y + 1, y, y - 1]
})

async function reload(): Promise<void> {
  loading.value = true
  try {
    const [planResp, gradesResp] = await Promise.all([
      getIntakePlan({ school_year: schoolYear.value, semester: semester.value }),
      getGrades(),
    ])
    const planRows = (planResp.data.rows ?? []) as PlanRow[]
    const grades = (gradesResp.data as unknown as GradeRow[]) ?? []
    const byGrade = new Map(planRows.map((r) => [r.grade_id, r]))
    // 以年級為主軸合併，補上無 plan row 的年級（可為零保留年級設定計畫名額）
    rows.value = [...grades]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((g) => byGrade.get(g.id) ?? {
        grade_id: g.id, grade_name: g.name, target_seats: 0,
        reserved_count: 0, enrolled_count: 0, remaining: 0, over_capacity: false,
      })
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  saving.value = true
  try {
    await setIntakeTargets({
      school_year: schoolYear.value,
      semester: semester.value,
      targets: rows.value.map((r) => ({ grade_id: r.grade_id, target_seats: r.target_seats })),
    })
    ElMessage.success('已儲存計畫名額')
    await reload()
  } catch {
    ElMessage.error('儲存失敗')
  } finally {
    saving.value = false
  }
}

const rowClass = ({ row }: { row: PlanRow }) => (row.over_capacity ? 'over-capacity' : '')
const total = computed(() => rows.value.reduce(
  (acc, r) => ({
    target: acc.target + r.target_seats,
    reserved: acc.reserved + r.reserved_count,
    enrolled: acc.enrolled + r.enrolled_count,
    remaining: acc.remaining + r.remaining,
  }),
  { target: 0, reserved: 0, enrolled: 0, remaining: 0 },
))

defineExpose({ save, reload })
onMounted(reload)
</script>

<style scoped>
.intake-plan-panel__toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
.intake-plan-panel__total { margin-top: 12px; color: #606266; font-size: 13px; }
.remaining-neg { color: var(--el-color-danger); font-weight: 600; }
:deep(.over-capacity) { background: var(--el-color-danger-light-9); }
</style>
```

- [ ] **Step 4: 跑測試確認通過 + typecheck**

Run: `npx vitest run tests/components/IntakePlanPanel.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/recruitment/IntakePlanPanel.vue tests/components/IntakePlanPanel.test.ts
git commit -m "feat(recruitment): 名額規劃面板（年級×計畫/保留/註冊/剩餘）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5（前端）：把名額規劃面板掛進 RecruitmentView 新 tab

**Files:**
- Modify: `src/views/RecruitmentView.vue`（tabs 區 + import）
- Test: `tests/views/RecruitmentView.intakeTab.test.ts`（新檔，輕量）

- [ ] **Step 1: 寫失敗測試**

```typescript
// tests/views/RecruitmentView.intakeTab.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// 結構性斷言（避免 mount 整個重元件）：tab 與 import 已接上
const src = fs.readFileSync(path.resolve(__dirname, '../../src/views/RecruitmentView.vue'), 'utf-8')

describe('RecruitmentView 名額規劃 tab', () => {
  it('has intake tab pane', () => {
    expect(src).toMatch(/name="intake"/)
    expect(src).toContain('IntakePlanPanel')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/views/RecruitmentView.intakeTab.test.ts`
Expected: FAIL

- [ ] **Step 3: 加 tab + import**

在 `src/views/RecruitmentView.vue`：
1. `<script setup>` import 區加：`import IntakePlanPanel from '@/components/recruitment/IntakePlanPanel.vue'`
2. tabs 內（建議放在 `detail` tab 之前或之後）加：
```vue
      <el-tab-pane label="名額規劃" name="intake" lazy>
        <IntakePlanPanel />
      </el-tab-pane>
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/views/RecruitmentView.intakeTab.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/RecruitmentView.vue tests/views/RecruitmentView.intakeTab.test.ts
git commit -m "feat(recruitment): 招生統計新增名額規劃 tab

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6（前端）：`ReserveSeatDialog.vue` 保留座位對話框

**Files:**
- Create: `src/components/recruitment/ReserveSeatDialog.vue`
- Test: `tests/components/ReserveSeatDialog.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
// tests/components/ReserveSeatDialog.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ReserveSeatDialog from '@/components/recruitment/ReserveSeatDialog.vue'

vi.mock('@/api/recruitmentIntake', () => ({
  reserveSeat: vi.fn().mockResolvedValue({ data: {} }),
}))
vi.mock('@/api/classrooms', () => ({
  getGrades: vi.fn().mockResolvedValue({ data: [{ id: 7, name: '小班', sort_order: 1 }] }),
}))

describe('ReserveSeatDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('submits reserveSeat with chosen grade + year/semester', async () => {
    const { reserveSeat } = await import('@/api/recruitmentIntake')
    const wrapper = mount(ReserveSeatDialog, {
      props: { modelValue: true, visit: { id: 42, child_name: '測試童', has_deposit: true } },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    await (wrapper.vm as unknown as { confirm: () => Promise<void> }).confirm()
    expect(reserveSeat).toHaveBeenCalledWith(42, expect.objectContaining({ provisional_grade_id: expect.any(Number) }))
  })

  it('release sends null grade', async () => {
    const { reserveSeat } = await import('@/api/recruitmentIntake')
    const wrapper = mount(ReserveSeatDialog, {
      props: { modelValue: true, visit: { id: 42, child_name: '測試童', has_deposit: true, provisional_grade_id: 7 } },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    await (wrapper.vm as unknown as { release: () => Promise<void> }).release()
    expect(reserveSeat).toHaveBeenCalledWith(42, { provisional_grade_id: null })
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/components/ReserveSeatDialog.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作元件**

```vue
<!-- src/components/recruitment/ReserveSeatDialog.vue -->
<template>
  <el-dialog v-model="visible" title="保留座位（暫定編班）" width="420px">
    <p class="child-info">幼生：{{ visit?.child_name }}（visit #{{ visit?.id }}）</p>
    <el-form label-position="top">
      <el-form-item label="暫定年級" required>
        <el-select v-model="form.gradeId" placeholder="請選擇年級" style="width: 100%">
          <el-option v-for="g in grades" :key="g.id" :value="g.id" :label="g.name" />
        </el-select>
      </el-form-item>
      <el-form-item label="目標學年（民國）" required>
        <el-input-number v-model="form.schoolYear" :min="100" :max="200" controls-position="right" style="width: 100%" />
      </el-form-item>
      <el-form-item label="目標學期">
        <el-radio-group v-model="form.semester">
          <el-radio-button :value="1">上學期</el-radio-button>
          <el-radio-button :value="2">下學期</el-radio-button>
        </el-radio-group>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button v-if="isReserved" type="warning" plain :loading="busy" @click="release">釋放保留</el-button>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :disabled="!canConfirm" :loading="busy" @click="confirm">確認保留</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  ElDialog, ElForm, ElFormItem, ElSelect, ElOption,
  ElInputNumber, ElRadioGroup, ElRadioButton, ElButton, ElMessage,
} from 'element-plus'
import { reserveSeat } from '@/api/recruitmentIntake'
import { getGrades } from '@/api/classrooms'
import { currentRocYear } from '@/utils/academic'

interface VisitLike {
  id: number
  child_name?: string
  has_deposit?: boolean
  provisional_grade_id?: number | null
  target_school_year?: number | null
  target_semester?: number | null
}
interface GradeRow { id: number; name: string; sort_order?: number }

const props = defineProps<{ modelValue: boolean; visit: VisitLike | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'reserved'): void }>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const grades = ref<GradeRow[]>([])
const busy = ref(false)
const form = ref<{ gradeId: number | null; schoolYear: number; semester: 1 | 2 }>({
  gradeId: null, schoolYear: currentRocYear(), semester: 1,
})

const isReserved = computed(() => props.visit?.provisional_grade_id != null)
const canConfirm = computed(() => form.value.gradeId != null && !!form.value.schoolYear)

watch(
  () => [visible.value, props.visit?.id] as const,
  async ([v]) => {
    if (!v || !props.visit) return
    if (grades.value.length === 0) {
      const resp = await getGrades()
      grades.value = (resp.data as unknown as GradeRow[]) ?? []
    }
    form.value = {
      gradeId: props.visit.provisional_grade_id ?? null,
      schoolYear: props.visit.target_school_year ?? currentRocYear(),
      semester: (props.visit.target_semester as 1 | 2) ?? 1,
    }
  },
  { immediate: true },
)

async function confirm(): Promise<void> {
  if (!canConfirm.value || !props.visit) return
  busy.value = true
  try {
    await reserveSeat(props.visit.id, {
      provisional_grade_id: form.value.gradeId,
      target_school_year: form.value.schoolYear,
      target_semester: form.value.semester,
    })
    ElMessage.success('已保留座位')
    emit('reserved')
    visible.value = false
  } catch {
    ElMessage.error('保留失敗（未預繳者不能保留）')
  } finally {
    busy.value = false
  }
}

async function release(): Promise<void> {
  if (!props.visit) return
  busy.value = true
  try {
    await reserveSeat(props.visit.id, { provisional_grade_id: null })
    ElMessage.success('已釋放保留')
    emit('reserved')
    visible.value = false
  } catch {
    ElMessage.error('釋放失敗')
  } finally {
    busy.value = false
  }
}

defineExpose({ confirm, release })
</script>

<style scoped>
.child-info { margin: 0 0 16px; color: #555; }
</style>
```

- [ ] **Step 4: 跑測試確認通過 + typecheck**

Run: `npx vitest run tests/components/ReserveSeatDialog.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/recruitment/ReserveSeatDialog.vue tests/components/ReserveSeatDialog.test.ts
git commit -m "feat(recruitment): 保留座位對話框（暫定編班）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7（前端）：RecruitmentDetailTab 加「保留座位」按鈕（emit）

**Files:**
- Modify: `src/components/recruitment/RecruitmentDetailTab.vue`（操作欄 + emits 宣告）
- Test: `tests/components/RecruitmentDetailTab.reserve.test.ts`（新檔）

- [ ] **Step 1: 寫失敗測試**

```typescript
// tests/components/RecruitmentDetailTab.reserve.test.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RecruitmentDetailTab from '@/components/recruitment/RecruitmentDetailTab.vue'

function mountTab(rows: Record<string, unknown>[]) {
  return mount(RecruitmentDetailTab, {
    props: { records: rows, loading: false, total: rows.length, page: 1, pageSize: 20, canWrite: true, canConvert: true },
    global: { stubs: { teleport: true } },
  })
}

describe('RecruitmentDetailTab 保留座位', () => {
  it('emits reserve with row for a deposited record', async () => {
    const row = { id: 42, child_name: '測試童', has_deposit: true, enrolled: false }
    const wrapper = mountTab([row])
    const btn = wrapper.findAll('button').find((b) => b.text().includes('保留座位'))
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    expect(wrapper.emitted('reserve')?.[0]?.[0]).toMatchObject({ id: 42 })
  })

  it('hides 保留座位 for non-deposited record', () => {
    const row = { id: 43, child_name: '未繳童', has_deposit: false, enrolled: false }
    const wrapper = mountTab([row])
    const btn = wrapper.findAll('button').find((b) => b.text().includes('保留座位'))
    expect(btn).toBeFalsy()
  })
})
```

> 註：props 形狀以 RecruitmentDetailTab 實際 `defineProps` 為準（Step 3 前先 `grep "defineProps\|withDefaults" src/components/recruitment/RecruitmentDetailTab.vue` 對齊欄位名）。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/components/RecruitmentDetailTab.reserve.test.ts`
Expected: FAIL

- [ ] **Step 3: 加按鈕 + emit**

在 `RecruitmentDetailTab.vue` 操作欄（`label="操作"` 的 `el-table-column` 內，「編輯」與「轉為學生」之間）加：

```vue
          <el-button
            v-if="canWrite && row.has_deposit"
            size="small"
            type="warning"
            plain
            @click="$emit('reserve', row)"
          >{{ row.provisional_grade_id ? '變更座位' : '保留座位' }}</el-button>
```

並在 `defineEmits` 加入 `'reserve': [row: Record<string, unknown>]`（對齊既有 `convert` emit 宣告格式）。

- [ ] **Step 4: 跑測試確認通過 + typecheck**

Run: `npx vitest run tests/components/RecruitmentDetailTab.reserve.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/recruitment/RecruitmentDetailTab.vue tests/components/RecruitmentDetailTab.reserve.test.ts
git commit -m "feat(recruitment): 訪視名單加保留座位按鈕（已預繳才顯示）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8（前端）：RecruitmentView 接 reserve → 開 ReserveSeatDialog

**Files:**
- Modify: `src/views/RecruitmentView.vue`
- Test: `tests/views/RecruitmentView.reserve.test.ts`（結構性）

- [ ] **Step 1: 寫失敗測試**

```typescript
// tests/views/RecruitmentView.reserve.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
const src = fs.readFileSync(path.resolve(__dirname, '../../src/views/RecruitmentView.vue'), 'utf-8')

describe('RecruitmentView reserve wiring', () => {
  it('wires @reserve and ReserveSeatDialog', () => {
    expect(src).toMatch(/@reserve=/)
    expect(src).toContain('ReserveSeatDialog')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/views/RecruitmentView.reserve.test.ts`
Expected: FAIL

- [ ] **Step 3: 接線**

在 `RecruitmentView.vue`：
1. import：`import ReserveSeatDialog from '@/components/recruitment/ReserveSeatDialog.vue'`
2. `<RecruitmentDetailTab ...>` 加 `@reserve="openReserveDialog"`
3. 模板加（鄰近 `RecruitmentConvertDialog`）：
```vue
    <ReserveSeatDialog
      v-model="reserveDialogVisible"
      :visit="reserveTargetVisit"
      @reserved="onReserved"
    />
```
4. `<script setup>` 加：
```typescript
const reserveDialogVisible = ref(false)
const reserveTargetVisit = ref<Record<string, unknown> | null>(null)
function openReserveDialog(row: Record<string, unknown>) {
  reserveTargetVisit.value = row
  reserveDialogVisible.value = true
}
function onReserved() {
  // 重載訪視列表以反映 provisional 欄位（沿用既有 records 載入函式名）
  void loadRecords?.()
}
```
> `loadRecords` 替換為 RecruitmentView 既有的 records 重載函式名（Step 3 前 `grep "function load\|loadRecords\|fetchRecords\|getRecruitmentRecords" src/views/RecruitmentView.vue` 確認）。

- [ ] **Step 4: 跑測試確認通過 + typecheck**

Run: `npx vitest run tests/views/RecruitmentView.reserve.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/RecruitmentView.vue tests/views/RecruitmentView.reserve.test.ts
git commit -m "feat(recruitment): RecruitmentView 接保留座位對話框

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9（前端）：`useClassroomProspects` composable

**Files:**
- Create: `src/composables/useClassroomProspects.ts`
- Test: `tests/unit/composables/useClassroomProspects.test.ts`

- [ ] **Step 1: 寫失敗測試**

```typescript
// tests/unit/composables/useClassroomProspects.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useClassroomProspects } from '@/composables/useClassroomProspects'

vi.mock('@/api/recruitmentIntake', () => ({
  getIntakePlan: vi.fn().mockResolvedValue({
    data: { rows: [{ grade_id: 7, grade_name: '小班', target_seats: 10, reserved_count: 2, enrolled_count: 1, remaining: 7, over_capacity: false }] },
  }),
}))
vi.mock('@/api/recruitment', () => ({
  getRecruitmentRecords: vi.fn().mockResolvedValue({
    data: { records: [
      { id: 1, child_name: '甲', provisional_grade_id: 7, target_school_year: 115, enrolled: false },
      { id: 2, child_name: '乙', provisional_grade_id: 7, target_school_year: 115, enrolled: true },  // 已報到→排除
      { id: 3, child_name: '丙', provisional_grade_id: 9, target_school_year: 115, enrolled: false }, // 別年級→排除
      { id: 4, child_name: '丁', provisional_grade_id: 7, target_school_year: 114, enrolled: false }, // 別學年→排除
    ] },
  }),
}))

describe('useClassroomProspects', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters prospects by grade+year and excludes enrolled', async () => {
    const opts = ref({ grade_id: 7, school_year: 115, semester: 1 })
    const { reservedCount, prospects, reload } = useClassroomProspects(opts)
    await reload()
    expect(reservedCount.value).toBe(2)
    expect(prospects.value.map((p) => p.id)).toEqual([1])
  })

  it('no-op when grade_id missing', async () => {
    const opts = ref({ grade_id: undefined, school_year: 115, semester: 1 })
    const { prospects, reload } = useClassroomProspects(opts)
    await reload()
    expect(prospects.value).toEqual([])
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/unit/composables/useClassroomProspects.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作 composable**

```typescript
// src/composables/useClassroomProspects.ts
/**
 * 班級頁準新生（保留座位）：reservedCount 取自 intake-plan，名單取自 records（client filter）。
 * 走正確路由的 records/intake，不依賴招生漏斗。
 */
import { ref, type Ref } from 'vue'
import { getIntakePlan } from '@/api/recruitmentIntake'
import { getRecruitmentRecords } from '@/api/recruitment'

export interface ProspectRow {
  id: number
  child_name?: string
  source?: string
  has_deposit?: boolean
  target_semester?: number | null
  [key: string]: unknown
}
export interface ClassroomKey {
  grade_id?: number | null
  school_year?: number | null
  semester?: number | null
}

export function useClassroomProspects(opts: Ref<ClassroomKey>) {
  const reservedCount = ref(0)
  const prospects = ref<ProspectRow[]>([])
  const loading = ref(false)

  async function reload(): Promise<void> {
    const { grade_id, school_year, semester } = opts.value
    if (grade_id == null || school_year == null) {
      reservedCount.value = 0
      prospects.value = []
      return
    }
    loading.value = true
    try {
      const [planResp, recResp] = await Promise.all([
        getIntakePlan({ school_year, semester: semester ?? 1 }),
        getRecruitmentRecords({ has_deposit: true, page_size: 200 }),
      ])
      const planRows = (planResp.data.rows ?? []) as Array<{ grade_id: number; reserved_count: number }>
      reservedCount.value = planRows.find((r) => r.grade_id === grade_id)?.reserved_count ?? 0
      const records = (recResp.data.records ?? []) as ProspectRow[]
      prospects.value = records.filter(
        (r) => r.provisional_grade_id === grade_id
          && r.target_school_year === school_year
          && !r.enrolled,
      )
    } finally {
      loading.value = false
    }
  }

  return { reservedCount, prospects, loading, reload }
}
```

> `getRecruitmentRecords` query 參數以 `src/api/recruitment.ts` 實際簽名為準（Step 3 前確認 `has_deposit`/`page_size` key 名）。

- [ ] **Step 4: 跑測試確認通過 + typecheck**

Run: `npx vitest run tests/unit/composables/useClassroomProspects.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/composables/useClassroomProspects.ts tests/unit/composables/useClassroomProspects.test.ts
git commit -m "feat(classroom): useClassroomProspects（班級頁準新生/保留座位資料）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10（前端）：ClassroomStudentDrawer 容量 pill + 準新生區塊

**Files:**
- Modify: `src/components/classroom/ClassroomStudentDrawer.vue`
- Test: `tests/components/ClassroomStudentDrawer.prospects.test.ts`（新檔）

- [ ] **Step 1: 寫失敗測試**

```typescript
// tests/components/ClassroomStudentDrawer.prospects.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import ClassroomStudentDrawer from '@/components/classroom/ClassroomStudentDrawer.vue'

// 回傳「真 ref」：模板 {{ reservedCount }} 才會 auto-unwrap
vi.mock('@/composables/useClassroomProspects', () => ({
  useClassroomProspects: () => ({
    reservedCount: ref(2),
    prospects: ref([{ id: 1, child_name: '準新生甲', source: '官網', has_deposit: true, target_semester: 1 }]),
    loading: ref(false),
    reload: vi.fn().mockResolvedValue(undefined),
  }),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

const classroom = {
  id: 3, name: '小班A', grade_name: '小班', grade_id: 7, school_year: 115, semester: 1, capacity: 30,
  students: [
    { id: 11, name: '在學甲', is_active: true },
    { id: 12, name: '在學乙', is_active: true },
  ],
}

describe('ClassroomStudentDrawer 準新生', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows prospect section and capacity pill with reserved', async () => {
    const wrapper = mount(ClassroomStudentDrawer, {
      props: { visible: true, classroom, loading: false },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('準新生甲')
    expect(text).toMatch(/保留\s*2/)   // pill 顯示保留數
    expect(text).toContain('在學 2')
  })

  it('prospects are NOT counted in active students', async () => {
    const wrapper = mount(ClassroomStudentDrawer, {
      props: { visible: true, classroom, loading: false },
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    // 經 DOM 證明分離：在學數仍為 2（準新生不混入名冊計數），但準新生區塊另列該幼生
    const text = wrapper.text()
    expect(text).toContain('在學 2')        // activeStudents.length 未被準新生灌水
    expect(text).toContain('準新生甲')        // 準新生在獨立區塊呈現
    expect(text).not.toContain('在學 3')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/components/ClassroomStudentDrawer.prospects.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作**

在 `ClassroomStudentDrawer.vue`：
1. `ClassroomProp` interface 補：`grade_id?: number; school_year?: number; semester?: number`
2. `<script setup>` 加：
```typescript
import { computed } from 'vue'   // 若已 import 則合併
import { useClassroomProspects } from '@/composables/useClassroomProspects'

const prospectKey = computed(() => ({
  grade_id: props.classroom?.grade_id ?? null,
  school_year: props.classroom?.school_year ?? null,
  semester: props.classroom?.semester ?? null,
}))
const { reservedCount, prospects, reload: reloadProspects } = useClassroomProspects(prospectKey)

watch(
  () => [props.visible, props.classroom?.id] as const,
  ([v]) => { if (v) void reloadProspects() },
  { immediate: true },
)
```
3. 容量 pill（原 `{{ activeStudents.length }} / {{ classroom.capacity }}`）改：
```vue
        <div class="stat-pill-value">在學 {{ activeStudents.length }} · 保留 {{ reservedCount }} / {{ classroom.capacity }}</div>
```
4. 名冊區下方加準新生摺疊區塊：
```vue
      <el-collapse v-if="prospects.length" class="prospect-section">
        <el-collapse-item :title="`準新生／保留座位（${prospects.length}）— 尚未報到、不計入在學人數`">
          <div v-for="p in prospects" :key="p.id" class="prospect-row">
            <span class="prospect-name">{{ p.child_name }}</span>
            <el-tag size="small" type="info">{{ p.target_semester === 2 ? '下學期' : '上學期' }}</el-tag>
            <span v-if="p.source" class="prospect-source">{{ p.source }}</span>
            <el-tag v-if="p.has_deposit" size="small" type="success">已預繳</el-tag>
          </div>
        </el-collapse-item>
      </el-collapse>
```
（import `ElCollapse, ElCollapseItem, ElTag`；若 `watch`/`computed` 尚未 import 一併補。）

- [ ] **Step 4: 跑測試確認通過 + typecheck**

Run: `npx vitest run tests/components/ClassroomStudentDrawer.prospects.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 確認既有 drawer 測試無回歸**

Run: `npx vitest run tests/unit/views/ClassroomView.test.js src/components/classroom 2>/dev/null; npx vitest run tests/ -t Classroom`
Expected: 既有 Classroom 測試綠

- [ ] **Step 6: Commit**

```bash
git add src/components/classroom/ClassroomStudentDrawer.vue tests/components/ClassroomStudentDrawer.prospects.test.ts
git commit -m "feat(classroom): 班級頁顯示準新生/保留座位（不計入在學人數）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11（前端）：移除招生漏斗 tab（僅移入口）

**Files:**
- Modify: `src/views/RecruitmentView.vue`
- Test: `tests/views/RecruitmentView.noFunnel.test.ts`（新檔）

- [ ] **Step 1: 寫失敗測試**

```typescript
// tests/views/RecruitmentView.noFunnel.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
const src = fs.readFileSync(path.resolve(__dirname, '../../src/views/RecruitmentView.vue'), 'utf-8')

describe('RecruitmentView 移除漏斗 tab', () => {
  it('no funnel tab / FunnelBoard import', () => {
    expect(src).not.toMatch(/name="funnel"/)
    expect(src).not.toContain('FunnelBoard')
  })
  it('keeps overview funnel_snapshot stats (非看板)', () => {
    expect(src).toContain('funnel_snapshot')  // overview 統計卡保留
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/views/RecruitmentView.noFunnel.test.ts`
Expected: FAIL（funnel tab 仍在）

- [ ] **Step 3: 移除**

在 `src/views/RecruitmentView.vue`：
1. 刪除 `<el-tab-pane label="招生漏斗" name="funnel" lazy><FunnelBoard /></el-tab-pane>`
2. 刪除 `import FunnelBoard from '@/components/recruitment/funnel/FunnelBoard.vue'`
3. **不要**動 overview 的 `funnel_snapshot` / `statsFunnelSnapshot`（屬統計彙總卡，非看板）。
4. `grep -n "FunnelBoard\|name=\"funnel\"" src/views/RecruitmentView.vue` 確認無殘留引用。

- [ ] **Step 4: 跑測試確認通過 + typecheck**

Run: `npx vitest run tests/views/RecruitmentView.noFunnel.test.ts && npm run typecheck`
Expected: PASS（typecheck 不得因移除而有 unused import 殘留）

- [ ] **Step 5: Commit**

```bash
git add src/views/RecruitmentView.vue tests/views/RecruitmentView.noFunnel.test.ts
git commit -m "refactor(recruitment): 移除招生漏斗 tab 入口（保留 overview 統計卡）

漏斗端點缺 /api 真實 404 且業主已棄用；funnel 元件/store 暫留，整批刪除另開 cleanup。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12：全套件驗證 + 整合 + 收尾

- [ ] **Step 1: 前端全套件**

Run: `cd ~/Desktop/ivy-frontend/.worktrees/recruit-student-integration-p1-fe && npm run typecheck && npm run test`
Expected: typecheck 0 error；測試相對 main 無新增 fail。

- [ ] **Step 2: 後端相關套件**

Run: `cd ~/Desktop/ivy-backend && .venv/bin/python -m pytest tests/test_recruitment_api.py tests/test_recruitment_records_provisional_fields.py tests/test_recruitment_intake_api.py -q`
Expected: 全綠。

- [ ] **Step 3: 手動整合（需 dev DB upgrade 已跑 + 兩端 dev server `start.sh`）**

驗證流程：
1. 招生統計 →「名額規劃」tab → 設某年級計畫名額 → 儲存 → 數字反映。
2. 招生統計 →「原始明細」→ 某已預繳記錄 →「保留座位」→ 選年級+目標學年 → 確認 → 名額規劃「已保留」+1。
3. 班級頁（該年級／該學年班級）→ 開抽屜 → 容量 pill「保留 N」、準新生區塊出現該幼生；確認在學人數未變。
4. 招生漏斗 tab 已不存在；overview 統計卡仍正常。

- [ ] **Step 4: finishing-a-development-branch**

兩 repo 各自 `--no-ff` merge 回各自 local main（workspace「merge local main、稍後 push」慣例），當天 `git worktree remove`。後端先、前端後（drift CI：schema.d.ts 對齊後端）。**未授權不 push**。

---

## Self-Review 對照（spec coverage）

- spec §4 後端 3 欄 → Task 1 ✓
- spec §5A api 層 → Task 3 ✓；codegen → Task 2 ✓
- spec §5B 名額規劃面板 → Task 4 + 5 ✓
- spec §5C 保留座位入口 → Task 6 + 7 + 8 ✓
- spec §5D 班級頁準新生 → Task 9 + 10 ✓
- spec §5E 移除漏斗 tab → Task 11 ✓
- spec §7 測試（含「準新生不計入在學」防回歸） → Task 10 Step 1 ✓
- spec §8 前置（node_modules/dev DB/codegen 順序） → 前置區 + Task 2/12 ✓
