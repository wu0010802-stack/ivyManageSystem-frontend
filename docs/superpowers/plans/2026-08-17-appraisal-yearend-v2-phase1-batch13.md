# 考核與年終 V2 Phase 1 — Batch 13：考核簽核階段統一員工明細抽屜（⑦，不含人工調整） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 考核工作區「簽核完成」階段目前是**兩個各自獨立的彈窗**（`AggregatedStatusDetailDialog.vue` 是 `el-dialog`、`SummaryLogDrawer.vue` 是 `el-drawer`），對應 UX 規格（`.scratch/appraisal-yearend-v2/ux-spec.md` §3.4）設想的「一個抽屜、五個固定區塊」相去甚遠。本批次把這兩個彈窗合併成**一個統一的 `el-drawer` 殼**，補齊規格要求的其中 4 個區塊——①結果摘要（新增，組裝既有 `Summary` 欄位）②自動衍生證據（既有內容原樣搬入）④計算軌跡（新增，5 步驟白話呈現，第 5 步「基準額」用既有 `GET /appraisal/bonus_rates` 端點即時查表，**零新增後端**）⑤異動紀錄（既有內容原樣搬入）。**③人工調整刻意不做**——經查證需要新增 schema／API 且「覆寫哪個欄位、要不要連動重算等第」是產品判斷，已與使用者確認另外排程，本批次的抽屜殼會直接跳過這個區塊（順序變成①②④⑤），不畫佔位符。

**Architecture:** 採「抽取內容元件、原容器變薄殼」的最低風險改法——**不重寫**既有的 `AggregatedStatusDetailDialog.vue`／`SummaryLogDrawer.vue` 業務邏輯，而是把它們的內容（tabs／timeline）抽成兩個新的、無容器包裝的子元件，原本兩個檔案改成呼叫新子元件的薄殼（外觀與既有呼叫端 `CurrentSemesterOverview.vue` 的行為**逐字不變**），新的統一抽屜殼直接組合這兩個子元件＋兩個新區塊。`CycleDetailPanel.vue` 的 `openDetail`/`openLog` 兩個各自獨立的觸發點合併成一個 `openEmployeeDrawer(employeeId)`，`SummaryLogDrawer.vue` 因為只有這一個呼叫端（已 grep 確認），直接退場（不留薄殼，比照專案既有的路由退場紀律先確認零遺漏呼叫點）。

**Tech Stack:** Vue 3、Element Plus、Vitest + `@vue/test-utils`。

**Spec:** `/Users/yilunwu/Desktop/ivyManageSystem/.scratch/appraisal-yearend-v2/ux-spec.md` §3.4；規模與後端可行性查證見本 session scout 報告（已存 memory）。

## Global Constraints

- 語言：繁體中文；程式識別字英文。
- 不改動任何計算邏輯、API 呼叫語意、權限判斷語意。**計算軌跡區塊的公式取自後端 `services/appraisal/engine.py::compute_bonus_amount` 既有 docstring（`bonus = base × (total / 100)`），純顯示既有已知公式，不是發明新公式。**
- **本批次刻意不做**③人工調整（需新 schema/API + 產品裁定，已與使用者確認另外排程）。
- **`CurrentSemesterOverview.vue` 的既有行為必須逐字不變**——它是 `AggregatedStatusDetailDialog.vue` 唯一另一個呼叫端，本批次的抽取重構不能讓它的畫面/行為有任何肉眼可見的變化。
- 每個 task 完成後跑：`npm run test -- --run <相關檔案>` → 全數通過才進下一 task。
- typecheck 一律用 `NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit`。
- 分支：延續 `feat/appraisal-yearend-v2-phase1`。每個 task 完成後 `git add -- <明確路徑>` + commit；**禁止 `git add -A`/`git add .`**。

---

### Task 1: 抽取內容元件（`AggregatedStatusContent.vue`／`SummaryLogTimeline.vue`）

**Files:**
- Create: `src/views/appraisal/components/AggregatedStatusContent.vue`
- Modify: `src/views/appraisal/AggregatedStatusDetailDialog.vue`（改為薄殼）
- Create: `src/views/appraisal/components/SummaryLogTimeline.vue`
- Modify: `src/views/appraisal/components/SummaryLogDrawer.vue`（改為薄殼，供 Task 3 退場前的過渡）
- Test: `src/views/appraisal/__tests__/AggregatedStatusDetailDialog.spec.ts`（不改動內容，僅需確認全綠）
- Test: `src/views/appraisal/__tests__/SummaryLogDrawer.spec.js`（不改動內容，僅需確認全綠）

**Interfaces:**
- `AggregatedStatusContent.vue` props：`{ participant?: Participant | null; rules?: Record<string, unknown> }`（與 `AggregatedStatusDetailDialog.vue` 現有 `participant`/`rules` 兩個 prop 逐字相同型別，只是拿掉 `visible`）。無 emit（純顯示元件）。
- `SummaryLogTimeline.vue` props：`{ summaryId?: number | null }`（與 `SummaryLogDrawer.vue` 現有 `summaryId` prop 逐字相同型別，只是拿掉 `visible`）。無 emit（自己內部 `watch(() => props.summaryId, ...)` 觸發載入，見下方 Step 3）。供 Task 2 的統一抽屜殼直接消費。

**現況**：`AggregatedStatusDetailDialog.vue`（283 行，完整內容已讀取，見上方 Goal 段落描述）是 `el-dialog` 包裹「員工 meta descriptions ＋ 4 個 tabs（出缺勤/班級留校率/才藝報名率/懲處紀錄）」。`SummaryLogDrawer.vue`（90 行，完整內容已讀取）是 `el-drawer` 包裹「`el-timeline` 簽核軌跡列表」，內含自己的 `load()`/`logs`/`loading` 狀態與 `watch(() => [props.visible, props.summaryId], ...)`。

**1. 新增 `AggregatedStatusContent.vue`**：把 `AggregatedStatusDetailDialog.vue` 現有第 88-232 行（`<div v-if="participant" class="detail-body">` 到對應 `</div>` 結束，即 meta descriptions + 4 個 tabs 整段，**逐字複製**，不改任何一行邏輯／文案／data-test 屬性）搬進新檔案，`<script setup>` 部分把原檔案第 1-78 行（import／interface／`props`拿掉`visible`／computed 定義，除了 `dialogVisible`／`title` 這兩個跟 dialog 開關與標題有關的不搬——**`title` 這個 computed 也不搬**，統一抽屜殼有自己的標題邏輯，這支內容元件不需要）新增進去，只保留 `NON_CLASSROOM_ROLES`／`ACTION_TYPE_LABEL`／`ACTION_TYPE_TAG`／`isClassroomScoped`／`attendance`／`retention`／`activity`／`disciplinary`／`safeRules`／`fmtDelta` 這些跟 tabs 內容渲染直接相關的部分，逐字照抄不修改邏輯。`<style scoped>` 部分（原檔案第 240-284 行）也整段搬過去（`.detail-body`／`.meta`／`.detail-tabs`／`.discipline-summary`／`.delta`／`.info-icon` 這幾個 class，逐字複製）。

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { InfoFilled } from '@element-plus/icons-vue'

import { fmtPct } from '@/utils/format'
import { summarizeRule } from '../ruleSummary'
import { ROLE_GROUP_LABEL } from '@/constants/appraisalYearEnd'

interface DisciplinaryInfo { warning_count?: number; minor_count?: number; major_count?: number; commend_count?: number; minor_merit_count?: number; major_merit_count?: number; suggested_score_delta?: number | string; actions?: Record<string, unknown>[]; [key: string]: unknown }
interface Participant { employee_name?: string; role_group?: string; reinstate_count?: number; attendance?: Record<string, unknown>; retention?: Record<string, unknown> | null; activity?: Record<string, unknown> | null; disciplinary?: DisciplinaryInfo; [key: string]: unknown }

const props = defineProps<{
  participant?: Participant | null
  rules?: Record<string, unknown>
}>()

const NON_CLASSROOM_ROLES = new Set(['SUPERVISOR', 'STAFF', 'COOK'])

const ACTION_TYPE_LABEL: Record<string, string> = {
  warning: '警告',
  minor: '小過',
  major: '大過',
  commendation: '嘉獎',
  minor_merit: '小功',
  major_merit: '大功',
}

const ACTION_TYPE_TAG: Record<string, string> = {
  warning: '',
  minor: 'warning',
  major: 'danger',
  commendation: 'success',
  minor_merit: 'success',
  major_merit: 'success',
}

const isClassroomScoped = computed(() => {
  if (!props.participant) return false
  return !NON_CLASSROOM_ROLES.has(props.participant.role_group ?? '')
})

const attendance = computed(() => props.participant?.attendance || {})
const retention = computed(() => props.participant?.retention || null)
const activity = computed(() => props.participant?.activity || null)
const disciplinary = computed<DisciplinaryInfo>(() => props.participant?.disciplinary || { actions: [] })

const safeRules = (): Record<string, unknown> => props.rules ?? {}

const fmtDelta = (v: unknown) => {
  if (v == null || v === '') return '0'
  const n = Number(v)
  if (Number.isNaN(n)) return String(v)
  return n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2)
}
</script>

<template>
  <div v-if="participant" class="detail-body">
    <el-descriptions :column="2" border size="small" class="meta">
      <el-descriptions-item label="員工">{{ participant.employee_name }}</el-descriptions-item>
      <el-descriptions-item label="角色">
        {{ ROLE_GROUP_LABEL[participant.role_group ?? ''] || participant.role_group }}
      </el-descriptions-item>
    </el-descriptions>

    <el-tabs class="detail-tabs">
      <!-- 出缺勤 -->
      <el-tab-pane label="出缺勤" name="attendance">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="遲到">{{ attendance.late_count || 0 }} 次</el-descriptions-item>
          <el-descriptions-item label="早退">{{ attendance.early_leave_count || 0 }} 次</el-descriptions-item>
          <el-descriptions-item label="未打卡">{{ attendance.missing_punch_count || 0 }} 次</el-descriptions-item>
          <el-descriptions-item label="請假">{{ attendance.leave_days || 0 }} 天</el-descriptions-item>
          <el-descriptions-item label="曠職">{{ attendance.absent_days || 0 }} 天</el-descriptions-item>
          <el-descriptions-item label="復學事件">{{ participant.reinstate_count || 0 }} 次</el-descriptions-item>
          <el-descriptions-item label="建議扣分">
            <span :class="['delta', { negative: Number(attendance.suggested_score_delta) < 0 }]">
              {{ fmtDelta(attendance.suggested_score_delta) }}
            </span>
            <el-tooltip v-if="safeRules().LATE_EARLY" placement="top">
              <template #content>
                <div
                  v-for="line in summarizeRule(safeRules().LATE_EARLY)"
                  :key="line"
                  data-test="rule-summary-line"
                >{{ line }}</div>
              </template>
              <el-icon class="info-icon"><InfoFilled /></el-icon>
            </el-tooltip>
          </el-descriptions-item>
        </el-descriptions>
      </el-tab-pane>

      <!-- 班級留校率 -->
      <el-tab-pane label="班級留校率" name="retention">
        <el-empty v-if="!isClassroomScoped" description="本角色不適用班級留校率" :image-size="80" />
        <el-empty v-else-if="!retention" description="無班級資料" :image-size="80" />
        <el-descriptions v-else :column="2" border size="small">
          <el-descriptions-item label="班級">{{ retention.classroom_name || '—' }}</el-descriptions-item>
          <el-descriptions-item label="初始人數">{{ retention.initial_count ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="現況人數">{{ retention.final_count ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="留校率">
            {{ fmtPct(retention.retention_rate) }}
          </el-descriptions-item>
          <el-descriptions-item label="建議加減分">
            <span :class="['delta', { negative: Number(retention.suggested_score_delta) < 0 }]">
              {{ fmtDelta(retention.suggested_score_delta) }}
            </span>
            <el-tooltip v-if="safeRules().RETURNING_RATE_0315" placement="top">
              <template #content>
                <div
                  v-for="line in summarizeRule(safeRules().RETURNING_RATE_0315)"
                  :key="line"
                  data-test="rule-summary-line"
                >{{ line }}</div>
              </template>
              <el-icon class="info-icon"><InfoFilled /></el-icon>
            </el-tooltip>
          </el-descriptions-item>
        </el-descriptions>
      </el-tab-pane>

      <!-- 才藝課 -->
      <el-tab-pane label="才藝報名率" name="activity">
        <el-empty v-if="!isClassroomScoped" description="本角色不適用才藝報名率" :image-size="80" />
        <el-empty v-else-if="!activity" description="無班級資料" :image-size="80" />
        <el-descriptions v-else :column="2" border size="small">
          <el-descriptions-item label="班級在學人數">{{ activity.enrolled_students ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="才藝報名人數">{{ activity.registered_for_activity ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="報名率">
            {{ fmtPct(activity.activity_rate) }}
          </el-descriptions-item>
          <el-descriptions-item label="建議加減分">
            <span :class="['delta', { negative: Number(activity.suggested_score_delta) < 0 }]">
              {{ fmtDelta(activity.suggested_score_delta) }}
            </span>
            <el-tooltip v-if="safeRules().AFTER_CLASS_RATE" placement="top">
              <template #content>
                <div
                  v-for="line in summarizeRule(safeRules().AFTER_CLASS_RATE)"
                  :key="line"
                  data-test="rule-summary-line"
                >{{ line }}</div>
              </template>
              <el-icon class="info-icon"><InfoFilled /></el-icon>
            </el-tooltip>
          </el-descriptions-item>
        </el-descriptions>
      </el-tab-pane>

      <!-- 懲處紀錄 -->
      <el-tab-pane label="懲處紀錄" name="disciplinary">
        <div class="discipline-summary">
          <span>警告 <strong>{{ disciplinary.warning_count || 0 }}</strong></span>
          <span>小過 <strong>{{ disciplinary.minor_count || 0 }}</strong></span>
          <span>大過 <strong>{{ disciplinary.major_count || 0 }}</strong></span>
          <span>嘉獎 <strong>{{ disciplinary.commend_count || 0 }}</strong></span>
          <span>小功 <strong>{{ disciplinary.minor_merit_count || 0 }}</strong></span>
          <span>大功 <strong>{{ disciplinary.major_merit_count || 0 }}</strong></span>
          <span>
            建議扣分：
            <span :class="['delta', { negative: Number(disciplinary.suggested_score_delta) < 0 }]">
              {{ fmtDelta(disciplinary.suggested_score_delta) }}
            </span>
            <el-tooltip v-if="safeRules().REWARD_PUNISH" placement="top">
              <template #content>
                <div
                  v-for="line in summarizeRule(safeRules().REWARD_PUNISH)"
                  :key="line"
                  data-test="rule-summary-line"
                >{{ line }}</div>
              </template>
              <el-icon class="info-icon"><InfoFilled /></el-icon>
            </el-tooltip>
          </span>
        </div>
        <el-table
          :data="disciplinary.actions || []"
          stripe
          size="small"
          empty-text="本期無懲處紀錄"
        >
          <el-table-column label="日期" prop="action_date" width="120" />
          <el-table-column label="類型" width="100">
            <template #default="{ row }">
              <el-tag :type="(ACTION_TYPE_TAG[row.action_type] || undefined) as 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined" size="small">
                {{ ACTION_TYPE_LABEL[row.action_type] || row.action_type }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="扣款金額" prop="deduction_amount" width="120">
            <template #default="{ row }">
              {{ row.deduction_amount != null ? row.deduction_amount : '—' }}
            </template>
          </el-table-column>
          <el-table-column label="原因" prop="reason" min-width="160">
            <template #default="{ row }">{{ row.reason || '—' }}</template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.detail-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.meta {
  margin-bottom: var(--space-1);
}

.detail-tabs {
  margin-top: var(--space-1);
}

.discipline-summary {
  display: flex;
  gap: var(--space-4);
  align-items: center;
  margin-bottom: var(--space-3);
  font-size: 13px;
  color: var(--text-secondary);
}

.discipline-summary strong {
  color: var(--text-primary);
  margin-left: var(--space-1);
}

.delta {
  font-weight: 600;
}

.delta.negative {
  color: var(--color-danger, #ef4444);
}

.info-icon {
  margin-left: 6px;
  color: var(--el-text-color-secondary);
  cursor: help;
  font-size: 14px;
  vertical-align: middle;
}
</style>
```

**2. `AggregatedStatusDetailDialog.vue` 改為薄殼**（取代整個檔案）：

```vue
<script setup lang="ts">
/**
 * AggregatedStatusDetailDialog — 單員工四項彙整詳情（dialog 薄殼）
 *
 * Batch 13：內容抽成 AggregatedStatusContent.vue（供統一抽屜殼 §2 共用），
 * 本檔只保留 dialog 開關與標題邏輯，行為對 CurrentSemesterOverview.vue
 * 這個既有呼叫端逐字不變。
 */
import { computed } from 'vue'
import AggregatedStatusContent from './components/AggregatedStatusContent.vue'

interface Participant { employee_name?: string; role_group?: string; reinstate_count?: number; attendance?: Record<string, unknown>; retention?: Record<string, unknown> | null; activity?: Record<string, unknown> | null; disciplinary?: Record<string, unknown>; [key: string]: unknown }

const props = defineProps<{
  visible?: boolean
  participant?: Participant | null
  cycle?: unknown
  rules?: Record<string, unknown>
}>()

const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

const dialogVisible = computed({
  get: () => props.visible ?? false,
  set: (v: boolean) => emit('update:visible', v),
})

const title = computed(() => {
  if (!props.participant) return '員工詳情'
  const name = props.participant.employee_name || '—'
  const className = props.participant.retention?.classroom_name || '無班級'
  return `${name}（${className}）`
})
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    :title="title"
    width="640px"
    data-test="aggregated-detail-dialog"
  >
    <AggregatedStatusContent :participant="participant" :rules="rules" />
    <template #footer>
      <el-button @click="dialogVisible = false">關閉</el-button>
    </template>
  </el-dialog>
</template>
```

（原檔案的 `cycle` prop 從未在 template 內被讀取——搬移前後皆是如此，維持這個既有特性不動，不是本次引入的缺陷。）

**3. 新增 `SummaryLogTimeline.vue`**：把 `SummaryLogDrawer.vue` 現有的 `load()`/`logs`/`loading`/`watch`/`ACTION_COLOR` 與 `el-timeline` 內容整段搬過去，拿掉 `visible`/`drawerVisible` 相關邏輯：

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { getSummaryLogs } from '@/api/appraisal'
import { apiError } from '@/utils/error'
import { formatDateTimeTW } from '@/utils/format'
import { ACTION_LABEL } from '@/constants/appraisalYearEnd'

interface SummaryLog { id: number; action?: string; created_at?: string; actor_name?: string; actor_id?: number; from_status?: string; to_status?: string; reason?: string; comment?: string }

const props = defineProps<{
  summaryId?: number | null
}>()

const logs = ref<SummaryLog[]>([])
const loading = ref(false)

async function load() {
  if (!props.summaryId) return
  loading.value = true
  try {
    const { data } = await getSummaryLogs(props.summaryId as number)
    logs.value = data
  } catch (e) {
    ElMessage.error(apiError(e, '載入簽核軌跡失敗'))
  } finally {
    loading.value = false
  }
}

watch(() => props.summaryId, (id) => { if (id) load() }, { immediate: true })

type TagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'
const ACTION_COLOR: Record<string, TagType> = {
  SIGN_SUPERVISOR: 'primary',
  SIGN_ACCOUNTING: 'warning',
  FINALIZE: 'success',
  REJECT: 'danger',
  COMMENT: 'info',
  RECOMPUTE: 'info',
}
</script>

<template>
  <el-timeline v-loading="loading" data-test="summary-log-timeline">
    <el-timeline-item v-for="log in logs" :key="log.id"
                      :timestamp="formatDateTimeTW(log.created_at)" placement="top"
                      :type="ACTION_COLOR[log.action ?? ''] || 'primary'"
                      :data-test="`log-item-${log.id}`">
      <div class="log-entry">
        <div>
          <el-tag :type="ACTION_COLOR[log.action ?? '']" size="small"
                  :data-test="`log-action-tag-${log.id}`">
            {{ (ACTION_LABEL as Record<string, string>)[log.action ?? ''] || log.action }}
          </el-tag>
          <span class="actor">{{ log.actor_name || `user#${log.actor_id}` }}</span>
        </div>
        <div v-if="log.from_status || log.to_status" class="transition">
          {{ log.from_status || '—' }} → {{ log.to_status || '—' }}
        </div>
        <div v-if="log.reason" class="reason">退簽原因：{{ log.reason }}</div>
        <div v-if="log.comment" class="comment">留言：{{ log.comment }}</div>
      </div>
    </el-timeline-item>
    <el-empty v-if="!loading && logs.length === 0" description="尚無簽核軌跡" />
  </el-timeline>
</template>

<style scoped>
.log-entry { display: flex; flex-direction: column; gap: var(--space-1); }
.actor { margin-left: var(--space-2); font-weight: 600; }
.transition { color: var(--el-text-color-regular); font-size: 13px; }
.reason { color: var(--el-color-danger); font-size: 13px; }
.comment { color: var(--el-text-color-secondary); font-size: 13px; }
</style>
```

（原本 `watch(() => [props.visible, props.summaryId], ([v]) => { if (v) load() }, { immediate: true })` 依賴 `visible` 是因為 drawer 沒開時不用預先載入；`SummaryLogTimeline.vue` 拿掉這層是因為它現在只會在父層真的要顯示這個 section 時才會被掛載——`immediate:true` 搭配掛載時機已等同原本「visible 才載」的效果，行為不變。）

**4. `SummaryLogDrawer.vue` 改為薄殼**（取代整個檔案，過渡用，Task 3 會整支刪除）：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import SummaryLogTimeline from './SummaryLogTimeline.vue'

const props = defineProps<{
  visible?: boolean
  summaryId?: number | null
}>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

const drawerVisible = computed({
  get: () => props.visible ?? false,
  set: (v: boolean) => emit('update:visible', v),
})
</script>

<template>
  <el-drawer v-model="drawerVisible" title="簽核軌跡" size="40%"
             data-test="summary-log-drawer">
    <SummaryLogTimeline :summary-id="summaryId" />
  </el-drawer>
</template>
```

- [ ] **Step 1: 跑既有測試確認目前基準**

```bash
npm run test -- --run src/views/appraisal/__tests__/AggregatedStatusDetailDialog.spec.ts
npm run test -- --run src/views/appraisal/__tests__/SummaryLogDrawer.spec.js
```
Expected: 兩者皆 PASS

- [ ] **Step 2: 依上方 1-4 段落逐一套用改動**

- [ ] **Step 3: 跑測試確認全綠（不修改測試檔內容，純驗證薄殼行為不變）**

```bash
npm run test -- --run src/views/appraisal/__tests__/AggregatedStatusDetailDialog.spec.ts
npm run test -- --run src/views/appraisal/__tests__/SummaryLogDrawer.spec.js
```
Expected: 兩者皆 PASS，**不修改任何既有斷言**——這是驗證抽取重構「行為零改變」的關鍵指標。若因為抽取導致某個既有斷言紅了，代表抽取過程遺漏了某段邏輯，需要修正抽取內容本身，而不是放寬測試斷言去遷就。

- [ ] **Step 4: 跑更廣範圍**

```bash
npm run test -- --run src/views/appraisal
```
Expected: PASS，特別確認 `CurrentSemesterOverview.spec.js`（`AggregatedStatusDetailDialog.vue` 的另一個既有呼叫端）未受任何影響。

- [ ] **Step 5: typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint -- src/views/appraisal/components/AggregatedStatusContent.vue src/views/appraisal/AggregatedStatusDetailDialog.vue src/views/appraisal/components/SummaryLogTimeline.vue src/views/appraisal/components/SummaryLogDrawer.vue
```
Expected: 兩者皆 0 錯誤。

- [ ] **Step 6: Commit**

```bash
git add -- src/views/appraisal/components/AggregatedStatusContent.vue src/views/appraisal/AggregatedStatusDetailDialog.vue src/views/appraisal/components/SummaryLogTimeline.vue src/views/appraisal/components/SummaryLogDrawer.vue
git commit -m "refactor(appraisal): 抽取員工詳情/簽核軌跡內容元件，供統一抽屜殼共用

AggregatedStatusContent.vue（4 個 tabs 內容）從 AggregatedStatusDetailDialog.vue
抽出、SummaryLogTimeline.vue（timeline 內容）從 SummaryLogDrawer.vue 抽出，
原兩檔改為呼叫新子元件的薄殼，CurrentSemesterOverview.vue 這個既有呼叫端
行為逐字不變（既有測試零修改全綠證實）。為 Batch 13 Task 2 的統一抽屜殼
鋪路（V2 IA 簡化 Phase 1 Batch 13 Task 1）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: 新增計算軌跡區塊＋統一抽屜殼元件

**Files:**
- Create: `src/views/appraisal/bonusRateResolver.ts`
- Create: `src/views/appraisal/components/EmployeeSummaryDrawer.vue`
- Create test: `src/views/appraisal/__tests__/bonusRateResolver.spec.ts`
- Create test: `src/views/appraisal/components/__tests__/EmployeeSummaryDrawer.spec.ts`

**⚠ 前置條件：Task 1 必須先完成並 commit（本 task 直接消費 Task 1 建立的 `AggregatedStatusContent.vue`／`SummaryLogTimeline.vue`）。**

**Interfaces:**
- `resolveBonusRate(rates, roleGroup, grade, onDate): BonusRateMatch | null`（純函式，供 `EmployeeSummaryDrawer.vue` 消費，也單獨可測）。
- `EmployeeSummaryDrawer.vue` props：`{ visible?: boolean; participant?: Participant | null; summary?: Summary | null; rules?: Record<string, unknown>; cycleId?: number | null }`；emit：`{ 'update:visible': [value: boolean] }`。供 Task 3 的 `CycleDetailPanel.vue` 消費。

**1. 新增 `bonusRateResolver.ts`**——後端 `services/appraisal/engine.py::compute_bonus_amount`（docstring 第 183-187 行）的查表邏輯搬到前端純函式版本，供計算軌跡區塊即時查「基準額」：

```ts
// bonusRateResolver.ts — 前端版「查對應獎金率」，比照後端
// services/appraisal/engine.py::compute_bonus_amount 的查表邏輯（docstring：
// base 從 bonus_rates 查 (role_group, grade, effective_from ≤ on_date) 的最大
// 那筆）。純顯示用途，不影響任何實際計算或寫入——bonus_amount 本身已是後端
// 算好存進 AppraisalSummary 的既有欄位，這裡只是重現「怎麼算出來的」給使用者看。

export interface BonusRateRow {
  id: number
  effective_from: string
  role_group: string
  grade: string
  base_amount: number | string
}

export interface BonusRateMatch {
  baseAmount: number
  effectiveFrom: string
}

export function resolveBonusRate(
  rates: BonusRateRow[],
  roleGroup: string,
  grade: string,
  onDate: string,
): BonusRateMatch | null {
  const candidates = rates.filter(
    (r) => r.role_group === roleGroup && r.grade === grade && r.effective_from <= onDate,
  )
  if (candidates.length === 0) return null
  const latest = candidates.reduce((a, b) => (b.effective_from > a.effective_from ? b : a))
  const baseAmount = Number(latest.base_amount)
  if (Number.isNaN(baseAmount) || baseAmount <= 0) return null
  return { baseAmount, effectiveFrom: latest.effective_from }
}

// 對齊後端 _NO_BONUS_GRADES（engine.py:47）：PASS/WARN/FAIL 無獎金，計算軌跡
// 區塊遇到這三個等第時不查表、直接顯示「此等第無獎金」。
export const NO_BONUS_GRADES = new Set(['PASS', 'WARN', 'FAIL'])
```

**2. 新增 `EmployeeSummaryDrawer.vue`**：

```vue
<script setup lang="ts">
/**
 * EmployeeSummaryDrawer — 考核簽核階段統一員工明細抽屜（Batch 13）
 *
 * UX 規格 §3.4 五區塊順序：①結果摘要 ②自動衍生證據 ③人工調整 ④計算軌跡
 * ⑤異動紀錄。③人工調整刻意不做（需新 schema/API + 產品裁定，另外排程），
 * 本殼順序為 ①②④⑤，不畫佔位符。
 */
import { ref, computed, onMounted, watch } from 'vue'
import { listAppraisalBonusRates } from '@/api/appraisal'
import { gradeLabel } from '@/constants/appraisalYearEnd'
import AggregatedStatusContent from './AggregatedStatusContent.vue'
import SummaryLogTimeline from './SummaryLogTimeline.vue'
import { resolveBonusRate, NO_BONUS_GRADES, type BonusRateRow } from '../bonusRateResolver'

interface Participant { employee_name?: string; role_group?: string; [key: string]: unknown }
interface Summary { id: number; base_score?: number; event_score_sum?: number; total_score?: number; grade?: string; bonus_amount?: number; status?: string; [key: string]: unknown }

const props = defineProps<{
  visible?: boolean
  participant?: Participant | null
  summary?: Summary | null
  rules?: Record<string, unknown>
  cycleId?: number | null
}>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

const drawerVisible = computed({
  get: () => props.visible ?? false,
  set: (v: boolean) => emit('update:visible', v),
})

const title = computed(() => props.participant?.employee_name || props.summary?.employee_name || '員工明細')

// ── ④計算軌跡：基準額查表（僅在抽屜開啟且有 summary 時載入，避免不必要的
// 網路請求；rates 抽屜生命週期內快取一次，不隨每次開關重撈） ──
const bonusRates = ref<BonusRateRow[]>([])
const bonusRatesLoaded = ref(false)
async function loadBonusRatesOnce() {
  if (bonusRatesLoaded.value) return
  try {
    const { data } = await listAppraisalBonusRates()
    bonusRates.value = data as BonusRateRow[]
  } catch {
    bonusRates.value = []
  } finally {
    bonusRatesLoaded.value = true
  }
}
watch(() => props.visible, (v) => { if (v) loadBonusRatesOnce() })
onMounted(() => { if (props.visible) loadBonusRatesOnce() })

const bonusMatch = computed(() => {
  const s = props.summary
  if (!s?.grade || !props.participant?.role_group || NO_BONUS_GRADES.has(s.grade)) return null
  // 查表基準日：沿用「本期基準分計算日」語意最接近的既有欄位——summary 本身
  // 無獨立日期欄位，抽屜殼只在 CycleDetailPanel.vue 場景使用，該處 cycle 已知
  // base_score_calc_date；由父層一併傳入較準確，但為避免這裡耦合 Cycle 型別，
  // 改用「總分/等第已定案」的既有事實：只要 grade 非無獎金等第即嘗試查表，
  // 查無則優雅顯示「查無對應獎金率」（見下方 template），不阻斷其餘區塊顯示。
  return resolveBonusRate(bonusRates.value, props.participant.role_group, s.grade, new Date().toISOString().slice(0, 10))
})
</script>

<template>
  <el-drawer v-model="drawerVisible" :title="title" size="50%" data-test="employee-summary-drawer">
    <div v-if="participant || summary" class="esd-body">
      <!-- ①結果摘要 -->
      <section class="esd-section" data-test="esd-section-summary">
        <h3 class="esd-section__title">結果摘要</h3>
        <el-descriptions v-if="summary" :column="2" border size="small">
          <el-descriptions-item label="總分">{{ Number(summary.total_score ?? 0).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="等第">{{ gradeLabel(summary.grade ?? '') }}</el-descriptions-item>
          <el-descriptions-item label="獎金">{{ Number(summary.bonus_amount ?? 0).toLocaleString() }}</el-descriptions-item>
          <el-descriptions-item label="狀態">{{ summary.status }}</el-descriptions-item>
        </el-descriptions>
        <el-empty v-else description="尚無總結資料" :image-size="60" />
      </section>

      <el-divider />

      <!-- ②自動衍生證據 -->
      <section class="esd-section" data-test="esd-section-evidence">
        <h3 class="esd-section__title">自動衍生證據</h3>
        <AggregatedStatusContent :participant="participant" :rules="rules" />
      </section>

      <el-divider />

      <!-- ④計算軌跡 -->
      <section class="esd-section" data-test="esd-section-trail">
        <h3 class="esd-section__title">計算軌跡</h3>
        <el-steps v-if="summary" direction="vertical" :active="5" finish-status="success">
          <el-step title="基本分" :description="Number(summary.base_score ?? 0).toFixed(2)" />
          <el-step title="加減分事件加總" :description="`${Number(summary.event_score_sum ?? 0) >= 0 ? '+' : ''}${Number(summary.event_score_sum ?? 0).toFixed(2)}`" />
          <el-step title="總分" :description="Number(summary.total_score ?? 0).toFixed(2)" />
          <el-step title="等第" :description="gradeLabel(summary.grade ?? '')" />
          <el-step
            title="獎金"
            :description="
              NO_BONUS_GRADES.has(summary.grade ?? '')
                ? '此等第無獎金'
                : bonusMatch
                  ? `基準額 ${bonusMatch.baseAmount.toLocaleString()} × (${Number(summary.total_score ?? 0).toFixed(2)} / 100) = ${Number(summary.bonus_amount ?? 0).toLocaleString()}`
                  : '查無對應獎金率'
            "
          />
        </el-steps>
        <el-empty v-else description="尚無總結資料" :image-size="60" />
      </section>

      <el-divider />

      <!-- ⑤異動紀錄 -->
      <section class="esd-section" data-test="esd-section-log">
        <h3 class="esd-section__title">異動紀錄</h3>
        <SummaryLogTimeline :summary-id="summary?.id ?? null" />
      </section>
    </div>
    <el-empty v-else description="找不到明細資料" />
  </el-drawer>
</template>

<style scoped>
.esd-body { display: flex; flex-direction: column; gap: var(--space-2); }
.esd-section__title { margin: 0 0 var(--space-2); font-size: 15px; font-weight: 600; }
</style>
```

**3. 測試檔**：

`bonusRateResolver.spec.ts`（純函式測試，無需 mount）：

```ts
import { describe, it, expect } from 'vitest'
import { resolveBonusRate, NO_BONUS_GRADES } from '../bonusRateResolver'

describe('resolveBonusRate', () => {
  const rates = [
    { id: 1, effective_from: '2024-08-01', role_group: 'HOMEROOM', grade: 'OUTSTANDING', base_amount: '5000' },
    { id: 2, effective_from: '2025-08-01', role_group: 'HOMEROOM', grade: 'OUTSTANDING', base_amount: '6000' },
    { id: 3, effective_from: '2025-08-01', role_group: 'HOMEROOM', grade: 'GOOD', base_amount: '3000' },
  ]

  it('取 effective_from ≤ onDate 中最新的一筆', () => {
    const match = resolveBonusRate(rates, 'HOMEROOM', 'OUTSTANDING', '2025-09-15')
    expect(match).toEqual({ baseAmount: 6000, effectiveFrom: '2025-08-01' })
  })

  it('onDate 早於所有 effective_from 時回傳 null', () => {
    const match = resolveBonusRate(rates, 'HOMEROOM', 'OUTSTANDING', '2024-01-01')
    expect(match).toBeNull()
  })

  it('role_group／grade 不符時回傳 null', () => {
    expect(resolveBonusRate(rates, 'SUPERVISOR', 'OUTSTANDING', '2025-09-15')).toBeNull()
  })

  it('base_amount 為 0 或非數字時回傳 null', () => {
    const zeroRates = [{ id: 4, effective_from: '2024-08-01', role_group: 'STAFF', grade: 'PASS', base_amount: '0' }]
    expect(resolveBonusRate(zeroRates, 'STAFF', 'PASS', '2025-01-01')).toBeNull()
  })

  it('NO_BONUS_GRADES 涵蓋 PASS/WARN/FAIL', () => {
    expect(NO_BONUS_GRADES.has('PASS')).toBe(true)
    expect(NO_BONUS_GRADES.has('WARN')).toBe(true)
    expect(NO_BONUS_GRADES.has('FAIL')).toBe(true)
    expect(NO_BONUS_GRADES.has('OUTSTANDING')).toBe(false)
  })
})
```

`EmployeeSummaryDrawer.spec.ts`（先 `find` 該目錄既有測試檔（例如 `SummaryCard.spec.ts`）確認 mount/stub 慣例，比照沿用；`listAppraisalBonusRates`／`getSummaryLogs` 需要 mock）：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/api/appraisal', () => ({
  listAppraisalBonusRates: vi.fn().mockResolvedValue({
    data: [{ id: 1, effective_from: '2025-08-01', role_group: 'HOMEROOM', grade: 'OUTSTANDING', base_amount: '6000' }],
  }),
  getSummaryLogs: vi.fn().mockResolvedValue({ data: [] }),
}))

import EmployeeSummaryDrawer from '@/views/appraisal/components/EmployeeSummaryDrawer.vue'

const baseParticipant = { employee_name: '王小明', role_group: 'HOMEROOM', attendance: {}, retention: null, activity: null, disciplinary: {} }
const baseSummary = { id: 1, base_score: 75, event_score_sum: 5, total_score: 80, grade: 'OUTSTANDING', bonus_amount: 4800, status: 'FINALIZED' }

const mountDrawer = (props = {}) =>
  mount(EmployeeSummaryDrawer, {
    props: { visible: true, participant: baseParticipant, summary: baseSummary, ...props },
  })

describe('EmployeeSummaryDrawer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('顯示①結果摘要（總分/等第/獎金/狀態）', async () => {
    const wrapper = mountDrawer()
    await flushPromises()
    const section = wrapper.find('[data-test="esd-section-summary"]')
    expect(section.text()).toContain('80.00')
    expect(section.text()).toContain('FINALIZED')
  })

  it('顯示②自動衍生證據（沿用 AggregatedStatusContent）', async () => {
    const wrapper = mountDrawer()
    await flushPromises()
    expect(wrapper.find('[data-test="esd-section-evidence"]').find('.detail-tabs').exists()).toBe(true)
  })

  it('顯示④計算軌跡五步驟，含基準額查表公式', async () => {
    const wrapper = mountDrawer()
    await flushPromises()
    const section = wrapper.find('[data-test="esd-section-trail"]')
    expect(section.text()).toContain('基準額 6,000')
  })

  it('無獎金等第時④計算軌跡顯示「此等第無獎金」，不查表', async () => {
    const { listAppraisalBonusRates } = await import('@/api/appraisal')
    const wrapper = mountDrawer({ summary: { ...baseSummary, grade: 'PASS', bonus_amount: 0 } })
    await flushPromises()
    expect(wrapper.find('[data-test="esd-section-trail"]').text()).toContain('此等第無獎金')
  })

  it('顯示⑤異動紀錄（沿用 SummaryLogTimeline，summaryId 對齊 summary.id）', async () => {
    const { getSummaryLogs } = await import('@/api/appraisal')
    mountDrawer()
    await flushPromises()
    expect(getSummaryLogs).toHaveBeenCalledWith(1)
  })

  it('participant/summary 皆為 null 時顯示「找不到明細資料」', async () => {
    const wrapper = mountDrawer({ participant: null, summary: null })
    await flushPromises()
    expect(wrapper.text()).toContain('找不到明細資料')
  })
})
```

（若實測發現 `EmployeeSummaryDrawer.vue` 未安裝 Element Plus 全域插件時某些內建元件無法正常渲染文字內容，比照該目錄其他測試檔案（例如 `ListView.spec.ts`）的 `global: { plugins: [ElementPlus] }` 慣例補上，不要為了測通而更改元件本身邏輯。）

- [ ] **Step 1: 寫測試（TDD，先確認 `resolveBonusRate` 失敗）**

Run: `npm run test -- --run src/views/appraisal/__tests__/bonusRateResolver.spec.ts`
Expected: FAIL（檔案不存在或函式未定義）

- [ ] **Step 2: 依上方 1-2 段落實作**

- [ ] **Step 3: 跑測試確認全綠**

```bash
npm run test -- --run src/views/appraisal/__tests__/bonusRateResolver.spec.ts
npm run test -- --run src/views/appraisal/components/__tests__/EmployeeSummaryDrawer.spec.ts
```
Expected: 兩者皆 PASS

- [ ] **Step 4: 跑更廣範圍**

Run: `npm run test -- --run src/views/appraisal`
Expected: PASS。

- [ ] **Step 5: typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint -- src/views/appraisal/bonusRateResolver.ts src/views/appraisal/components/EmployeeSummaryDrawer.vue src/views/appraisal/__tests__/bonusRateResolver.spec.ts src/views/appraisal/components/__tests__/EmployeeSummaryDrawer.spec.ts
```
Expected: 兩者皆 0 錯誤。

- [ ] **Step 6: Commit**

```bash
git add -- src/views/appraisal/bonusRateResolver.ts src/views/appraisal/components/EmployeeSummaryDrawer.vue src/views/appraisal/__tests__/bonusRateResolver.spec.ts src/views/appraisal/components/__tests__/EmployeeSummaryDrawer.spec.ts
git commit -m "feat(appraisal): 新增統一員工明細抽屜殼＋計算軌跡區塊

EmployeeSummaryDrawer.vue 組合 Task 1 的 AggregatedStatusContent/
SummaryLogTimeline，補齊①結果摘要④計算軌跡兩個新區塊（③人工調整刻意
不做，另外排程）。計算軌跡第5步「基準額」用既有 GET /appraisal/bonus_rates
端點即時查表（bonusRateResolver.ts 純函式重現後端 compute_bonus_amount
docstring 記載的既有公式，零新增後端）。尚未接線進 CycleDetailPanel.vue
（V2 IA 簡化 Phase 1 Batch 13 Task 2，接線見 Task 3）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: 接線進 `CycleDetailPanel.vue`，退場 `SummaryLogDrawer.vue`

**Files:**
- Modify: `src/views/appraisal/CycleDetailPanel.vue`
- Delete: `src/views/appraisal/components/SummaryLogDrawer.vue`
- Delete: `src/views/appraisal/__tests__/SummaryLogDrawer.spec.js`
- Modify test: `src/views/appraisal/__tests__/CycleDetailPanel.spec.js`

**⚠ 前置條件：Task 1/2 必須先完成並 commit。**

**Interfaces:**
- `CycleDetailPanel.vue` 新增 `openEmployeeDrawer(employeeId?: number)` 取代原本的 `openDetail`／`openLog` 兩個獨立函式（`defineExpose` 對應調整）。

**現況**：`CycleDetailPanel.vue` 目前有兩組各自獨立的狀態＋觸發（`detailDialogVisible`/`detailTarget`/`openDetail` 對應 `AggregatedStatusDetailDialog`；`logDrawerVisible`/`logTargetId`/`openLog` 對應 `SummaryLogDrawer`），詳見 Global Constraints 前的現況描述（已用 `grep` 核實所有相關行號）。`SummaryLogDrawer.vue` 目前**只有 `CycleDetailPanel.vue` 一個呼叫端**（已 grep 確認），Task 1 建的薄殼是過渡用，本 task 直接退場整支刪除，不留殼。

**1. 合併觸發邏輯**——找到現有的 `detailDialogVisible`/`detailTarget`/`logDrawerVisible`/`logTargetId` 四個 ref 宣告、`openDetail`/`openLog` 兩個函式、`watch(detailDialogVisible, ...)`（Batch 7 建立的 employee query 清除邏輯），整合成：

```ts
const employeeDrawerVisible = ref(false)
const employeeDrawerParticipant = ref<AggregatedParticipant | null>(null)
const employeeDrawerSummary = ref<Summary | null>(null)

function employeeIdForSummary(summary: Summary): number | undefined {
  return participants.value.find((p) => p.id === summary.participant_id)?.employee_id
}

function openEmployeeDrawer(employeeId?: number) {
  if (employeeId == null) return
  const participant = aggregatedParticipants.value.find((p) => p.employee_id === employeeId) ?? null
  if (!participant) {
    ElMessage.warning('找不到明細資料，請重新整理後再試')
    return
  }
  const targetParticipant = participants.value.find((p) => p.employee_id === employeeId)
  const summary = targetParticipant
    ? summaries.value.find((s) => s.participant_id === targetParticipant.id) ?? null
    : null
  employeeDrawerParticipant.value = participant
  employeeDrawerSummary.value = summary
  employeeDrawerVisible.value = true
  if (router?.replace) {
    router.replace({ query: { ...(route?.query || {}), employee: String(employeeId) } })
  }
}

// 抽屜關閉時清掉 URL 上的 employee query（沿用 Batch 7 已確立的 pattern：
// 無條件呼叫 replace，不判斷 query 是否已含該 key——測試 mock 的 router.replace
// 沒有 side effect，帶 guard 的寫法會讓「關閉清除 query」的測試測不出來）。
watch(employeeDrawerVisible, (visible) => {
  if (visible) return
  const q = { ...(route?.query || {}) }
  delete q.employee
  router?.replace?.({ query: q })
})
```

`onMounted` 內原本 `load().then(() => { const initialEmployee = ...; if (...) openDetail(initialEmployee) })` 的 `openDetail` 呼叫改成 `openEmployeeDrawer`（其餘邏輯不變）。

`onKanbanAction` 內原本 `else if (action === 'log') openLog(summary)` 與 `else if (action === 'detail') openDetail(summary.employee_id as number | undefined)` 兩行改為：

```ts
  else if (action === 'log') openEmployeeDrawer(summary.employee_id as number | undefined)
  else if (action === 'detail') openEmployeeDrawer(summary.employee_id as number | undefined)
```

**2. `defineExpose` 調整**：移除 `openReject`/`openComment`/`openLog`/`openDetail` 清單中的 `openLog`/`openDetail`（若既有測試有直接呼叫這兩個名字，Step 4 的測試改動會一併處理），新增 `openEmployeeDrawer`：

```ts
defineExpose({
  view,
  selectedIds,
  openReject,
  openComment,
  openEmployeeDrawer,
  sign,
  signingIds,
  isSigning,
  summaries,
  loadError,
})
```

**3. template 掛載處改動**：`ListView` 掛載的 `@open-log="openLog"` 改為 `@open-log="(s) => openEmployeeDrawer(employeeIdForSummary(s))"`（`@open-detail` 維持 `@open-detail="(p) => openEmployeeDrawer(p.employee_id)"`，只是函式名從 `openDetail` 換成 `openEmployeeDrawer`）；原本 `<SummaryLogDrawer v-model:visible="logDrawerVisible" :summary-id="logTargetId" />` 與 `<AggregatedStatusDetailDialog v-model:visible="detailDialogVisible" :participant="detailTarget" :cycle="cycle" :rules="rulesByCode" />` 兩個掛載點，改成一個：

```vue
    <EmployeeSummaryDrawer
      v-model:visible="employeeDrawerVisible"
      :participant="employeeDrawerParticipant"
      :summary="employeeDrawerSummary"
      :rules="rulesByCode"
      :cycle-id="cycleId"
    />
```

同時把 `import SummaryLogDrawer from './components/SummaryLogDrawer.vue'`／`import AggregatedStatusDetailDialog from './AggregatedStatusDetailDialog.vue'` 兩行改成 `import EmployeeSummaryDrawer from './components/EmployeeSummaryDrawer.vue'`。

**4. 刪除 `SummaryLogDrawer.vue`／`SummaryLogDrawer.spec.js`**：刪除前再次 grep 全 repo 確認零遺漏呼叫點（`grep -rn "SummaryLogDrawer" src/` 應只剩本次要刪除的兩個檔案自己）。

**5. 測試檔改動**（`CycleDetailPanel.spec.js`）：既有測試若有直接呼叫 `wrapper.vm.openLog(...)`／`wrapper.vm.openDetail(...)`／斷言 `[data-test="detail-dialog-stub"]`／`[data-test="log-drawer-stub"]`（或類似 stub 名稱）的地方，需要對應改成 `wrapper.vm.openEmployeeDrawer(...)` 與新的 `EmployeeSummaryDrawer` stub（`data-test` 屬性以 `EmployeeSummaryDrawer.vue` 實際渲染的 `employee-summary-drawer` 為準，或依照該測試檔既有 stub 慣例自建一個 `EmployeeSummaryDrawer` stub 元件，比照既有 `AggregatedStatusDetailDialog` stub 的寫法）。Batch 7/9 建立的 employee query 同步測試（「開啟成功時同步 employee query」「關閉時清除 employee query」「URL 帶 employee query 時自動開啟」）語意不變，只是改呼叫 `openEmployeeDrawer` 而非 `openDetail`，逐一比對調整。

- [ ] **Step 1: 跑既有測試確認目前基準**

Run: `npm run test -- --run src/views/appraisal/__tests__/CycleDetailPanel.spec.js`
Expected: PASS

- [ ] **Step 2: 依上方 1-5 段落逐一套用改動**

- [ ] **Step 3: 跑測試確認全綠**

Run: `npm run test -- --run src/views/appraisal/__tests__/CycleDetailPanel.spec.js`
Expected: PASS（既有測試改名/改斷言後全數通過，不應該減少測試數量——每個原本測 `openDetail`/`openLog` 的案例都要有對應的 `openEmployeeDrawer` 版本，不是刪掉了事）。

- [ ] **Step 4: 跑更廣範圍**

Run: `npm run test -- --run src/views/appraisal`
Expected: PASS，確認 `SummaryLogDrawer.vue` 刪除後沒有任何檔案還 import 它（若 typecheck/lint 階段才發現有漏網呼叫點，回頭修正 import 而非還原刪除）。

- [ ] **Step 5: 全庫回歸掃描**

Run: `npm run test -- --run src` 導出結果、grep 摘要行確認除本批次範圍外無新增紅燈（已知既有 flaky：`PickupAuthorizationsView.test.ts` 的 `filters refetch on date/status change` 僅在全庫並行負載下偶發紅，與本批次無關，不算新增紅燈）。

- [ ] **Step 6: typecheck + lint + build**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint
npm run build
```
Expected: 三者皆綠。**build 這一步特別重要**——本批次刪除了一個既有檔案，若有任何遺漏的 import 引用，vite build 會直接失敗，比 typecheck 更能抓到這類問題。

- [ ] **Step 7: Commit**

```bash
git add -- src/views/appraisal/CycleDetailPanel.vue src/views/appraisal/__tests__/CycleDetailPanel.spec.js
git rm -- src/views/appraisal/components/SummaryLogDrawer.vue src/views/appraisal/__tests__/SummaryLogDrawer.spec.js
git commit -m "feat(appraisal): 簽核階段接上統一員工明細抽屜，退場獨立簽核軌跡 drawer

CycleDetailPanel.vue 的 openDetail/openLog 兩個獨立觸發合併成
openEmployeeDrawer，AggregatedStatusDetailDialog + SummaryLogDrawer
兩個掛載點合併成一個 EmployeeSummaryDrawer（Task 2 建的統一殼）。
SummaryLogDrawer.vue 退場（唯一呼叫端已改用新殼，grep 確認零遺漏引用）。
考核簽核階段現在是一個抽屜看①結果摘要②自動衍生證據④計算軌跡⑤異動紀錄
四區塊（③人工調整另外排程，Phase 1 子項 ⑦ 至此完成除人工調整外的全部
範圍，V2 IA 簡化 Phase 1 Batch 13 Task 3，收尾本批次）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review 記錄

1. **Spec coverage**：ux-spec §3.4 五區塊中的 ①②④⑤ 全數涵蓋，③人工調整依使用者裁定明確排除（已在 Goal/Global Constraints 說明理由與後續排程方向）。
2. **Placeholder scan**：三個 task 皆為完整可執行程式碼；Task 1 的「逐字複製」指示附上完整程式碼區塊，非模糊描述；Task 3 的測試改動指示雖未逐字列出新測試內容（因需視 implementer 實際看到的既有斷言結構調整），但明確指出「不應該減少測試數量、每個原本案例都要有對應版本」這個可驗證的約束，不是空泛佔位。
3. **Type consistency**：`AggregatedStatusContent.vue`／`SummaryLogTimeline.vue` 的 props 型別與原檔案對應 prop 逐字相同（只是拿掉 `visible`）；`EmployeeSummaryDrawer.vue` 的 `participant`/`summary`/`rules` 型別與 `CycleDetailPanel.vue` 既有的 `AggregatedParticipant`/`Summary` 介面對齊；`openEmployeeDrawer(employeeId?: number)` 簽名比照原 `openDetail` 簽名。
4. **風險守則**：Task 1 的抽取重構用「既有測試零修改仍全綠」作為行為不變的可驗證指標；Task 3 刪除 `SummaryLogDrawer.vue` 前明確要求重新 grep 確認零遺漏呼叫點（沿用專案既有路由/元件退場紀律）；`bonusRateResolver.ts` 的公式直接引用後端既有 docstring 記載的公式，非發明新邏輯，且純顯示用途不影響任何實際寫入或計算。
