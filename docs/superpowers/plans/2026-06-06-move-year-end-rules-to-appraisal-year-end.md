# 將「年終規則」搬到考核與年終 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「年終規則」從 `薪資設定`（`BonusConfigPanel.vue`）抽成獨立的 `YearEndRulesPanel.vue`，掛為「考核與年終」第 4 個分頁，並從薪資設定完全移除。

**Architecture:** 純前端搬移。年終規則三張卡（才藝鼓勵／學期紅利／考勤扣款）的狀態與儲存從 `BonusConfigPanel` 解耦成獨立元件，自取資料、自帶儲存。後端 `PUT /config/bonus` 為部分更新（複製舊版本全欄位 → 只套用有送的欄位），故新面板只送年終欄位 + reason，其他薪資設定後端自動保留。**後端／DB 零改動。**

**Tech Stack:** Vue 3 `<script setup lang="ts">`、Element Plus、Vitest、@vue/test-utils。

**基底：** `origin/main` @ `462737df`；分支 `feat/move-year-end-rules-2026-06-06-fe`；worktree `.worktrees/year-end-rules-move`。

**所有指令的工作目錄：** `~/Desktop/ivy-frontend/.worktrees/year-end-rules-move`

---

## File Structure

| 檔案 | 動作 | 責任 |
|------|------|------|
| `src/views/yearEnd/YearEndRulesPanel.vue` | Create | 年終規則三張卡 + 自取/自存（只送年終欄位 + reason） |
| `src/views/yearEnd/__tests__/YearEndRulesPanel.spec.ts` | Create | 新面板 load/save/add-remove 單元測試（自 BonusConfigPanel 搬入並改寫） |
| `src/views/salary/BonusConfigPanel.vue` | Modify | 移除年終 tab 與所有年終狀態/函式 |
| `src/views/salary/__tests__/BonusConfigPanel.spec.ts` | Modify | 移除「年終規則」describe |
| `src/views/AppraisalYearEndView.vue` | Modify | 加第 4 個分頁 `year-end-rules`，掛 `YearEndRulesPanel` |
| `src/views/__tests__/AppraisalYearEndView.spec.ts` | Modify | 補新 section 在 `SETTINGS_READ` 下可見並渲染 |
| `src/views/yearEnd/YearEndConfigView.vue` | Modify | 更新「獎金標準/扣款費率」導引文案（年終費率改指新位置） |

---

## Task 1: 建立 `YearEndRulesPanel.vue` 元件（先測試，後實作）

**Files:**
- Create: `src/views/yearEnd/YearEndRulesPanel.vue`
- Create: `src/views/yearEnd/__tests__/YearEndRulesPanel.spec.ts`

- [ ] **Step 1: 寫失敗測試 `YearEndRulesPanel.spec.ts`**

建立 `src/views/yearEnd/__tests__/YearEndRulesPanel.spec.ts`，內容如下（自 BonusConfigPanel 年終測試改寫：mock 不需 grade/position/title 輔助 API；reactive 由 `bonusConfig` 改名 `rules`；存檔函式 `saveBonusConfig` 改名 `saveRules`）：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import YearEndRulesPanel from '../YearEndRulesPanel.vue'

vi.mock('@/api/config', () => ({
  getBonusConfig: vi.fn(),
  updateBonusConfig: vi.fn(),
}))

vi.mock('@/api/employees', () => ({
  getEmployees: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { prompt: vi.fn() },
  }
})

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn().mockReturnValue(true),
}))

import * as configApi from '@/api/config'
import * as employeesApi from '@/api/employees'
import { ElMessageBox } from 'element-plus'

type PanelVm = {
  afterClassAwardRows: { className: string; price: number }[]
  artTeacherEmployeeIds: number[]
  employeeOptions: { id: number; name: unknown }[]
  rules: Record<string, unknown>
  addAfterClassAwardRow: () => void
  removeAfterClassAwardRow: (i: number) => void
  saveRules: () => Promise<void>
}

function stubEmployees() {
  vi.mocked(employeesApi.getEmployees).mockResolvedValue({
    data: [
      { id: 7, name: '林老師' },
      { id: 9, name: '王老師' },
    ],
  } as never)
}

async function mountPanel() {
  const wrapper = mount(YearEndRulesPanel, {
    global: {
      stubs: {
        'el-button': true,
        'el-card': true,
        'el-alert': true,
        'el-divider': true,
        'el-empty': true,
        'el-row': true,
        'el-col': true,
        'el-form-item': true,
        'el-input': true,
        'el-input-number': true,
        'el-select': true,
        'el-option': true,
        'el-tooltip': true,
      },
    },
  })
  await nextTick()
  await nextTick()
  return wrapper
}

describe('YearEndRulesPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('load: dict → afterClassAwardRows，list → artTeacherEmployeeIds', async () => {
    vi.mocked(configApi.getBonusConfig).mockResolvedValue({
      data: {
        art_teacher_unit_price: 30,
        after_class_award_unit_price: { 美術班: 50, 律動班: 40 },
        art_teacher_employee_ids: [7, 9],
        dividend_returning_threshold: 0.8,
        late_deduction_per_time: 50,
      },
    } as never)
    stubEmployees()

    const wrapper = await mountPanel()
    const vm = wrapper.vm as unknown as PanelVm

    expect(vm.afterClassAwardRows).toEqual([
      { className: '美術班', price: 50 },
      { className: '律動班', price: 40 },
    ])
    expect(vm.artTeacherEmployeeIds).toEqual([7, 9])
    expect(vm.rules.art_teacher_unit_price).toBe(30)
    expect(vm.rules.dividend_returning_threshold).toBe(0.8)
    expect(vm.employeeOptions).toHaveLength(2)
  })

  it('load: 缺 JSON 欄位時 graceful 退成空（不炸）', async () => {
    vi.mocked(configApi.getBonusConfig).mockResolvedValue({
      data: { art_teacher_unit_price: 0 },
    } as never)
    stubEmployees()

    const wrapper = await mountPanel()
    const vm = wrapper.vm as unknown as PanelVm

    expect(vm.afterClassAwardRows).toEqual([])
    expect(vm.artTeacherEmployeeIds).toEqual([])
  })

  it('save: afterClassAwardRows → dict（略過空班名）、ids → list，並帶 reason', async () => {
    vi.mocked(configApi.getBonusConfig).mockResolvedValue({
      data: { after_class_award_unit_price: {}, art_teacher_employee_ids: [] },
    } as never)
    stubEmployees()
    vi.mocked(configApi.updateBonusConfig).mockResolvedValue({ data: {} } as never)
    vi.mocked(ElMessageBox.prompt).mockResolvedValue({ value: '年終規則設定調整測試' } as never)

    const wrapper = await mountPanel()
    const vm = wrapper.vm as unknown as PanelVm

    vm.afterClassAwardRows.push({ className: '美術班', price: 60 })
    vm.afterClassAwardRows.push({ className: '   ', price: 99 }) // 空白班名應略過
    vm.artTeacherEmployeeIds.push(7)
    await nextTick()

    await vm.saveRules()

    expect(configApi.updateBonusConfig).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(configApi.updateBonusConfig).mock.calls[0][0] as Record<
      string,
      unknown
    >
    expect(payload.after_class_award_unit_price).toEqual({ 美術班: 60 })
    expect(payload.art_teacher_employee_ids).toEqual([7])
    expect(payload.reason).toBe('年終規則設定調整測試')
    // 確認只送年終欄位、不帶超額/節慶/底薪（後端部分更新會保留）
    expect(payload.overtime_head_normal).toBeUndefined()
    expect(payload.principal_festival).toBeUndefined()
  })

  it('add / remove afterClassAwardRow', async () => {
    vi.mocked(configApi.getBonusConfig).mockResolvedValue({
      data: { after_class_award_unit_price: { 美術班: 50 } },
    } as never)
    stubEmployees()

    const wrapper = await mountPanel()
    const vm = wrapper.vm as unknown as PanelVm

    expect(vm.afterClassAwardRows).toHaveLength(1)
    vm.addAfterClassAwardRow()
    expect(vm.afterClassAwardRows).toHaveLength(2)
    vm.removeAfterClassAwardRow(0)
    expect(vm.afterClassAwardRows).toEqual([{ className: '', price: 0 }])
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm run test -- src/views/yearEnd/__tests__/YearEndRulesPanel.spec.ts`
Expected: FAIL（`Failed to resolve import "../YearEndRulesPanel.vue"` — 元件尚未建立）

> 註：專案 vitest script 為 `test`（`vitest run`）；額外參數經 `--` 傳給 vitest，等同 `npx vitest run <path>`。

- [ ] **Step 3: 建立元件 `YearEndRulesPanel.vue`**

建立 `src/views/yearEnd/YearEndRulesPanel.vue`，完整內容如下：

```vue
<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue'
import { getBonusConfig, updateBonusConfig } from '@/api/config'
import { getEmployees } from '@/api/employees'
import type { ApiBody } from '@/api/_generated/typed'
import { ElMessage, ElMessageBox } from 'element-plus'
import { hasPermission } from '@/utils/auth'

const loading = ref(false)
const canRead = computed(() => hasPermission('SETTINGS_READ'))

// 年終規則欄位（型別對齊 ApiBody<'/config/bonus','put'> 的年終子集）
const rules = reactive({
  // ① 才藝鼓勵
  art_teacher_unit_price: 0,
  // ④ 學期紅利門檻/金額
  dividend_returning_threshold: 0,
  dividend_returning_amount: 500,
  dividend_activity_threshold: 0,
  dividend_activity_amount: 1000,
  // ⑤ 考勤扣款費率
  late_deduction_per_time: 50,
  missing_punch_deduction_per_time: 50,
  personal_leave_deduction_per_day: 500,
  sick_leave_deduction_per_day: 500,
})

// 只從後端回應抓取年終數值欄位（其餘 BonusConfig 欄位不入此面板）
const RULE_FIELDS = [
  'art_teacher_unit_price',
  'dividend_returning_threshold',
  'dividend_returning_amount',
  'dividend_activity_threshold',
  'dividend_activity_amount',
  'late_deduction_per_time',
  'missing_punch_deduction_per_time',
  'personal_leave_deduction_per_day',
  'sick_leave_deduction_per_day',
] as const

// 課後才藝班年終單價（班名 → 單價），動態 key-value 列
type AfterClassAwardEntry = { className: string; price: number }
const afterClassAwardRows = ref<AfterClassAwardEntry[]>([])
// 才藝老師年終收款人 employee id list
const artTeacherEmployeeIds = ref<number[]>([])

type EmployeeOption = { id: number; name: unknown }
const employeeOptions = ref<EmployeeOption[]>([])

const fetchRules = async () => {
  loading.value = true
  try {
    const response = await getBonusConfig()
    const data = response.data as Record<string, unknown>
    for (const f of RULE_FIELDS) {
      const v = data[f]
      if (v !== undefined && v !== null) {
        ;(rules as Record<string, unknown>)[f] = v
      }
    }
    const dict = data.after_class_award_unit_price
    afterClassAwardRows.value =
      dict && typeof dict === 'object'
        ? Object.entries(dict as Record<string, unknown>).map(([className, price]) => ({
            className,
            price: Number(price) || 0,
          }))
        : []
    const ids = data.art_teacher_employee_ids
    artTeacherEmployeeIds.value = Array.isArray(ids) ? ids.map((i) => Number(i)) : []
  } catch {
    ElMessage.error('年終規則載入失敗')
  } finally {
    loading.value = false
  }
}

const fetchEmployeeOptions = async () => {
  try {
    const res = await getEmployees({ is_active: true } as Parameters<typeof getEmployees>[0])
    employeeOptions.value = (res.data as EmployeeOption[]).filter((e) => e.id != null)
  } catch {
    // 非致命：下拉退化但其餘欄位仍可編輯
    ElMessage.warning('員工清單載入失敗，才藝老師選擇可能不完整')
  }
}

const addAfterClassAwardRow = () => {
  afterClassAwardRows.value.push({ className: '', price: 0 })
}

const removeAfterClassAwardRow = (index: number) => {
  afterClassAwardRows.value.splice(index, 1)
}

const saveRules = async () => {
  // 與 BonusConfig PUT 對齊：變更影響全員年終規則，要求異動原因 ≥10 字（落 audit）。
  let reason
  try {
    const result = await ElMessageBox.prompt(
      '此變更會影響全員年終規則，請輸入異動原因（至少 10 個字）：',
      '年終規則變更原因',
      {
        confirmButtonText: '確認儲存',
        cancelButtonText: '取消',
        inputType: 'textarea',
        inputValidator: (val) => {
          if (!val || val.trim().length < 10) {
            return '原因至少 10 個字'
          }
          return true
        },
      },
    )
    reason = (result as { value: string }).value.trim()
  } catch {
    return // 使用者按取消
  }

  // 年終 JSON 欄位序列化：dict（班名→單價，略過空班名）+ id list
  const afterClassAwardDict: Record<string, number> = {}
  for (const row of afterClassAwardRows.value) {
    const name = row.className.trim()
    if (name) afterClassAwardDict[name] = Number(row.price) || 0
  }
  // 只送年終欄位；後端 PUT /config/bonus 為部分更新，會保留超額/節慶/底薪等其他設定。
  const payload: ApiBody<'/config/bonus', 'put'> & { reason: string } = {
    ...rules,
    after_class_award_unit_price: afterClassAwardDict,
    art_teacher_employee_ids: [...artTeacherEmployeeIds.value],
    reason,
  }

  loading.value = true
  try {
    await updateBonusConfig(payload)
    ElMessage.success('年終規則已儲存')
  } catch (error) {
    const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
    ElMessage.error(typeof detail === 'string' ? detail : '年終規則儲存失敗')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (!canRead.value) return
  fetchRules()
  fetchEmployeeOptions()
})
</script>

<template>
  <div v-if="canRead" v-loading="loading">
    <div class="rules-actions">
      <el-button type="primary" size="large" @click="saveRules">儲存年終規則</el-button>
    </div>

    <p class="desc-text">
      年終獎金 E化引擎使用以下規則自動推導：才藝鼓勵金、學期紅利門檻、考勤扣款費率。
      設定後於年終結算「建立」階段套用，個別金額仍可在總表手動覆寫。
    </p>

    <!-- ① 才藝鼓勵 -->
    <div class="section-title">才藝鼓勵</div>
    <el-card class="box-card mb-6" shadow="never">
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item>
            <template #label>
              <el-tooltip content="才藝老師年終單價：每位收款人得「全校總人次 × 單價」" placement="top">
                <span>才藝老師單價</span>
              </el-tooltip>
            </template>
            <el-input-number
              v-model="rules.art_teacher_unit_price"
              :min="0" :step="10"
              controls-position="right" style="width: 100%"
            />
            <span class="unit-hint">元 / 人次</span>
          </el-form-item>
        </el-col>
      </el-row>

      <el-divider />
      <div class="label mb-2">課後才藝班年終單價（班名 → 單價）</div>
      <p class="desc-text">每個課後才藝班的年終鼓勵金單價，依班名對應。新增班別後填入單價。</p>
      <div
        v-for="(row, idx) in afterClassAwardRows"
        :key="idx"
        class="kv-row"
      >
        <el-input
          v-model="row.className"
          placeholder="班名（如：美術班）"
          style="flex: 1"
        />
        <el-input-number
          v-model="row.price"
          :min="0" :step="10"
          controls-position="right"
          style="width: 160px"
          placeholder="單價"
        />
        <el-button
          type="danger"
          link
          @click="removeAfterClassAwardRow(idx)"
        >移除</el-button>
      </div>
      <el-empty
        v-if="afterClassAwardRows.length === 0"
        description="尚未設定任何課後才藝班單價"
        :image-size="48"
      />
      <el-button class="mt-2" @click="addAfterClassAwardRow">+ 新增班別</el-button>

      <el-divider />
      <el-form-item label="才藝老師（年終收款人）">
        <el-select
          v-model="artTeacherEmployeeIds"
          multiple
          filterable
          clearable
          placeholder="選擇才藝老師（每位得全校總人次 × 單價）"
          style="width: 100%"
        >
          <el-option
            v-for="emp in employeeOptions"
            :key="emp.id"
            :label="String(emp.name)"
            :value="emp.id"
          />
        </el-select>
      </el-form-item>
    </el-card>

    <!-- ④ 學期紅利 -->
    <div class="section-title">學期紅利</div>
    <el-card class="box-card mb-6" shadow="never">
      <p class="desc-text">舊生率 / 才藝率達門檻時，發放對應紅利。門檻為 0–1 小數（例：0.8 = 80%）。</p>
      <el-row :gutter="20">
        <el-col :span="6">
          <el-form-item>
            <template #label>
              <el-tooltip content="舊生率達此門檻發放紅利（0–1 小數）" placement="top">
                <span>舊生率門檻</span>
              </el-tooltip>
            </template>
            <el-input-number
              v-model="rules.dividend_returning_threshold"
              :min="0" :max="1" :step="0.05" :precision="2"
              controls-position="right" style="width: 100%"
            />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="舊生率紅利">
            <el-input-number
              v-model="rules.dividend_returning_amount"
              :min="0" :step="100"
              controls-position="right" style="width: 100%"
            />
            <span class="unit-hint">元</span>
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item>
            <template #label>
              <el-tooltip content="才藝率達此門檻發放紅利（0–1 小數）" placement="top">
                <span>才藝率門檻</span>
              </el-tooltip>
            </template>
            <el-input-number
              v-model="rules.dividend_activity_threshold"
              :min="0" :max="1" :step="0.05" :precision="2"
              controls-position="right" style="width: 100%"
            />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="才藝率紅利">
            <el-input-number
              v-model="rules.dividend_activity_amount"
              :min="0" :step="100"
              controls-position="right" style="width: 100%"
            />
            <span class="unit-hint">元</span>
          </el-form-item>
        </el-col>
      </el-row>
    </el-card>

    <!-- ⑤ 考勤扣款 -->
    <div class="section-title">考勤扣款</div>
    <el-card class="box-card" shadow="never">
      <p class="desc-text">年終結算時依考勤紀錄扣款的費率設定。</p>
      <el-row :gutter="20">
        <el-col :span="6">
          <el-form-item label="遲到（每次）">
            <el-input-number
              v-model="rules.late_deduction_per_time"
              :min="0" :max="50000" :step="10"
              controls-position="right" style="width: 100%"
            />
            <span class="unit-hint">元 / 次</span>
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="未打卡（每次）">
            <el-input-number
              v-model="rules.missing_punch_deduction_per_time"
              :min="0" :max="50000" :step="10"
              controls-position="right" style="width: 100%"
            />
            <span class="unit-hint">元 / 次</span>
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="事假（每日）">
            <el-input-number
              v-model="rules.personal_leave_deduction_per_day"
              :min="0" :max="50000" :step="50"
              controls-position="right" style="width: 100%"
            />
            <span class="unit-hint">元 / 日</span>
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="病假（每日）">
            <el-input-number
              v-model="rules.sick_leave_deduction_per_day"
              :min="0" :max="50000" :step="50"
              controls-position="right" style="width: 100%"
            />
            <span class="unit-hint">元 / 日</span>
          </el-form-item>
        </el-col>
      </el-row>
    </el-card>
  </div>
  <el-alert v-else type="warning" :closable="false" show-icon title="目前帳號沒有查看年終規則的權限" />
</template>

<style scoped>
.rules-actions {
  margin-bottom: var(--space-4);
  text-align: right;
}
.section-title {
  font-size: var(--text-lg);
  font-weight: bold;
  margin: var(--space-5) 0 10px 0;
  color: var(--neutral-300);
  border-left: 4px solid var(--color-info);
  padding-left: 10px;
}
.box-card {
  background-color: #2b303b;
  border: 1px solid #4c4d4f;
  color: #fff;
}
.label {
  margin-bottom: 5px;
  font-size: var(--text-base);
  color: var(--text-tertiary);
}
.desc-text {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  line-height: 1.6;
  margin-bottom: 15px;
}
.mt-2 { margin-top: var(--space-2, 8px); }
.mb-2 { margin-bottom: var(--space-2, 8px); }
.mb-6 { margin-bottom: var(--space-6); }
.kv-row {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  margin-bottom: var(--space-2, 8px);
}
.unit-hint {
  margin-left: var(--space-2, 8px);
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}
</style>
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm run test -- src/views/yearEnd/__tests__/YearEndRulesPanel.spec.ts`
Expected: PASS（4 個 it 全綠）

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: 0 error（若報 `rules` index 寫入型別問題，確認 `(rules as Record<string, unknown>)[f] = v` 已加 cast）

- [ ] **Step 6: commit**

```bash
git add src/views/yearEnd/YearEndRulesPanel.vue src/views/yearEnd/__tests__/YearEndRulesPanel.spec.ts
git commit -m "feat(year-end): 新增 YearEndRulesPanel 年終規則獨立面板

從 BonusConfigPanel 抽出年終規則三張卡（才藝鼓勵/學期紅利/考勤扣款），
自取 /config/bonus、只送年終欄位 + reason（後端部分更新保留其他設定）。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 從 `BonusConfigPanel.vue` 移除年終規則

**Files:**
- Modify: `src/views/salary/BonusConfigPanel.vue`
- Modify: `src/views/salary/__tests__/BonusConfigPanel.spec.ts`

- [ ] **Step 1: 移除年終 tab 的 template（781–965 行）**

刪除整段 `<!-- 年終獎金 E化 階段 2：年終規則 -->` 起、到對應 `</el-tab-pane>` 止（含註解，原 781–965 行）。刪除後 `職稱等級對應` 的 `</el-tab-pane>`（原 779 行）下一行即為 `</el-tabs>`。

- [ ] **Step 2: 移除年終狀態與函式（script 區）**

依序刪除以下片段：

1. import（原 4 行）：`import { getEmployees } from '@/api/employees'`
2. `bonusConfig` reactive 內的年終欄位（原 37–49 行整段，含 `// 年終獎金 E化 階段 2：年終規則` 註解到 `sick_leave_deduction_per_day: 500,`）：

```ts
  // 年終獎金 E化 階段 2：年終規則
  // ① 才藝鼓勵
  art_teacher_unit_price: 0,
  // ④ 學期紅利門檻/金額
  dividend_returning_threshold: 0,
  dividend_returning_amount: 500,
  dividend_activity_threshold: 0,
  dividend_activity_amount: 1000,
  // ⑤ 考勤扣款費率
  late_deduction_per_time: 50,
  missing_punch_deduction_per_time: 50,
  personal_leave_deduction_per_day: 500,
  sick_leave_deduction_per_day: 500,
```

3. 年終 JSON 欄位宣告（原 52–60 行）：

```ts
// 年終規則 JSON 欄位（型別對齊 ApiBody<'/config/bonus','put'>）
// 課後才藝班年終單價（班名 → 單價），用動態 key-value 列編輯器
type AfterClassAwardEntry = { className: string; price: number }
const afterClassAwardRows = ref<AfterClassAwardEntry[]>([])
// 才藝老師年終收款人 employee id list，用員工多選
const artTeacherEmployeeIds = ref<number[]>([])

type EmployeeOption = { id: number; name: unknown }
const employeeOptions = ref<EmployeeOption[]>([])
```

4. `fetchBonusConfig` 內年終 JSON 轉換段（原 70–80 行，註解 `// JSON 欄位轉成編輯器結構…` 到 `artTeacherEmployeeIds.value = …`）：

```ts
    // JSON 欄位轉成編輯器結構（dict → 動態列；list → 多選 v-model）
    const dict = data.after_class_award_unit_price
    afterClassAwardRows.value =
      dict && typeof dict === 'object'
        ? Object.entries(dict as Record<string, unknown>).map(([className, price]) => ({
            className,
            price: Number(price) || 0,
          }))
        : []
    const ids = data.art_teacher_employee_ids
    artTeacherEmployeeIds.value = Array.isArray(ids) ? ids.map((i) => Number(i)) : []
```

5. `fetchEmployeeOptions` 整個函式（原 88–96 行）：

```ts
const fetchEmployeeOptions = async () => {
  try {
    const res = await getEmployees({ is_active: true } as Parameters<typeof getEmployees>[0])
    employeeOptions.value = (res.data as EmployeeOption[]).filter((e) => e.id != null)
  } catch {
    // 非致命：下拉選單退化但其餘欄位仍可編輯
    ElMessage.warning('員工清單載入失敗，才藝老師選擇可能不完整')
  }
}
```

6. `addAfterClassAwardRow` / `removeAfterClassAwardRow`（原 98–104 行）：

```ts
const addAfterClassAwardRow = () => {
  afterClassAwardRows.value.push({ className: '', price: 0 })
}

const removeAfterClassAwardRow = (index: number) => {
  afterClassAwardRows.value.splice(index, 1)
}
```

7. `saveBonusConfig` 內 payload（原 143–154 行）：把年終 dict 序列化與 payload 的兩個 JSON 欄位移除。將：

```ts
  // 年終 JSON 欄位序列化：dict（班名→單價，略過空班名）+ id list
  const afterClassAwardDict: Record<string, number> = {}
  for (const row of afterClassAwardRows.value) {
    const name = row.className.trim()
    if (name) afterClassAwardDict[name] = Number(row.price) || 0
  }
  const payload: ApiBody<'/config/bonus', 'put'> & { reason: string } = {
    ...bonusConfig,
    after_class_award_unit_price: afterClassAwardDict,
    art_teacher_employee_ids: [...artTeacherEmployeeIds.value],
    reason,
  }
```

改為：

```ts
  const payload: ApiBody<'/config/bonus', 'put'> & { reason: string } = {
    ...bonusConfig,
    reason,
  }
```

8. `onMounted` 內移除 `fetchEmployeeOptions()` 呼叫（原 328 行那一行）。

- [ ] **Step 3: 跑 typecheck + lint 確認無殘留引用**

Run: `npm run typecheck`
Expected: 0 error（若報 `getEmployees`/`afterClassAwardRows`/`employeeOptions`/`ApiBody` 未使用或未定義，表示有殘留，回 Step 2 清乾淨）

Run: `grep -n "afterClassAward\|artTeacherEmployeeIds\|employeeOptions\|getEmployees\|art_teacher_unit_price\|dividend_\|late_deduction\|missing_punch\|personal_leave_deduction\|sick_leave_deduction" src/views/salary/BonusConfigPanel.vue`
Expected: 無輸出（年終相關引用已全數移除）

- [ ] **Step 4: 移除 `BonusConfigPanel.spec.ts` 的年終 describe**

刪除 `describe('BonusConfigPanel 年終規則', () => { … })` 整段（原 97–183 行）。同時清掉只服務年終測試而其餘測試未用的 import/helper：若刪除後 `employeesApi`、`ElMessageBox`、`stubAuxApis` 內 `getEmployees` mock、`PanelVm` 等已無其他使用者，一併移除以免 `noUnusedLocals` 報錯。

> 註：刪除後 `BonusConfigPanel.spec.ts` 若僅剩此一個 describe（年終），會變成空測試檔。先 `grep -n "describe(" src/views/salary/__tests__/BonusConfigPanel.spec.ts` 確認是否還有其他 describe：
> - 若有其他 describe → 只刪年終 describe + 清未使用 import。
> - 若年終是唯一 describe → 整個 spec 檔已無內容可測，直接 `git rm src/views/salary/__tests__/BonusConfigPanel.spec.ts`（年終測試已搬至 Task 1 的新檔）。

- [ ] **Step 5: 跑 BonusConfigPanel 測試 + typecheck**

Run: `npm run test -- src/views/salary/__tests__/BonusConfigPanel.spec.ts`（若檔案已刪則跳過）
Expected: PASS（剩餘測試全綠）

Run: `npm run typecheck`
Expected: 0 error

- [ ] **Step 6: commit**

```bash
git add src/views/salary/BonusConfigPanel.vue src/views/salary/__tests__/BonusConfigPanel.spec.ts
git commit -m "refactor(salary): 從薪資設定移除年終規則 tab（已搬至 YearEndRulesPanel）

移除 BonusConfigPanel 的年終 tab 與相關狀態/函式；payload 不再帶年終 JSON 欄位。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 掛進「考核與年終」`AppraisalYearEndView.vue`

**Files:**
- Modify: `src/views/AppraisalYearEndView.vue`
- Modify: `src/views/__tests__/AppraisalYearEndView.spec.ts`

- [ ] **Step 1: 補 AppraisalYearEndView 測試（新 section）**

在 `src/views/__tests__/AppraisalYearEndView.spec.ts` 的 `stubs` 物件加入新元件 stub：

```ts
  YearEndRulesPanel: { name: 'YearEndRulesPanel', template: '<div class="stub-year-end-rules" />' },
```

並在 `describe('AppraisalYearEndView shell', …)` 內新增測試：

```ts
  it('SETTINGS_READ → 出現「年終規則」section 並可渲染', () => {
    const w = mountWith(['SETTINGS_READ'], { section: 'year-end-rules' })
    const seg = w.findComponent({ name: 'ElSegmented' })
    const opts = seg.props('options') as { label: string; value: string }[]
    expect(opts.some((o) => o.value === 'year-end-rules' && o.label === '年終規則')).toBe(true)
    expect(w.find('.stub-year-end-rules').exists()).toBe(true)
  })

  it('只有 YEAR_END_READ（無 SETTINGS_READ）→ 不出現年終規則 section', () => {
    const w = mountWith(['YEAR_END_READ'])
    const seg = w.findComponent({ name: 'ElSegmented' })
    const opts = seg.props('options') as { label: string; value: string }[]
    expect(opts.some((o) => o.value === 'year-end-rules')).toBe(false)
  })
```

- [ ] **Step 2: 跑測試確認新案例失敗**

Run: `npm run test -- src/views/__tests__/AppraisalYearEndView.spec.ts`
Expected: FAIL（`SETTINGS_READ → 出現「年終規則」section` 失敗：section 尚未加入）

- [ ] **Step 3: 在 AppraisalYearEndView 加入新 section**

3a. `SectionKey` 型別（原 10 行）改為：

```ts
type SectionKey = 'appraisal' | 'year-end' | 'payout' | 'year-end-rules'
```

3b. async 元件 import（原 6–8 行區塊）末尾加：

```ts
const YearEndRulesPanel = defineAsyncComponent(() => import('./yearEnd/YearEndRulesPanel.vue'))
```

3c. `ALL_SECTIONS` 陣列末尾（`payout` 那行之後）加：

```ts
  { key: 'year-end-rules', label: '年終規則', can: () => hasPermission('SETTINGS_READ') },
```

3d. template 的 `.section-body` 內，於 `AppraisalPayoutView` 那行之後、`el-empty` 之前加：

```html
      <YearEndRulesPanel v-else-if="activeSection === 'year-end-rules'" />
```

- [ ] **Step 4: 跑測試 + typecheck 確認通過**

Run: `npm run test -- src/views/__tests__/AppraisalYearEndView.spec.ts`
Expected: PASS（含新增 2 案例 + 原有 7 案例全綠）

Run: `npm run typecheck`
Expected: 0 error

- [ ] **Step 5: commit**

```bash
git add src/views/AppraisalYearEndView.vue src/views/__tests__/AppraisalYearEndView.spec.ts
git commit -m "feat(appraisal-year-end): 新增「年終規則」分頁掛 YearEndRulesPanel

考核與年終第 4 個 segmented 分頁，SETTINGS_READ 可見（與原薪資設定一致，零權限變動）。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 更新 `YearEndConfigView.vue` 導引文案

**Files:**
- Modify: `src/views/yearEnd/YearEndConfigView.vue:393-414`

- [ ] **Step 1: 更新「獎金標準 / 扣款費率」導引段**

把原 393–414 行該 `el-card` 內容（`title="才藝/教課單價、考核基準獎金、遲到/事病假費率等設定"` 的 `el-alert` 與「前往薪資管理（薪資設定 tab）」按鈕）改為反映拆分：

```html
      <template #header>
        <span class="section-title">獎金標準 / 扣款費率</span>
      </template>
      <el-alert
        title="年終費率（才藝鼓勵、學期紅利門檻、遲到/事病假扣款）已移至「考核與年終 → 年終規則」；節慶基準獎金仍在「薪資管理 → 薪資設定」。"
        type="info"
        :closable="false"
        show-icon
        class="bonus-hint"
      />
      <div class="bonus-link-row">
        <el-button
          type="primary"
          plain
          @click="router.push({ path: '/appraisal-year-end', query: { section: 'year-end-rules' } })"
        >
          前往年終規則設定
        </el-button>
        <span class="field-hint">才藝/學期紅利/考勤扣款費率於此編輯；節慶基準獎金請至薪資設定分頁</span>
      </div>
    </el-card>
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 0 error

- [ ] **Step 3: commit**

```bash
git add src/views/yearEnd/YearEndConfigView.vue
git commit -m "docs(year-end): 更新本期設定導引文案，年終費率改指年終規則分頁

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: 全面驗證

**Files:** 無（驗證 only）

- [ ] **Step 1: 跑所有相關測試**

Run:
```bash
npm run test -- src/views/yearEnd/__tests__/YearEndRulesPanel.spec.ts src/views/__tests__/AppraisalYearEndView.spec.ts src/views/salary/__tests__/BonusConfigPanel.spec.ts
```
Expected: 全綠（BonusConfigPanel spec 若已刪則自動略過）

- [ ] **Step 2: typecheck + lint（全專案）**

Run: `npm run typecheck`
Expected: 0 error

Run: `npm run lint`
Expected: 0 error（no-explicit-any / ban-ts-comment gate）

- [ ] **Step 3: grep 防漂移最終確認**

Run: `grep -rn "art_teacher_unit_price\|afterClassAwardRows\|artTeacherEmployeeIds" src/views/salary/`
Expected: 無輸出（薪資設定已無年終殘留）

Run: `grep -rn "year-end-rules" src/views/AppraisalYearEndView.vue src/constants/permissions.ts`
Expected: AppraisalYearEndView 有；permissions.ts 不需新增規則（路由 `/appraisal-year-end` 已含 SETTINGS_READ，section 內層自控）

- [ ] **Step 4: 手動整合驗證（dev server）**

依 workspace 慣例啟動 dev server（注意：worktree 第二個前端 dev server 用 3000 `--strictPort` 避 CORS；node_modules symlink 若失效需重建絕對 symlink，見 memory）。以管理員登入，逐項確認：
1. `薪資計算 → 薪資設定`：只剩 超額獎金 / 節慶獎金 / 職位標準底薪 / 職稱等級對應（無「年終規則」tab）。
2. `考核與年終`：末尾出現「年終規則」分頁，三張卡（才藝鼓勵 / 學期紅利 / 考勤扣款）正常渲染。
3. 在年終規則改一個值（如才藝老師單價）→ 儲存 → 填 ≥10 字原因 → 成功；重整後值保留。
4. 回 `薪資計算 → 薪資設定` 改一個節慶值 → 儲存 → 確認**年終規則的值未被洗掉**（部分更新驗證）。
5. `年終本期設定`（`/year_end/cycles/:id/config`）導引按鈕點擊跳到 `年終規則` 分頁。

- [ ] **Step 5: 收尾**

確認 `git log --oneline origin/main..HEAD` 為 4–5 個 commit（spec/plan + Task1–4）。依 workspace 收尾紀律，push 與 worktree 清理由使用者確認後執行（見 `scripts/finish-check.sh`）。

---

## Self-Review 紀錄

- **Spec coverage**：spec 五大項（新元件 / 移除來源 / 掛入分頁 / 連帶清理 / 測試）對應 Task 1–5，無遺漏。權限決策（SETTINGS_READ 零變動）落在 Task 3 Step 3c + 測試。
- **Placeholder scan**：無 TBD/TODO；所有 code step 皆含完整程式碼。
- **Type/命名一致**：新元件 reactive 為 `rules`、save 為 `saveRules`、可見閘 `canRead`；測試 `PanelVm` 與 Step 3 程式碼一致；`RULE_FIELDS` 與 `rules` 鍵一致。
- **指令已對齊 package.json**：`test`(`vitest run`) / `typecheck`(`vue-tsc --noEmit`) / `lint`(`eslint .`)，計畫全程使用。
- **已知彈性點**：`BonusConfigPanel.spec.ts` 是否整檔刪除於 Task 2 Step 4 以條件分支處理。
