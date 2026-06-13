# 招生入學流程併入學生模組 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/recruitment` 招生統計巨頁重構為學生模組下的 `/students/admissions`「招生入學」頁——漏斗看板為主畫面、統計收為次級分頁，並在班級卡顯示準新生保留數。

**Architecture:** 純前端重組（後端零改動）。`AdmissionsView` 持有共用的 `useRecruitmentDashboard`（stats/options 單次抓取）並以單一 `dashboard` prop 下發給兩個 panel；`AdmissionsRecordsPanel`（訪視明細+CRUD dialogs）與 `RecruitmentStatsPanel`（8 個統計次分頁）各自持有區域狀態；跨 tab 下鑽走 emit → 父層切 tab + filterPatch prop。轉化改打 funnel transition（棄用舊 convert 端點呼叫）。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、Element Plus、Pinia（既有 recruitmentFunnel store）、vue-chartjs（lazy）、Vitest + VTU。

**Spec:** `docs/superpowers/specs/2026-06-13-admissions-into-students-module-design.md`

---

## 執行環境（每個 task 開始前先讀這段）

- **工作目錄**：`/Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions`（git worktree）
- **分支**：`feat/admissions-students-2026-06-13-fe`（每個 task 開頭跑 `git -C /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions branch --show-current` 驗證）
- 所有指令一律 `cd /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions && ...`，git 一律 `git -C` 絕對路徑
- node_modules 是 symlink → 主 checkout，已驗證可用（`npx vitest`、`npm run typecheck` 直接跑）
- **TS-only 規範**：禁 `: any`/`as any`，用 `: unknown` + narrow；新 SFC 一律 `<script setup lang="ts">`
- 測 el-dialog/el-drawer 內容時 mount options 加 `global: { stubs: { teleport: true } }`
- 既有事實（已驗證，不要重查）：
  - 後端 `TransitionIn = { to_stage, classroom_id?, reason? }`；`TransitionOut` 含 `student_id`。狀態機**單步**：轉化只允許 `deposited → enrolled`。舊 convert 端點的 `student_id_code` 參數後端已 deprecated/ignored（學號由 enrollment_seq 自動配發）
  - `ROUTE_PERMISSION_RULES` 是 default-deny + longest-match；`/students` 是 exact 匹配**不會**涵蓋 `/students/admissions`
  - intake-plan 回傳 `{ rows: [{ grade_id, reserved_count, ... }] }`（一次回全年級）

---

### Task 1: 新路由 `/students/admissions` + 權限規則 + AdmissionsView 殼（漏斗 tab）

**Files:**
- Create: `src/views/students/AdmissionsView.vue`
- Modify: `src/constants/permissions.ts`（ROUTE_PERMISSION_RULES，`/recruitment` 條目附近）
- Modify: `src/router/index.ts`（`/student-enrollment` 條目後插入）
- Test: `src/constants/__tests__/admissionsRoutePermissions.test.ts`

- [ ] **Step 1: 寫失敗測試（權限規則）**

```ts
// src/constants/__tests__/admissionsRoutePermissions.test.ts
import { describe, it, expect } from 'vitest'
import { ROUTE_PERMISSION_RULES } from '@/constants/permissions'

// /students 是 exact 匹配，不涵蓋 /students/admissions；缺這條規則
// canAccessRoute 的 default-deny 會把頁面鎖死（含 super admin）——歷史踩雷兩次。
describe('招生入學路由權限規則（default-deny 防鎖死）', () => {
  it('有 /students/admissions 規則且為 RECRUITMENT_READ', () => {
    expect(
      ROUTE_PERMISSION_RULES.some(
        (r) => r.path === '/students/admissions' && r.permission === 'RECRUITMENT_READ',
      ),
    ).toBe(true)
  })

  it('/recruitment 規則保留（redirect 來源仍需可解析）', () => {
    expect(
      ROUTE_PERMISSION_RULES.some(
        (r) => r.path === '/recruitment' && r.permission === 'RECRUITMENT_READ',
      ),
    ).toBe(true)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions && npx vitest run src/constants/__tests__/admissionsRoutePermissions.test.ts`
Expected: FAIL（第一個 it 找不到規則）

- [ ] **Step 3: 加權限規則**

在 `src/constants/permissions.ts` 的 `{ path: '/recruitment', permission: 'RECRUITMENT_READ' }` 規則**之前**插入：

```ts
  // 招生入學（/recruitment 重構搬遷至學生模組）。/students 是 exact 匹配不涵蓋此路由，
  // 缺這條會被 canAccessRoute default-deny 鎖死（含 super admin）。
  { path: '/students/admissions', permission: 'RECRUITMENT_READ' },
```

- [ ] **Step 4: 建 AdmissionsView 殼（本 task 先只掛漏斗 tab；其餘 tab 後續 task 補）**

```vue
<!-- src/views/students/AdmissionsView.vue -->
<template>
  <div class="admissions-view">
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-header-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
          </svg>
        </div>
        <div>
          <h2 class="page-title">招生入學</h2>
          <p class="page-subtitle">參觀 → 預繳 → 報到 → 開學 · 統計分析</p>
        </div>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="admissions-tabs">
      <el-tab-pane label="漏斗看板" name="funnel">
        <FunnelBoard />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import FunnelBoard from '@/components/recruitment/funnel/FunnelBoard.vue'

const VALID_TABS = ['funnel', 'records', 'intake', 'ivykids', 'stats'] as const
type AdmissionsTab = (typeof VALID_TABS)[number]

const route = useRoute()
const initialTab = ((): AdmissionsTab => {
  const t = typeof route.query.tab === 'string' ? route.query.tab : ''
  return (VALID_TABS as readonly string[]).includes(t) ? (t as AdmissionsTab) : 'funnel'
})()
const activeTab = ref<AdmissionsTab>(initialTab)
</script>

<style scoped>
.admissions-view {
  padding: 8px 0;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4, 16px);
}
.page-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.page-title {
  margin: 0;
  font-size: 18px;
}
.page-subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
```

注意：`page-header-icon` 的樣式請從 `src/views/RecruitmentView.vue` 的 `<style scoped>` 區塊複製同名 selector（連同其依賴的變數），維持視覺一致。

- [ ] **Step 5: 加路由**

在 `src/router/index.ts` 的 `/student-enrollment` 條目之後插入（格式照同檔既有條目）：

```ts
        {
            path: '/students/admissions',
            name: 'students-admissions',
            component: () => import('../views/students/AdmissionsView.vue'),
            meta: { title: '招生入學' }
        },
```

`/recruitment` 與 `/recruitment-ivykids` 條目**本 task 不動**（cutover 在 Task 7）。

- [ ] **Step 6: 跑測試 + typecheck**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions && npx vitest run src/constants/__tests__/admissionsRoutePermissions.test.ts && npm run typecheck`
Expected: 測試 PASS、typecheck 0 錯誤

- [ ] **Step 7: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions add src/views/students/AdmissionsView.vue src/constants/permissions.ts src/router/index.ts src/constants/__tests__/admissionsRoutePermissions.test.ts
git -C /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions commit -m "feat(admissions): 新增 /students/admissions 招生入學頁殼與漏斗看板 tab

掛載既有 FunnelBoard（首次上線）；補 ROUTE_PERMISSION_RULES 防 default-deny 鎖死。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: RecruitmentConvertDialog 改打 funnel transition + DetailTab 轉化按鈕 gating

舊 convert 端點已 deprecated 且其 `student_id_code` 後端直接忽略（學號自動配發）、`gender`/`enrollment_date` 在正路 transition 不收（性別可後續在學生檔案補、入學日期預設今日、開學啟用是漏斗獨立步驟）。因此 dialog 簡化為**只選分班**。狀態機單步：未預繳的訪視不能直接轉化，按鈕須以 `has_deposit` gate。

**Files:**
- Modify: `src/components/recruitment/RecruitmentConvertDialog.vue`（整檔改寫）
- Modify: `src/components/recruitment/RecruitmentDetailTab.vue:141`（轉化按鈕 v-if）
- Test: `src/components/recruitment/__tests__/RecruitmentConvertDialog.test.ts`（新檔）

- [ ] **Step 1: 寫失敗測試**

```ts
// src/components/recruitment/__tests__/RecruitmentConvertDialog.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import RecruitmentConvertDialog from '../RecruitmentConvertDialog.vue'

const transitionVisitMock = vi.hoisted(() => vi.fn())
vi.mock('@/api/recruitmentFunnel', () => ({
  transitionVisit: transitionVisitMock,
}))

function mountDialog() {
  return mount(RecruitmentConvertDialog, {
    props: {
      modelValue: true,
      visit: { id: 42, child_name: '王小明', has_deposit: true },
      classroomOptions: [{ id: 7, name: '小一班', school_year: 114, semester: 2 }],
    },
    global: { stubs: { teleport: true } },
  })
}

describe('RecruitmentConvertDialog（改打 funnel transition）', () => {
  beforeEach(() => {
    transitionVisitMock.mockReset()
    transitionVisitMock.mockResolvedValue({
      data: { visit_id: 42, from_stage: 'deposited', to_stage: 'enrolled', student_id: 99, event_log_id: 1, warnings: [] },
    })
  })

  it('送出時呼叫 transitionVisit(visit.id, { to_stage: enrolled, classroom_id })', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as { form: { classroom_id: number | null }; handleSubmit: () => Promise<void> }
    vm.form.classroom_id = 7
    await vm.handleSubmit()
    await flushPromises()
    expect(transitionVisitMock).toHaveBeenCalledWith(42, { to_stage: 'enrolled', classroom_id: 7 })
  })

  it('成功後 emit converted 並帶 student_id', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as { handleSubmit: () => Promise<void> }
    await vm.handleSubmit()
    await flushPromises()
    const emitted = wrapper.emitted('converted')
    expect(emitted).toBeTruthy()
    expect((emitted![0][0] as { student_id: number }).student_id).toBe(99)
  })

  it('表單不再包含學號/性別/入學日期欄位', () => {
    const wrapper = mountDialog()
    expect(wrapper.html()).not.toContain('學號')
    expect(wrapper.html()).not.toContain('入學日期')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions && npx vitest run src/components/recruitment/__tests__/RecruitmentConvertDialog.test.ts`
Expected: FAIL（仍打 convertRecruitmentRecord、欄位仍在）

- [ ] **Step 3: 改寫 RecruitmentConvertDialog.vue**

```vue
<!-- src/components/recruitment/RecruitmentConvertDialog.vue -->
<template>
  <el-dialog
    v-model="visible"
    title="轉為正式學生"
    width="520px"
    :close-on-click-modal="false"
    @closed="resetForm"
  >
    <el-alert
      v-if="visit"
      :title="`訪視紀錄：${visit.child_name}（${visit.grade || '未指定年級'}，${visit.phone || '未留電話'}）`"
      type="info"
      :closable="false"
      style="margin-bottom: 12px"
    />
    <el-alert
      v-if="visit?.enrolled"
      type="warning"
      title="此訪視已標記為已報到，重複轉化將被後端拒絕"
      :closable="false"
      style="margin-bottom: 12px"
    />
    <el-alert
      type="info"
      title="學號由系統自動配發；性別與其他資料可於轉化後到學生檔案補齊"
      :closable="false"
      style="margin-bottom: 12px"
    />

    <el-form label-width="110px">
      <el-form-item label="分班">
        <el-select
          v-model="form.classroom_id"
          placeholder="可留空"
          clearable
          filterable
          style="width: 100%"
        >
          <el-option
            v-for="c in classroomOptions"
            :key="c.id"
            :label="`${c.name}（${c.school_year}-${c.semester}）`"
            :value="c.id"
          />
        </el-select>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">確認轉化</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { transitionVisit } from '@/api/recruitmentFunnel'

interface ClassroomOption { id: number; name: string; [key: string]: unknown }
interface Visit { id: number | string; [key: string]: unknown }

const props = withDefaults(defineProps<{
  modelValue?: boolean
  visit?: Visit | null
  classroomOptions?: ClassroomOption[]
}>(), {
  modelValue: false,
  visit: null,
  classroomOptions: () => [],
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'converted': [data: Record<string, unknown>]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const form = reactive<{ classroom_id: number | null }>({ classroom_id: null })
const submitting = ref(false)

function resetForm() {
  form.classroom_id = null
}

watch(
  () => props.visit,
  () => resetForm(),
)

async function handleSubmit() {
  if (!props.visit) return
  submitting.value = true
  try {
    const { data } = await transitionVisit(Number(props.visit.id), {
      to_stage: 'enrolled',
      classroom_id: form.classroom_id,
    })
    ElMessage.success('已成功轉為正式學生')
    emit('converted', data as unknown as Record<string, unknown>)
    visible.value = false
  } catch (err) {
    ElMessage.error((err as { displayMessage?: string }).displayMessage || '轉化失敗')
  } finally {
    submitting.value = false
  }
}

defineExpose({ form, handleSubmit })
</script>
```

注意：`transitionVisit` 的 payload 型別來自 OpenAPI codegen（`ApiBody<'/funnel/visits/{visit_id}/transition', 'post'>`）。若 typecheck 抱怨 `classroom_id: null` 不可指派，改成 `classroom_id: form.classroom_id ?? undefined`。

- [ ] **Step 4: DetailTab 轉化按鈕加 has_deposit gate**

`src/components/recruitment/RecruitmentDetailTab.vue` 第 141 行（轉化按鈕）：

```html
<!-- 原： v-if="canConvert && !row.enrolled" -->
<!-- 改為（狀態機單步：未預繳不能直接轉化）： -->
            v-if="canConvert && row.has_deposit && !row.enrolled"
```

- [ ] **Step 5: 跑測試確認通過 + typecheck**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions && npx vitest run src/components/recruitment/__tests__/RecruitmentConvertDialog.test.ts && npm run typecheck`
Expected: 3 PASS、typecheck 0 錯誤

- [ ] **Step 6: 確認 convertRecruitmentRecord 不再被任何元件引用**

Run: `grep -rn "convertRecruitmentRecord" /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions/src --include="*.vue" --include="*.ts" | grep -v "api/recruitment.ts" | grep -v __tests__`
Expected: 無輸出（api wrapper 函式保留不刪，僅元件不再呼叫）

- [ ] **Step 7: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions add src/components/recruitment/RecruitmentConvertDialog.vue src/components/recruitment/RecruitmentDetailTab.vue src/components/recruitment/__tests__/RecruitmentConvertDialog.test.ts
git -C /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions commit -m "fix(recruitment): 轉化改打 funnel transition 正路，棄用 deprecated convert 端點

舊端點 student_id_code 後端已忽略；dialog 簡化為僅選分班。
轉化按鈕以 has_deposit gate（狀態機僅允許 deposited→enrolled 單步）。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 共用 lazy chart 模組（後續三個 task 的前置）

把 RecruitmentView 內的 chart.js 延遲載入機制抽成共用模組，供 StatsPanel、四個統計 tab 元件與 ivykids tab 使用。

**Files:**
- Create: `src/components/recruitment/lazyChartComponents.ts`
- Test: 不需獨立測試（純搬移；由後續元件測試與 typecheck 覆蓋）

- [ ] **Step 1: 建立模組（內容自 RecruitmentView.vue:510-534 搬移 + castChartOpts 自 1342-1344 搬移）**

```ts
// src/components/recruitment/lazyChartComponents.ts
/**
 * chart.js 延遲載入：首次需要圖表時才動態 import 並註冊 scale/element。
 * 自 RecruitmentView 抽出，供招生入學各統計元件共用。
 */
import { defineAsyncComponent } from 'vue'
import type { ChartOptions } from 'chart.js'

let _chartReady: Promise<void> | null = null
const ensureChartReady = (): Promise<void> => {
  if (!_chartReady) {
    _chartReady = import('chart.js').then(({
      Chart, CategoryScale, LinearScale, BarElement,
      PointElement, LineElement, ArcElement,
      Title, Tooltip, Legend,
    }) => {
      Chart.register(
        CategoryScale, LinearScale, BarElement,
        PointElement, LineElement, ArcElement,
        Title, Tooltip, Legend,
      )
    })
  }
  return _chartReady
}

export const LazyBar = defineAsyncComponent(() =>
  ensureChartReady().then(() => import('vue-chartjs').then(m => m.Bar))
)
export const LazyLine = defineAsyncComponent(() =>
  ensureChartReady().then(() => import('vue-chartjs').then(m => m.Line))
)

// chart options 轉型（vue-chartjs 要求 ChartOptions<T>，composable 回傳 Record<string,unknown>）
export const castChartOpts = (opts: Record<string, unknown>): ChartOptions<'bar'> =>
  opts as unknown as ChartOptions<'bar'>
```

本 task **不改** RecruitmentView（它保留自己的本地副本直到 Task 7 刪除，避免中途破壞 `/recruitment`）。

- [ ] **Step 2: typecheck**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions && npm run typecheck`
Expected: 0 錯誤

- [ ] **Step 3: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions add src/components/recruitment/lazyChartComponents.ts
git -C /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions commit -m "refactor(recruitment): 抽出共用 chart.js 延遲載入模組

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: AdmissionsRecordsPanel（訪視明細）+ 掛 records/intake/ivykids 三個 tab

把 RecruitmentView 的「原始明細」tab 與其所屬 script 狀態搬成獨立 panel。資料介面：父層傳 `dashboard`（`useRecruitmentDashboard` 回傳物件整包）與 `filterPatch`；panel 發 `changed` 事件通知父層刷新統計與漏斗。

**Files:**
- Create: `src/components/recruitment/AdmissionsRecordsPanel.vue`
- Modify: `src/views/students/AdmissionsView.vue`
- Test: `src/components/recruitment/__tests__/AdmissionsRecordsPanel.test.ts`

**搬移來源對照（RecruitmentView.vue，搬移時邏輯不變）：**

| 內容 | 來源行 |
|---|---|
| `RecruitmentDetailTab` 掛載 + props/events | 386-405 |
| Month/Record/Convert/Reserve dialogs + Journey drawer | 410-426, 444-459 |
| convert/reserve/journey 狀態與 handlers | 544-609 |
| detail 狀態（detailData/filter/loading） | 612-640 |
| `fetchDetailDebounced` | 727-731 |
| record dialog 狀態 + `useFormDraft`（含 `RECRUITMENT_DRAFT_EXCLUDE`） | 744-792 |
| month dialog + `handleMonthsChanged` | 806-814 |
| `rocDateToISO` / `rocMonthToISO` | 817-830 |
| `districtSuggestions` | 834-838 |
| `fetchDetail` | 840-863 |
| `clearFilter` / `updateDetailFilter` / `onPageChange` | 978-992, 1051-1054 |
| CRUD：`openAddDialog` / `openEditDialog` / `handleSave` / `handleDelete` | 1067-1153 |
| `depositRowClass` | 1237 |

- [ ] **Step 1: 寫失敗測試**

```ts
// src/components/recruitment/__tests__/AdmissionsRecordsPanel.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import AdmissionsRecordsPanel from '../AdmissionsRecordsPanel.vue'

const getRecruitmentRecordsMock = vi.hoisted(() => vi.fn())
const deleteRecruitmentRecordMock = vi.hoisted(() => vi.fn())
vi.mock('@/api/recruitment', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    getRecruitmentRecords: getRecruitmentRecordsMock,
    deleteRecruitmentRecord: deleteRecruitmentRecordMock,
  }
})
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    ElMessageBox: { confirm: vi.fn().mockResolvedValue('confirm') },
  }
})

function makeDashboard() {
  return {
    stats: ref<Record<string, unknown>>({ by_district: [] }),
    options: ref<Record<string, unknown>>({ months: [], sources: [], referrers: [], no_deposit_reasons: [] }),
    loadingStats: ref(false),
    exportingExcel: ref(false),
    referenceMonth: ref<string | null>(null),
    invalidateOptions: vi.fn(),
    fetchOptions: vi.fn().mockResolvedValue(true),
    fetchStats: vi.fn().mockResolvedValue(true),
    loadDashboard: vi.fn(),
    setReferenceMonth: vi.fn(),
    handleExportExcel: vi.fn(),
  }
}

function mountPanel(filterPatch: Record<string, unknown> | null = null) {
  return mount(AdmissionsRecordsPanel, {
    props: { dashboard: makeDashboard() as never, filterPatch },
    global: { stubs: { teleport: true } },
  })
}

describe('AdmissionsRecordsPanel', () => {
  beforeEach(() => {
    getRecruitmentRecordsMock.mockReset()
    getRecruitmentRecordsMock.mockResolvedValue({ data: { records: [], total: 0 } })
    deleteRecruitmentRecordMock.mockReset()
    deleteRecruitmentRecordMock.mockResolvedValue({ data: {} })
  })

  it('mount 時抓訪視明細', async () => {
    mountPanel()
    await flushPromises()
    expect(getRecruitmentRecordsMock).toHaveBeenCalled()
  })

  it('filterPatch prop 變更時套用篩選並重抓（下鑽）', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    getRecruitmentRecordsMock.mockClear()
    await wrapper.setProps({ filterPatch: { keyword: '王小明' } })
    await flushPromises()
    expect(getRecruitmentRecordsMock).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: '王小明', page: 1 }),
    )
  })

  it('刪除成功後 emit changed', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    const vm = wrapper.vm as unknown as { handleDelete: (id: number) => Promise<void> }
    await vm.handleDelete(5)
    await flushPromises()
    expect(deleteRecruitmentRecordMock).toHaveBeenCalledWith(5)
    expect(wrapper.emitted('changed')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions && npx vitest run src/components/recruitment/__tests__/AdmissionsRecordsPanel.test.ts`
Expected: FAIL（元件不存在）

- [ ] **Step 3: 建 AdmissionsRecordsPanel.vue**

骨架如下；標注「搬移」處依上方對照表把 RecruitmentView 對應行**原樣搬入**（僅做下列三類修改：① `options`/`stats` 改讀 `props.dashboard.options.value` / `props.dashboard.stats.value`（在 script 開頭解構 `const { options, stats, invalidateOptions, fetchOptions } = props.dashboard` 後即可原樣使用，**注意這些是 ref，模板自動解包、script 內要 `.value`**）② `handleSave`/`handleDelete`/`onConverted` 成功路徑把原本的 `await fetchStats(); invalidateOptions(); invalidateLazyTabs(); if (activeTab...)` 整段換成 `await fetchDetail(); emit('changed')` ③ `onConverted` 保留「查看檔案」`ElMessageBox.confirm` 與跳轉，`result.student_id` 取自 TransitionOut）：

```vue
<!-- src/components/recruitment/AdmissionsRecordsPanel.vue -->
<template>
  <div class="records-panel">
    <div class="panel-toolbar">
      <el-button v-if="canWrite" size="small" @click="openMonthDialog">管理月份</el-button>
      <el-button v-if="canWrite" type="primary" size="small" @click="openAddDialog">新增訪視記錄</el-button>
    </div>

    <!-- 搬移：RecruitmentView.vue 386-405 的 <RecruitmentDetailTab .../>（props/events 原樣） -->

    <!-- 搬移：410-413 RecruitmentMonthDialog -->
    <!-- 搬移：416-426 RecruitmentRecordDialog -->
    <!-- 搬移：444-449 RecruitmentConvertDialog -->
    <!-- 搬移：451-455 ReserveSeatDialog -->
    <!-- 搬移：457-459 JourneyTimeline el-drawer -->
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import {
  getRecruitmentRecords,
  createRecruitmentRecord,
  updateRecruitmentRecord,
  deleteRecruitmentRecord,
} from '@/api/recruitment'
import { apiError } from '@/utils/error'
import { hasPermission, getUserInfo } from '@/utils/auth'
import { useFormDraft } from '@/composables/useFormDraft'
import type { useRecruitmentDashboard } from '@/composables/useRecruitmentDashboard'
import { useClassroomStore } from '@/stores/classroom'
import { toAdYear } from '@/utils/academic'
import RecruitmentDetailTab from '@/components/recruitment/RecruitmentDetailTab.vue'
import RecruitmentMonthDialog from '@/components/recruitment/RecruitmentMonthDialog.vue'
import RecruitmentRecordDialog from '@/components/recruitment/RecruitmentRecordDialog.vue'
import RecruitmentConvertDialog from '@/components/recruitment/RecruitmentConvertDialog.vue'
import ReserveSeatDialog from '@/components/recruitment/ReserveSeatDialog.vue'
import JourneyTimeline from '@/components/recruitment/JourneyTimeline.vue'

const props = defineProps<{
  dashboard: ReturnType<typeof useRecruitmentDashboard>
  filterPatch?: Record<string, unknown> | null
}>()
const emit = defineEmits<{ changed: [] }>()

const { options, stats, invalidateOptions, fetchOptions } = props.dashboard

const canWrite = computed(() => hasPermission('RECRUITMENT_WRITE'))
const canConvert = computed(() => hasPermission('RECRUITMENT_CONVERT'))

// ↓↓↓ 以下依對照表自 RecruitmentView 搬移（修改點僅前述三類）↓↓↓
// 544-609 轉化/保留座位/歷程
// 612-640 detail 狀態
// 727-731 debounce
// 744-792 record dialog + useFormDraft
// 806-814 month dialog
// 817-830 roc 日期 helpers
// 834-838 districtSuggestions
// 840-863 fetchDetail
// 978-992 + 1051-1054 篩選/分頁
// 1067-1153 CRUD
// 1237 depositRowClass
// ↑↑↑ 搬移結束 ↑↑↑

// 下鑽：父層切到本 tab 時帶 filterPatch
watch(
  () => props.filterPatch,
  (patch) => {
    if (!patch) return
    filter.value = {
      month: null, grade: null, source: null, referrer: null,
      has_deposit: null, no_deposit_reason: null, keyword: '',
      page: 1, page_size: filter.value.page_size,
      ...patch,
    }
    void fetchDetail()
  },
)

onMounted(async () => {
  await Promise.all([fetchDetail(), fetchOptions()])
  if (props.filterPatch) {
    filter.value = { ...filter.value, ...props.filterPatch, page: 1 }
    void fetchDetail()
  }
})

defineExpose({ handleDelete, openAddDialog })
</script>

<style scoped>
.panel-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 12px;
}
</style>
```

具體修改點明細（執行時逐一核對）：
1. `onConverted`：原 600-608 的 `ElMessageBox.confirm`/跳轉保留；末尾追加 `emit('changed')`。
2. `handleSave`（原 1109-1136）：成功路徑（兩個分支共通尾段）改為 `recruitmentDraft.clear(); dialogVisible.value = false; await fetchDetail(); emit('changed')`，刪除原本對 `fetchStats/invalidateOptions/invalidateLazyTabs/loadXxxTab` 的呼叫。
3. `handleDelete`（原 1138-1153）：成功路徑改為 `await fetchDetail(); emit('changed')`。
4. `handleMonthsChanged`（原 809-814）：改為 `invalidateOptions(); await fetchOptions(true)`（無條件，不再看 lazy flags）。
5. `districtSuggestions`（原 834-838）：`stats.value.by_district` 寫法不變（`stats` 已從 dashboard 解構，仍是 ref）。
6. 原 612-619 的 `activeTab`/`loadingND`/`ndLoaded`/`areaLoaded`/`periodsLoaded`/`detailLoaded` **不搬**（lazy 機制由 el-tab-pane lazy + onMounted 取代）；`loadDetailTab` 不搬（onMounted 直接平行抓 detail+options）。

- [ ] **Step 4: AdmissionsView 掛三個 tab + dashboard + 下鑽/changed 接線**

`src/views/students/AdmissionsView.vue` 改為：

```vue
<template>
  <div class="admissions-view">
    <div class="page-header"><!-- 既有 header 不動 --></div>

    <el-tabs v-model="activeTab" class="admissions-tabs">
      <el-tab-pane label="漏斗看板" name="funnel">
        <FunnelBoard />
      </el-tab-pane>
      <el-tab-pane label="訪視明細" name="records" lazy>
        <AdmissionsRecordsPanel
          :dashboard="dashboard"
          :filter-patch="recordsFilterPatch"
          @changed="onRecordsChanged"
        />
      </el-tab-pane>
      <el-tab-pane label="名額規劃" name="intake" lazy>
        <IntakePlanPanel />
      </el-tab-pane>
      <el-tab-pane label="官網報名" name="ivykids" lazy>
        <RecruitmentIvykidsTab :bar-component="LazyBar" :show-charts="true" :can-write="canWrite" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>
```

script 增加：

```ts
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { hasPermission } from '@/utils/auth'
import { useRecruitmentDashboard } from '@/composables/useRecruitmentDashboard'
import { useRecruitmentFunnelStore } from '@/stores/recruitmentFunnel'
import { LazyBar } from '@/components/recruitment/lazyChartComponents'
import FunnelBoard from '@/components/recruitment/funnel/FunnelBoard.vue'
import AdmissionsRecordsPanel from '@/components/recruitment/AdmissionsRecordsPanel.vue'
import IntakePlanPanel from '@/components/recruitment/IntakePlanPanel.vue'
import RecruitmentIvykidsTab from '@/components/recruitment/RecruitmentIvykidsTab.vue'

const canWrite = computed(() => hasPermission('RECRUITMENT_WRITE'))
const dashboard = useRecruitmentDashboard({ notifyError: (m: string) => ElMessage.error(m) })
const funnelStore = useRecruitmentFunnelStore()
const recordsFilterPatch = ref<Record<string, unknown> | null>(null)

function drillToRecords(patch: Record<string, unknown>) {
  recordsFilterPatch.value = { ...patch }
  activeTab.value = 'records'
}

async function onRecordsChanged() {
  await dashboard.fetchStats()
  dashboard.invalidateOptions()
  void funnelStore.loadBoard() // 訪視 CRUD/轉化會改變漏斗卡片
}

onMounted(() => {
  dashboard.loadDashboard()
  const kw = typeof route.query.keyword === 'string' ? route.query.keyword : ''
  if (kw) drillToRecords({ keyword: kw })
})
```

（`route`/`activeTab`/`VALID_TABS` 沿用 Task 1 的程式碼；`?keyword=` 全域搜尋深連結會落在訪視明細。）

- [ ] **Step 5: 跑測試 + typecheck**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions && npx vitest run src/components/recruitment/__tests__/AdmissionsRecordsPanel.test.ts && npm run typecheck`
Expected: PASS、0 錯誤

- [ ] **Step 6: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions add src/components/recruitment/AdmissionsRecordsPanel.vue src/views/students/AdmissionsView.vue src/components/recruitment/__tests__/AdmissionsRecordsPanel.test.ts
git -C /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions commit -m "feat(admissions): 訪視明細/名額規劃/官網報名 tab 掛入招生入學頁

AdmissionsRecordsPanel 自 RecruitmentView 搬移訪視 CRUD 與相關 dialogs；
dashboard 由父層單例下發、CRUD 後 emit changed 刷新統計與漏斗。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 抽出四個內聯統計 tab 元件（班別/來源/接待/童年綠地）

四個元件都是純展示：props in、無 emit（chart 點擊下鑽由 options 物件內建 callback，不經這層）。template 自 RecruitmentView **原樣搬移**，僅把依賴改為 props 與共用模組。

**Files:**
- Create: `src/components/recruitment/RecruitmentClassTab.vue`（template 來源：RecruitmentView.vue 79-118）
- Create: `src/components/recruitment/RecruitmentSourceTab.vue`（來源：123-148）
- Create: `src/components/recruitment/RecruitmentStaffTab.vue`（來源：153-217）
- Create: `src/components/recruitment/RecruitmentChuannianTab.vue`（來源：276-350）
- Test: `src/components/recruitment/__tests__/recruitmentStatsTabs.test.ts`

**共通規則（四個元件一致）：**
- `<script setup lang="ts">` 開頭：

```ts
import { LazyBar, castChartOpts } from '@/components/recruitment/lazyChartComponents'
```

- template 內 `<Bar ...>` 改為 `<LazyBar ...>`；`isChartTabActive('xxx')` 改為 prop `showCharts`
- `fmtPct` 改為 prop（型別 `(deposit: number, visit: number) => string`）
- `GRADES_ORDER` 改為 prop `gradesOrder: string[]`
- `<style scoped>`：從 RecruitmentView 的 style 區塊複製 `.chart-row`、`.chart-card`、`.chart-box`、`.chart-box-tall` 四個 selector（Chuannian 另加 `.kpi-row`、`.kpi-card`、`.kpi-green`、`.kpi-blue`、`.kpi-value`、`.kpi-label`、`.kpi-sub`）

**各元件 props 介面（defineProps）：**

```ts
// RecruitmentClassTab.vue
defineProps<{
  showCharts: boolean
  classBarData: Record<string, unknown> | null
  classRateData: Record<string, unknown> | null
  classBarOptions: Record<string, unknown>
  percentHorizBarOptions: Record<string, unknown>
  statsByGrade: Record<string, unknown>[]
  monthGradeTableData: Record<string, unknown>[]
  gradesOrder: string[]
  fmtPct: (deposit: number, visit: number) => string
}>()
```

```ts
// RecruitmentSourceTab.vue
defineProps<{
  showCharts: boolean
  sourceBarData: Record<string, unknown> | null
  sourceRateData: Record<string, unknown> | null
  sourceClickBarOptions: Record<string, unknown>
  percentHorizBarOptions: Record<string, unknown>
  statsBySource: Record<string, unknown>[]
  fmtPct: (deposit: number, visit: number) => string
}>()
```

```ts
// RecruitmentStaffTab.vue
interface ReferrerSourceCross {
  referrers?: Record<string, unknown>[]
  sources?: string[]
}
defineProps<{
  showCharts: boolean
  staffBarData: Record<string, unknown> | null
  staffRateData: Record<string, unknown> | null
  barOptions: Record<string, unknown>
  percentBarOptions: Record<string, unknown>
  statsByReferrer: Record<string, unknown>[]
  referrerSourceCross: ReferrerSourceCross
  gradesOrder: string[]
  fmtPct: (deposit: number, visit: number) => string
}>()
```

```ts
// RecruitmentChuannianTab.vue
defineProps<{
  showCharts: boolean
  stats: Record<string, unknown>  // 用到 chuannian_visit / chuannian_deposit / total_visit
  chuannianNoDeposit: number
  chuannianExpectedBarData: Record<string, unknown> | null
  chuannianGradeBarData: Record<string, unknown> | null
  barOptions: Record<string, unknown>
  horizBarOptions: Record<string, unknown>
  chuannianByExpected: Record<string, unknown>[]
  chuannianByGrade: Record<string, unknown>[]
  fmtPct: (deposit: number, visit: number) => string
}>()
```

注意：Chuannian template 內 `stats.chuannian_visit` 等直接以 prop `stats` 取用即可（原 template 寫法不變）；`fmtPct(Number(stats.chuannian_deposit), Number(stats.chuannian_visit))` 等保留 Number() 轉型。

- [ ] **Step 1: 寫失敗測試（四元件渲染 smoke）**

```ts
// src/components/recruitment/__tests__/recruitmentStatsTabs.test.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RecruitmentClassTab from '../RecruitmentClassTab.vue'
import RecruitmentSourceTab from '../RecruitmentSourceTab.vue'
import RecruitmentStaffTab from '../RecruitmentStaffTab.vue'
import RecruitmentChuannianTab from '../RecruitmentChuannianTab.vue'

const fmtPct = (d: number, v: number) => (v ? ((d / v) * 100).toFixed(1) + '%' : '0%')

describe('招生統計四 tab 元件渲染', () => {
  it('RecruitmentClassTab 渲染表格資料', () => {
    const wrapper = mount(RecruitmentClassTab, {
      props: {
        showCharts: false,
        classBarData: null, classRateData: null,
        classBarOptions: {}, percentHorizBarOptions: {},
        statsByGrade: [{ grade: '幼幼班', visit: 10, deposit: 5 }],
        monthGradeTableData: [], gradesOrder: ['幼幼班'], fmtPct,
      },
    })
    expect(wrapper.text()).toContain('幼幼班')
    expect(wrapper.text()).toContain('50.0%')
  })

  it('RecruitmentSourceTab 渲染來源明細', () => {
    const wrapper = mount(RecruitmentSourceTab, {
      props: {
        showCharts: false,
        sourceBarData: null, sourceRateData: null,
        sourceClickBarOptions: {}, percentHorizBarOptions: {},
        statsBySource: [{ source: '路過', visit: 8, deposit: 2 }], fmtPct,
      },
    })
    expect(wrapper.text()).toContain('路過')
  })

  it('RecruitmentStaffTab 渲染接待人員與交叉分析', () => {
    const wrapper = mount(RecruitmentStaffTab, {
      props: {
        showCharts: false,
        staffBarData: null, staffRateData: null,
        barOptions: {}, percentBarOptions: {},
        statsByReferrer: [{ referrer: '雅婷', visit: 6, deposit: 3 }],
        referrerSourceCross: { referrers: [{ referrer: '雅婷', sources: { 路過: 2 }, total: 2 }], sources: ['路過'] },
        gradesOrder: ['幼幼班'], fmtPct,
      },
    })
    expect(wrapper.text()).toContain('雅婷')
    expect(wrapper.text()).toContain('介紹者 × 來源 交叉分析')
  })

  it('RecruitmentChuannianTab 渲染 KPI 與空狀態', () => {
    const wrapper = mount(RecruitmentChuannianTab, {
      props: {
        showCharts: false,
        stats: { chuannian_visit: 4, chuannian_deposit: 1, total_visit: 20 },
        chuannianNoDeposit: 3,
        chuannianExpectedBarData: null, chuannianGradeBarData: null,
        barOptions: {}, horizBarOptions: {},
        chuannianByExpected: [], chuannianByGrade: [], fmtPct,
      },
    })
    expect(wrapper.text()).toContain('童年綠地參觀總數')
    expect(wrapper.text()).toContain('暫無童年綠地資料')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions && npx vitest run src/components/recruitment/__tests__/recruitmentStatsTabs.test.ts`
Expected: FAIL（元件不存在）

- [ ] **Step 3: 依上述規格建立四個元件**（template 自對應行原樣搬移 + 共通規則替換）

- [ ] **Step 4: 跑測試 + typecheck**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions && npx vitest run src/components/recruitment/__tests__/recruitmentStatsTabs.test.ts && npm run typecheck`
Expected: 4 PASS、0 錯誤

- [ ] **Step 5: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions add src/components/recruitment/RecruitmentClassTab.vue src/components/recruitment/RecruitmentSourceTab.vue src/components/recruitment/RecruitmentStaffTab.vue src/components/recruitment/RecruitmentChuannianTab.vue src/components/recruitment/__tests__/recruitmentStatsTabs.test.ts
git -C /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions commit -m "refactor(recruitment): 班別/來源/接待/童年綠地統計 tab 抽成獨立元件

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: RecruitmentStatsPanel（統計分析容器）+ 掛入 stats tab

組裝 8 個統計次分頁。除四個新元件外，overview/area/nodeposit/periods 沿用既有元件；周邊 script（charts/area/periods composables、nodeposit 狀態、periods CRUD、campus dialog）自 RecruitmentView 搬移。

**Files:**
- Create: `src/components/recruitment/RecruitmentStatsPanel.vue`
- Modify: `src/views/students/AdmissionsView.vue`（加 stats tab + drill 接線）
- Test: `src/components/recruitment/__tests__/RecruitmentStatsPanel.test.ts`

**搬移來源對照（RecruitmentView.vue）：**

| 內容 | 來源行 | 處置 |
|---|---|---|
| header 的參考月份 select + 匯出 Excel 按鈕 | 16-41 | 搬入 panel 頂部 toolbar（管理月份/新增訪視不搬，已在 records panel） |
| overview pane（AllChannelSummaryCard + RecruitmentOverviewTab） | 53-75 | 原樣搬，`@navigate` 接 `handleDashboardTarget` |
| 班別/來源/接待/童年綠地 pane | 78-218, 275-351 | 改掛 Task 5 四元件 |
| area pane（RecruitmentAreaTab） | 221-240 | 原樣搬 |
| nodeposit pane（RecruitmentNoDepositTab） | 243-272 | 原樣搬 |
| periods pane（RecruitmentPeriodsTab） | 354-373 | 原樣搬 |
| RecruitmentPeriodDialog / RecruitmentCampusDialog | 428-442 | 原樣搬 |
| 區域常數 AREA_HOTSPOT_* | 536-538 | 搬 |
| nodeposit 狀態 + fetchNoDeposit | 642-668, 865-904 | 搬 |
| useRecruitmentArea / useRecruitmentPeriods 解構 | 686-725 | 搬 |
| lazy flags + invalidateLazyTabs + isChartTabActive | 616-619, 733-741 | 搬（detailLoaded 不搬） |
| periods dialog 狀態 | 795-803 | 搬 |
| loadNoDepositTab/loadAreaTab/loadPeriodsTab/handleAreaHotspotSync/handleMarketSync/handleSetAsCampus/handleCampusSave | 898-949 | 搬 |
| handleReferenceMonthChange / onTabClick | 964-975 | 搬（onTabClick 刪掉 detail 分支） |
| applyNoDepositFilter / handleDashboardTarget | 1006-1049 | 搬；`handleDashboardTarget` 的 `targetTab === 'detail'` 分支改為 `emit('drill-records', targetFilter); return` |
| onNoDepositFilterChange / onNDPageChange | 1056-1064 | 搬 |
| periods CRUD（openPeriodAdd/Edit/handlePeriodSave/Delete/Sync） | 1156-1223 | 搬 |
| fmtPct / fmtRate | 1226-1235 | 搬 |
| useRecruitmentCharts 解構 | 1240-1272 | 搬；`drillToDetail` callback 改 `(patch) => emit('drill-records', patch)` |
| currentCampus / referrerSourceCross / stats* / chuannian* / options computed | 1274-1329 | 搬 |
| cast helpers（castBar/castLine/castFmtRate/castFmtPct） | 1331-1339 | 搬，Bar/Line 改 import LazyBar/LazyLine |
| defineExpose openCampusDialog | 1347 | 搬，並加 `invalidateLazyTabs` |
| `<style scoped>` 中統計相關 selector | 1350+ | 整段複製（chart-row/chart-card/chart-box/kpi-* 留給 Task 5 元件的可省略，但整段複製較安全——scoped 重複無害） |

**Panel 介面：**

```ts
const props = defineProps<{ dashboard: ReturnType<typeof useRecruitmentDashboard> }>()
const emit = defineEmits<{ 'drill-records': [patch: Record<string, unknown>] }>()
const { stats, options, loadingStats, exportingExcel, referenceMonth,
        setReferenceMonth, handleExportExcel, fetchOptions } = props.dashboard
// useRecruitmentCharts({ stats: ..., periodsSummary: ..., marketSnapshot, drillToDetail: (p) => emit('drill-records', p) })
defineExpose({ openCampusDialog, invalidateLazyTabs })
```

template 骨架：

```vue
<template>
  <div class="stats-panel" v-loading="loadingStats">
    <div class="panel-toolbar">
      <el-select v-model="referenceMonthLocal" size="small" placeholder="參考月份" clearable style="width: 140px" @change="handleReferenceMonthChange">
        <el-option v-for="month in monthOptions" :key="month" :label="month" :value="month" />
      </el-select>
      <el-button type="success" size="small" :loading="exportingExcel" @click="handleExportExcel">匯出 Excel</el-button>
    </div>
    <el-tabs v-model="activeStatsTab" @tab-click="onTabClick">
      <!-- 8 個 el-tab-pane：overview / class / source / staff / area / nodeposit / chuannian / periods -->
    </el-tabs>
    <!-- RecruitmentPeriodDialog / RecruitmentCampusDialog -->
  </div>
</template>
```

細節：
- `referenceMonthLocal`：直接用解構出的 `referenceMonth` ref（v-model 綁 ref 本身）即可，不需另建 local；`monthOptions` = `computed(() => (options.value.months as string[] | undefined) ?? [])`
- 四個新元件掛法（以班別為例）：

```vue
<el-tab-pane label="班別分析" name="class" lazy>
  <RecruitmentClassTab
    :show-charts="isChartTabActive('class')"
    :class-bar-data="classBarData" :class-rate-data="classRateData"
    :class-bar-options="(classBarOptions as Record<string, unknown>)"
    :percent-horiz-bar-options="(percentHorizBarOptions as Record<string, unknown>)"
    :stats-by-grade="statsByGrade" :month-grade-table-data="monthGradeTableData"
    :grades-order="GRADES_ORDER" :fmt-pct="fmtPct"
  />
</el-tab-pane>
```

（source/staff/chuannian 比照各自 props 介面傳入。）

- [ ] **Step 1: 寫失敗測試**

```ts
// src/components/recruitment/__tests__/RecruitmentStatsPanel.test.ts
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import RecruitmentStatsPanel from '../RecruitmentStatsPanel.vue'

vi.mock('@/composables/useRecruitmentArea', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return actual // 不打 API：loadAreaTab 僅在切到 area tab 才觸發
})

function makeDashboard() {
  return {
    stats: ref<Record<string, unknown>>({}),
    options: ref<Record<string, unknown>>({ months: ['115.06'] }),
    loadingStats: ref(false),
    exportingExcel: ref(false),
    referenceMonth: ref<string | null>(null),
    invalidateOptions: vi.fn(),
    fetchOptions: vi.fn().mockResolvedValue(true),
    fetchStats: vi.fn().mockResolvedValue(true),
    loadDashboard: vi.fn(),
    setReferenceMonth: vi.fn(),
    handleExportExcel: vi.fn(),
  }
}

describe('RecruitmentStatsPanel', () => {
  it('渲染 8 個統計次分頁', () => {
    const wrapper = mount(RecruitmentStatsPanel, {
      props: { dashboard: makeDashboard() as never },
      global: { stubs: { teleport: true } },
    })
    const labels = wrapper.findAll('.el-tabs__item').map((n) => n.text())
    expect(labels).toEqual(
      expect.arrayContaining(['總覽', '班別分析', '來源分析', '接待分析', '區域分析', '未預繳原因', '童年綠地', '近五年轉換']),
    )
  })

  it('overview navigate target=detail 時 emit drill-records', async () => {
    const wrapper = mount(RecruitmentStatsPanel, {
      props: { dashboard: makeDashboard() as never },
      global: { stubs: { teleport: true } },
    })
    const vm = wrapper.vm as unknown as { handleDashboardTarget: (t: Record<string, unknown>) => Promise<void> }
    await vm.handleDashboardTarget({ target_tab: 'detail', target_filter: { grade: '幼幼班' } })
    const emitted = wrapper.emitted('drill-records')
    expect(emitted).toBeTruthy()
    expect(emitted![0][0]).toEqual({ grade: '幼幼班' })
  })
})
```

（若 mount 因 chart/leaflet 子元件炸掉，比照既有測試慣例 stub 掉 `RecruitmentAreaTab` 等重元件：`global.stubs: { RecruitmentAreaTab: true, RecruitmentOverviewTab: true }`——stub 不影響兩個斷言。）

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions && npx vitest run src/components/recruitment/__tests__/RecruitmentStatsPanel.test.ts`
Expected: FAIL（元件不存在）

- [ ] **Step 3: 依對照表建 RecruitmentStatsPanel.vue**

- [ ] **Step 4: AdmissionsView 加 stats tab 與接線**

template 末尾加：

```vue
      <el-tab-pane label="統計分析" name="stats" lazy>
        <RecruitmentStatsPanel
          ref="statsPanelRef"
          :dashboard="dashboard"
          @drill-records="drillToRecords"
        />
      </el-tab-pane>
```

script 加：

```ts
import RecruitmentStatsPanel from '@/components/recruitment/RecruitmentStatsPanel.vue'
const statsPanelRef = ref<InstanceType<typeof RecruitmentStatsPanel> | null>(null)
```

並在 `onRecordsChanged` 末尾加 `statsPanelRef.value?.invalidateLazyTabs()`。

- [ ] **Step 5: 跑測試 + typecheck + 相關套件**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions && npx vitest run src/components/recruitment/ && npm run typecheck`
Expected: 全 PASS、0 錯誤

- [ ] **Step 6: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions add src/components/recruitment/RecruitmentStatsPanel.vue src/views/students/AdmissionsView.vue src/components/recruitment/__tests__/RecruitmentStatsPanel.test.ts
git -C /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions commit -m "feat(admissions): 統計分析收為次級分頁（8 統計 tab 整組保留）

下鑽改走 drill-records 事件 → 父層切訪視明細帶 filterPatch。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Cutover——redirect、刪舊頁、側邊欄搬移、呼叫點更新

**Files:**
- Modify: `src/router/index.ts`（/recruitment 改 redirect、/recruitment-ivykids 改目標、刪 RecruitmentView import）
- Delete: `src/views/RecruitmentView.vue`、`src/views/RecruitmentIvykidsView.vue`
- Modify: `src/components/layout/AdminSidebar.vue`
- Modify: `src/constants/routes.ts:22`、`src/components/GlobalSearch.vue:129`、`src/components/dashboard/QuickAddMenu.vue:56`
- Modify: `src/constants/permissions.ts`（/recruitment-ivykids 註解更新）
- Test: `src/router/__tests__/admissionsRedirects.spec.ts`

- [ ] **Step 1: 寫失敗測試（redirect，照 legacyRedirects.spec.ts 的 follow() 慣例）**

```ts
// src/router/__tests__/admissionsRedirects.spec.ts
/**
 * vue-router 4 的 `router.resolve()` 不追蹤 redirect，照 legacyRedirects.spec.ts
 * 用 follow() 取 matched[-1].redirect 二次 resolve。
 */
import { describe, it, expect } from 'vitest'
import type { RouteLocationRaw } from 'vue-router'
import router from '@/router'

function follow(from: string) {
  const res = router.resolve(from)
  const last = res.matched[res.matched.length - 1]
  if (!last?.redirect) return res
  const target: RouteLocationRaw =
    typeof last.redirect === 'function' ? (last.redirect as (r: typeof res) => RouteLocationRaw)(res) : last.redirect
  return router.resolve(target)
}

describe('招生舊路由 → /students/admissions redirect', () => {
  it('/recruitment → /students/admissions', () => {
    expect(follow('/recruitment').path).toBe('/students/admissions')
  })

  it('/recruitment 帶 keyword query 保留（全域搜尋深連結）', () => {
    const r = follow('/recruitment?keyword=王小明')
    expect(r.path).toBe('/students/admissions')
    expect(r.query.keyword).toBe('王小明')
  })

  it('/recruitment-ivykids → /students/admissions?tab=ivykids', () => {
    const r = follow('/recruitment-ivykids')
    expect(r.path).toBe('/students/admissions')
    expect(r.query.tab).toBe('ivykids')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions && npx vitest run src/router/__tests__/admissionsRedirects.spec.ts`
Expected: FAIL

- [ ] **Step 3: router 改 redirect（function 形式保留 query）**

`src/router/index.ts` 103-112 改為：

```ts
        {
            // 招生統計已重構為學生模組下的「招生入學」；舊連結 redirect 並保留 query
            path: '/recruitment',
            redirect: (to) => ({ path: '/students/admissions', query: to.query })
        },
        {
            // 官網報名 → 招生入學的官網報名 tab
            path: '/recruitment-ivykids',
            redirect: { path: '/students/admissions', query: { tab: 'ivykids' } }
        },
```

- [ ] **Step 4: 刪兩個舊 view + 確認無殘留引用**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions rm src/views/RecruitmentView.vue src/views/RecruitmentIvykidsView.vue
grep -rn "RecruitmentView\|RecruitmentIvykidsView" /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions/src --include="*.ts" --include="*.vue"
```

Expected: grep 僅剩 `useRecruitmentCharts.ts:32` 的註解（把該行註解改為「招生入學統計分析所有圖表…」）。若 router/index.ts 還有 `RecruitmentView` 的 import 或元件引用，一併移除。

- [ ] **Step 5: 側邊欄搬移**

`src/components/layout/AdminSidebar.vue`：

① 在 group-students 的 `/student-enrollment` 條目**之前**插入（緊接 `/students` 之後）：

```html
          <el-menu-item v-if="canView.RECRUITMENT_READ" index="/students/admissions">
            <el-icon><DataAnalysis /></el-icon>
            <template #title>招生入學</template>
          </el-menu-item>
```

② 刪除整個 group-stats `<el-sub-menu>` 區塊（106-115 行，含「園務統計」註解）。

③ `hasVisibleStudentItems` computed 加上 RECRUITMENT_READ：

```ts
const hasVisibleStudentItems = computed(() =>
  canView.value.STUDENTS_READ || canView.value.CLASSROOMS_READ || canView.value.FEES_READ ||
  canView.value.RECRUITMENT_READ
)
```

④ 刪除 `hasVisibleStatsItems` computed（已無使用處）。`DataAnalysis` icon import 保留（仍在用）。

- [ ] **Step 6: 更新三個呼叫點**

```ts
// src/constants/routes.ts:22
  RECRUITMENT: '/students/admissions',
```

```ts
// src/components/GlobalSearch.vue:129（path 改掉，其餘不動）
    navigate: i => router.push({ path: '/students/admissions', query: { keyword: String(i.child_name ?? '') } }) },
```

```ts
// src/components/dashboard/QuickAddMenu.vue:56（path 改為帶 tab=records 直落訪視明細）
  { key: 'recruitment', label: '訪視記錄', icon: School, permission: 'RECRUITMENT_WRITE', action: 'navigate', path: '/students/admissions?tab=records' },
```

並把 `src/constants/permissions.ts` 中 `/recruitment-ivykids` 的註解改為：

```ts
  // /recruitment 與 /recruitment-ivykids 為 redirect 至 /students/admissions（router 在 guard 前先導向），
  // /recruitment 規則保留供 redirect 解析；ivykids 不需獨立規則。
```

- [ ] **Step 7: 跑測試 + typecheck + 全套 vitest**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions && npx vitest run src/router/__tests__/admissionsRedirects.spec.ts && npm run typecheck && npx vitest run`
Expected: redirect 測試 PASS、typecheck 0 錯誤、全套綠（若有紅，先單獨重跑判 flaky/真失敗，僅修與本變更相關者；既有 baseline 紅與本變更無關則記錄不修）

- [ ] **Step 8: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions add -A
git -C /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions commit -m "feat(admissions)!: /recruitment 切換至 /students/admissions，刪除舊招生統計巨頁

redirect 保留 query（全域搜尋 keyword 深連結不斷）；側邊欄「招生統計」
移入學生與班級群組改名「招生入學」，園務統計空組移除。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: ClassroomView 班級卡顯示準新生保留數

頁面層打一次 `getIntakePlan`（一次回全年級 rows），按 grade_id 分發給各卡，**不得**每卡一發（N+1）。失敗時靜默降級（不顯示保留數、不阻塞班級頁）。

**Files:**
- Create: `src/utils/classroomReserved.ts`
- Modify: `src/views/ClassroomView.vue`（script + 卡片 template 525 行附近）
- Test: `src/utils/__tests__/classroomReserved.test.ts`

- [ ] **Step 1: 寫失敗測試（純函式）**

```ts
// src/utils/__tests__/classroomReserved.test.ts
import { describe, it, expect } from 'vitest'
import { mapReservedByGrade, reservedCountFor } from '@/utils/classroomReserved'

describe('班級卡準新生保留數', () => {
  it('mapReservedByGrade 把 intake-plan rows 轉成 grade_id → reserved_count', () => {
    expect(
      mapReservedByGrade([
        { grade_id: 1, reserved_count: 3 },
        { grade_id: 2, reserved_count: 0 },
      ]),
    ).toEqual({ 1: 3, 2: 0 })
  })

  it('reservedCountFor 以班級 grade_id 查表，無年級或無資料回 0', () => {
    const map = { 1: 3 }
    expect(reservedCountFor(map, { grade_id: 1 })).toBe(3)
    expect(reservedCountFor(map, { grade_id: 9 })).toBe(0)
    expect(reservedCountFor(map, { grade_id: null })).toBe(0)
    expect(reservedCountFor(map, {})).toBe(0)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions && npx vitest run src/utils/__tests__/classroomReserved.test.ts`
Expected: FAIL（模組不存在）

- [ ] **Step 3: 建純函式模組**

```ts
// src/utils/classroomReserved.ts
/**
 * 班級卡「保留座位（準新生）」：intake-plan 一次回全年級 rows，
 * 頁面層打一次 API 後以此表分發各卡，避免每卡一發的 N+1。
 * 注意：reserved_count 是「年級」維度（同年級多班共用同一數字）。
 */
export interface IntakePlanRowLite {
  grade_id: number
  reserved_count: number
  [key: string]: unknown
}

export function mapReservedByGrade(rows: IntakePlanRowLite[]): Record<number, number> {
  return Object.fromEntries(rows.map((r) => [r.grade_id, r.reserved_count]))
}

export function reservedCountFor(
  map: Record<number, number>,
  classroom: { grade_id?: number | null },
): number {
  if (classroom.grade_id == null) return 0
  return map[classroom.grade_id] ?? 0
}
```

- [ ] **Step 4: ClassroomView 接線**

script（`import` 區與狀態區）加：

```ts
import { getIntakePlan } from '@/api/recruitmentIntake'
import { mapReservedByGrade, reservedCountFor, type IntakePlanRowLite } from '@/utils/classroomReserved'

const reservedByGrade = ref<Record<number, number>>({})

async function loadReservedCounts() {
  try {
    const resp = await getIntakePlan({
      school_year: Number(filterSchoolYear.value),
      semester: Number(filterSemester.value) || 1,
    })
    const rows = ((resp.data as { rows?: IntakePlanRowLite[] }).rows ?? [])
    reservedByGrade.value = mapReservedByGrade(rows)
  } catch {
    // 招生資料拿不到不阻塞班級頁：膠囊降級不顯示
    reservedByGrade.value = {}
  }
}
```

找到既有的 `fetchClassrooms`（或載入班級列表的函式）呼叫處，在其後**並行**呼叫 `void loadReservedCounts()`；若有 watch 學年/學期變更重抓班級的位置，同步加 `void loadReservedCounts()`。

template 525 行「學生人數」段落，在 `{{ classroom.current_count }} / {{ classroom.capacity }}` 後、已滿/接近額滿 tag 前插入：

```html
            <el-tag
              v-if="reservedCountFor(reservedByGrade, classroom) > 0"
              type="warning"
              effect="plain"
              size="small"
              style="margin-left: 6px"
              :title="`同年級暫定編班（未報到）${reservedCountFor(reservedByGrade, classroom)} 人`"
            >保留 {{ reservedCountFor(reservedByGrade, classroom) }}</el-tag>
```

- [ ] **Step 5: 跑測試 + typecheck**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions && npx vitest run src/utils/__tests__/classroomReserved.test.ts && npm run typecheck`
Expected: PASS、0 錯誤

- [ ] **Step 6: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions add src/utils/classroomReserved.ts src/utils/__tests__/classroomReserved.test.ts src/views/ClassroomView.vue
git -C /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions commit -m "feat(classrooms): 班級卡顯示同年級準新生保留數（intake-plan 頁面層單次抓取）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: 全套驗證 + 實機整合測試

- [ ] **Step 1: 全套 vitest + typecheck**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions && npx vitest run 2>&1 | tail -20 && npm run typecheck`
Expected: 全綠（紅的先單獨重跑判 flaky；與本變更無關的既有 baseline 紅記錄下來回報，不硬修）

- [ ] **Step 2: 實機整合驗證（需與 user 同在或回報清單）**

後端照常跑主 checkout；前端 dev server 指到 worktree、用 3000 port（避開主 checkout 的 5173；後端 CORS 預設放行 5173/3000）：

```bash
cd ~/Desktop/ivyManageSystem && ./start.sh   # 另開終端（若未在跑）
cd /Users/yilunwu/Desktop/ivy-frontend/.worktrees/admissions && npx vite --port 3000 --strictPort
```

逐項走（瀏覽器 http://localhost:3000）：
1. 側邊欄「學生與班級」群組出現「招生入學」；「園務統計」群組消失
2. `/students/admissions` 預設落漏斗看板，四欄渲染、卡片可點開 timeline
3. 漏斗推進一筆：visited→deposited（即按鈕/拖曳）、deposited→enrolled（彈分班 dialog）成功且看板刷新
4. 訪視明細：列表載入、新增一筆、編輯、轉化按鈕只在已預繳未報到列出現、轉化成功彈「查看檔案」
5. 統計分析 8 個次分頁逐一切換渲染（總覽圖表、班別/來源/接待表格、區域地圖、未預繳列表、童年綠地 KPI、近五年）
6. 總覽的行動佇列/警示點擊 → 跳到訪視明細並帶篩選（下鑽）
7. 名額規劃、官網報名 tab 渲染
8. 舊網址 `/recruitment` 與 `/recruitment-ivykids` redirect 正確；全域搜尋點幼生 → 落訪視明細帶 keyword
9. `/classrooms` 班級卡出現「保留 N」膠囊（與 drawer 內「保留」數字一致）；Network 面板確認 intake-plan 只打一次
10. 瀏覽器 console 無錯誤

- [ ] **Step 3: 回報結果**

整理：測試數、typecheck、實機清單逐項結果、發現的問題。**不在本 task 內 push**（push 前需 user 確認；收尾照 workspace 收尾紀律：push + CI 綠 + worktree remove）。

---

## Self-review 紀錄

- Spec 覆蓋：5 個頂層 tab（T1/T4/T6）、統計 8 分頁（T5/T6）、轉化改 transition（T2）、路由/權限/側邊欄（T1/T7）、redirect 與三個呼叫點（T7）、班級卡膠囊+N+1 防護（T8）、刪除兩個舊 view（T7）、測試計畫與實機驗證（各 task + T9）——全數有對應 task。
- Spec 的「ConvertDialog 改打 transition」在研究後具體化：dialog 簡化為僅選分班（學號後端已忽略、性別/日期不在 TransitionIn），並補 has_deposit gate——此為 spec「順手修正」的正確落地，偏離處（拿掉三欄位）已寫明理由。
- 型別一致性：`dashboard` prop 統一 `ReturnType<typeof useRecruitmentDashboard>`；四 tab 元件 props 與 Task 6 掛載處一致；`drill-records` payload 為 filter patch object 兩端一致。
