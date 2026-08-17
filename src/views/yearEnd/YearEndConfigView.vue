<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  getOrgSettings,
  postOrgSettings,
  getClassTargets,
  upsertClassTarget,
  upsertClassTargetsBatch,
  listYearEndCycles,
} from '@/api/yearEnd'
import { getAppraisalCyclesByYear } from '@/api/appraisal'
import { getEmployees } from '@/api/employees'
import { getClassrooms } from '@/api/classrooms'
import { hasPermission } from '@/utils/auth'
import { apiError } from '@/utils/error'
import { fmtPct } from '@/utils/format'
import TargetCrossRef from '@/views/appraisal/components/TargetCrossRef.vue'

// ---- Derive row types from typed API wrappers — no hand-written `any` ----
type OrgSettingsRow = Awaited<ReturnType<typeof getOrgSettings>>['data'][number]
type ClassTargetRow = Awaited<ReturnType<typeof getClassTargets>>['data'][number]
type EmployeeOption = { id: number; name: unknown }
type ClassroomOption = { id: number; name: unknown }

// getAppraisalCyclesByYear（src/api/appraisal.ts）未標注 AxiosResp（既有寫法，
// 見 YearlyEnrollmentTargetSection.vue 同款 CycleEntry pattern）；比照該檔案
// 定義最小欄位介面接住回傳，避免手寫 any。
interface AppraisalCycleEntry {
  semester?: string
  enrollment_target?: number | null
}

const props = defineProps<{ cycleId: number }>()
const router = useRouter()
const cycleId = props.cycleId

// Batch 12：後端 org_settings/class_targets 三個端點皆守 cycle.status != OPEN
// 一律 400（services/year_end/cycle_guard.py::assert_cycle_writable）。cycleStatus
// 借用 loadCycleTargets() 既有的 listYearEndCycles() 呼叫取得（不新增網路請求，
// 見下方 loadCycleTargets 改動）。fail-open：查無/失敗時 cycleStatus 維持 null，
// canWrite 視為「未知，不新增限制」——這裡純粹是 UX 提示，真正的寫入守衛在後端，
// 寧可少擋一次非必要按鈕也不要多擋一次原本允許的操作（比照既有測試多數不 mock
// listYearEndCycles 的現況，fail-open 才能保持這些既有測試不受影響）。
const cycleStatus = ref<string | null>(null)
const canWrite = computed(
  () => hasPermission('YEAR_END_WRITE') && (cycleStatus.value === null || cycleStatus.value === 'OPEN'),
)

// ---- Org Settings state (two semesters) ----
const orgSettings = ref<OrgSettingsRow[]>([])
const orgLoading = ref(false)

// Editable fields per semester — keyed by semester_first boolean
const orgEdits = ref<
  Record<
    string,
    {
      enrollment_target: number
      meeting_absence_deduction: number
      school_achievement_rate_override: number | null
    }
  >
>({})

// ---- Class targets state ----
const classTargets = ref<ClassTargetRow[]>([])
const classLoading = ref(false)

// Editable fields per class target row — keyed by row id
const classEdits = ref<
  Record<
    number,
    {
      head_count_target: number
      head_teacher_employee_id: number | null
      returning_student_rate: number
      assistant_employee_id: number | null
    }
  >
>({})

// ---- Employee / classroom lookup maps ----
const employeeOptions = ref<EmployeeOption[]>([])
const classroomMap = ref<Record<number, string>>({})

// ---- Save-in-progress flags (per semester / per row) ----
const orgSaving = ref<Record<string, boolean>>({})
const classSaving = ref<Record<number, boolean>>({})
const classAllSaving = ref(false)

// ---- Task B6 橋接：考核週期目標（cycleTarget）----
// TargetCrossRef 三處目標對照原本此頁只傳「年終設定目標」與「實際」，考核週期
// 目標寫死 null——「不一致警示」永遠不會觸發。此頁 cycleId 對應 year_end_cycles.id，
// 考核週期目標存在另一張表（AppraisalCycle.enrollment_target），兩表以
// academic_year + semester 間接關聯（無直接 FK，資料模型整併不在本案範圍）。
// 橋接路徑：year_end_cycles.id → academic_year（listYearEndCycles 找同 id 那筆）
// → getAppraisalCyclesByYear(academic_year) → 依 semester 相符（沿用既有
// semester_first→FIRST/SECOND 映射慣例）→ enrollment_target。任一步查無或失敗
// 一律回退 null（不 crash、不誤導）——TargetCrossRef 對 null 已容忍，只是無法顯示對照。
// keyed by String(semester_first)，對齊 orgEdits/orgSaving 既有 key 慣例。
const cycleTargets = ref<Record<string, number | null>>({})

// ---- Helpers ----
function semesterLabel(semesterFirst: boolean): string {
  return semesterFirst ? '上學期' : '下學期'
}

function semesterCode(semesterFirst: boolean): 'FIRST' | 'SECOND' {
  return semesterFirst ? 'FIRST' : 'SECOND'
}

// 百分比顯示統一走 utils/format.fmtPct（已是百分比形式的欄位直傳；
// 0–1 比率形式的欄位帶 { isRatio: true }），取代原 pctNum/pctRatio 雙軌。

function classroomName(id: number): string {
  return classroomMap.value[id] ?? `班級 ${id}`
}

// ---- Load ----
const orgLoadError = ref(false)

async function loadOrgSettings() {
  orgLoading.value = true
  orgLoadError.value = false
  try {
    const res = await getOrgSettings(cycleId)
    orgSettings.value = res.data
    // Seed edit buffer from current values
    for (const row of res.data) {
      const key = String(row.semester_first)
      orgEdits.value[key] = {
        enrollment_target: row.enrollment_target,
        meeting_absence_deduction: Number(row.meeting_absence_deduction),
        // 保留 null：Number(null) === 0 會把「未覆寫」誤判成「覆寫為 0%」
        school_achievement_rate_override:
          row.school_achievement_rate_override == null
            ? null
            : Number(row.school_achievement_rate_override),
      }
    }
  } catch {
    ElMessage.error('全校設定載入失敗')
    orgLoadError.value = true
  } finally {
    orgLoading.value = false
  }
}

const classLoadError = ref(false)

async function loadClassTargets() {
  classLoading.value = true
  classLoadError.value = false
  try {
    const res = await getClassTargets(cycleId)
    classTargets.value = res.data
    for (const row of res.data) {
      classEdits.value[row.id] = {
        head_count_target: row.head_count_target,
        head_teacher_employee_id: row.head_teacher_employee_id,
        returning_student_rate: Number(row.returning_student_rate),
        assistant_employee_id: row.assistant_employee_id,
      }
    }
  } catch {
    ElMessage.error('班級設定載入失敗')
    classLoadError.value = true
  } finally {
    classLoading.value = false
  }
}

// Task B6 橋接（見上方 cycleTargets 宣告處註解）：非本頁核心資料，失敗不影響
// 招生/班級設定的載入與編輯——靜默降級，比照 loadSupportData 的降級精神，但
// 這裡連 dropdown 都不涉及、純粹是對照顯示用，故不額外彈 ElMessage 干擾。
async function loadCycleTargets() {
  try {
    const { data: yearEndCycles } = await listYearEndCycles()
    const yearEndCycle = yearEndCycles.find((c) => c.id === cycleId)
    cycleStatus.value = yearEndCycle?.status ?? null
    if (!yearEndCycle) {
      cycleTargets.value = {}
      return
    }
    const { data } = await getAppraisalCyclesByYear(yearEndCycle.academic_year)
    const appraisalCycles = (Array.isArray(data) ? data : []) as AppraisalCycleEntry[]
    const bridged: Record<string, number | null> = {}
    for (const semesterFirst of [true, false]) {
      const match = appraisalCycles.find((c) => c.semester === semesterCode(semesterFirst))
      bridged[String(semesterFirst)] = match?.enrollment_target ?? null
    }
    cycleTargets.value = bridged
  } catch {
    cycleTargets.value = {}
  }
}

async function loadSupportData() {
  try {
    const [empRes, clsRes] = await Promise.all([
      getEmployees({ is_active: true } as Parameters<typeof getEmployees>[0]),
      getClassrooms({}),
    ])
    employeeOptions.value = (empRes.data as EmployeeOption[]).filter(
      (e) => e.id != null,
    )
    const map: Record<number, string> = {}
    for (const cls of clsRes.data as ClassroomOption[]) {
      if (cls.id != null) map[cls.id as number] = String(cls.name)
    }
    classroomMap.value = map
  } catch {
    // Non-fatal — dropdowns degrade gracefully
    ElMessage.warning('輔助資料（員工/班級）載入失敗，下拉選單可能不完整')
  }
}

// ---- Save org settings (per semester) ----
async function saveOrgSettings(row: OrgSettingsRow) {
  const key = String(row.semester_first)
  const edits = orgEdits.value[key]
  if (!edits) return
  orgSaving.value[key] = true
  try {
    await postOrgSettings(cycleId, {
      semester_first: row.semester_first,
      enrollment_target: edits.enrollment_target,
      // Echo back auto-computed fields (not user-editable) to satisfy required schema fields
      org_achievement_rate: Number(row.org_achievement_rate),
      meeting_absence_deduction: edits.meeting_absence_deduction,
      school_achievement_rate: Number(row.school_achievement_rate),
      // 空欄送 null（沿用系統自動值）；勿 Number() 化以免 null→0
      school_achievement_rate_override: edits.school_achievement_rate_override,
      enrollment_actual: row.enrollment_actual,
    })
    ElMessage.success(`${semesterLabel(row.semester_first)} 已儲存`)
    await loadOrgSettings()
  } catch (e) {
    ElMessage.error(apiError(e, '儲存失敗'))
  } finally {
    orgSaving.value[key] = false
  }
}

// ---- Navigate to year-end rules panel ----
// 直達巢狀路由（非舊 query 相容層 `/appraisal-year-end?section=year-end-rules`），
// 對齊 router/index.ts 的 `/appraisal-year-end/rules/year-end-rules`。
function goToYearEndRules() {
  router.push('/appraisal-year-end/rules/year-end-rules')
}

// ---- Save class target (per row) ----
async function saveClassTarget(row: ClassTargetRow) {
  const edits = classEdits.value[row.id]
  if (!edits) return
  classSaving.value[row.id] = true
  try {
    await upsertClassTarget(cycleId, {
      semester_first: row.semester_first,
      classroom_id: row.classroom_id,
      head_count_target: edits.head_count_target,
      head_teacher_employee_id: edits.head_teacher_employee_id,
      // Schema accepts number | string; pass number directly
      returning_student_rate: edits.returning_student_rate,
      assistant_employee_id: edits.assistant_employee_id,
    })
    ElMessage.success(`${classroomName(row.classroom_id)}（${semesterLabel(row.semester_first)}）已儲存`)
    await loadClassTargets()
  } catch (e) {
    ElMessage.error(apiError(e, '班級設定儲存失敗'))
  } finally {
    classSaving.value[row.id] = false
  }
}

// ---- Save all class targets at once (batch endpoint) ----
// 全部儲存＝送出當前所有班級列的緩衝值（classEdits，非僅手動改過的列）；
// upsertClassTarget 是 upsert，對未變更列重寫同值為 idempotent、無副作用。
// loadClassTargets() 已對每列無條件 seed classEdits，故下方 filter 不是
// 「跳過未編輯列」——是防禦性守衛，只擋列真的沒有 classEdits entry 的理論異常。
// 逐列「儲存此列」保留不動——此為額外的一次送出選項。
async function saveAllClassTargets() {
  const items = classTargets.value
    .filter((row) => classEdits.value[row.id])
    .map((row) => {
      const edits = classEdits.value[row.id]
      return {
        semester_first: row.semester_first,
        classroom_id: row.classroom_id,
        head_count_target: edits.head_count_target,
        head_teacher_employee_id: edits.head_teacher_employee_id,
        returning_student_rate: edits.returning_student_rate,
        assistant_employee_id: edits.assistant_employee_id,
      }
    })
  if (!items.length) return
  classAllSaving.value = true
  try {
    const res = await upsertClassTargetsBatch(cycleId, items)
    const failed = res.data.failed ?? []
    if (failed.length) {
      const detail = failed
        .map((f) => `${classroomName(f.classroom_id)}（${semesterLabel(f.semester_first)}）：${f.reason}`)
        .join('；')
      ElMessage.warning(`已儲存 ${res.data.succeeded_count} 筆，${failed.length} 筆失敗（${detail}）`)
    } else {
      ElMessage.success(`已儲存 ${res.data.succeeded_count} 筆`)
    }
    await loadClassTargets()
  } catch (e) {
    ElMessage.error(apiError(e, '全部儲存失敗'))
  } finally {
    classAllSaving.value = false
  }
}

defineExpose({
  orgSettings,
  classTargets,
  orgEdits,
  classEdits,
  employeeOptions,
  classroomMap,
  canWrite,
  cycleTargets,
  loadOrgSettings,
  loadClassTargets,
  loadCycleTargets,
  saveOrgSettings,
  saveClassTarget,
  saveAllClassTargets,
  goToYearEndRules,
  cycleId,
  orgLoadError,
  classLoadError,
})

onMounted(async () => {
  await Promise.all([loadOrgSettings(), loadClassTargets(), loadSupportData(), loadCycleTargets()])
})
</script>

<template>
  <div class="year-end-config-view">
    <header class="toolbar">
      <h2 class="title">本期設定（週期 {{ cycleId }}）</h2>
    </header>

    <!-- ===================== Section 1: 招生與班級 ===================== -->
    <el-card class="section-card">
      <template #header>
        <span class="section-title">招生與班級設定</span>
      </template>

      <!-- 全校目標 (org_settings) -->
      <h3 class="sub-title">全校目標</h3>
      <div v-if="orgLoadError" class="yec-error">
        載入失敗
        <el-button data-test="org-load-retry" size="small" text type="primary" @click="loadOrgSettings">重試</el-button>
      </div>
      <div
        v-loading="orgLoading"
        class="org-settings-grid"
      >
        <div
          v-for="row in orgSettings"
          :key="String(row.semester_first)"
          class="semester-block"
          :data-test="`org-block-${row.semester_first ? 'first' : 'second'}`"
        >
          <div class="semester-header">{{ semesterLabel(row.semester_first) }}</div>
          <el-form label-width="140px" label-position="right" size="small">
            <el-form-item label="招生目標（人數）">
              <el-input-number
                v-if="canWrite && orgEdits[String(row.semester_first)]"
                v-model="orgEdits[String(row.semester_first)].enrollment_target"
                :min="0"
                :max="999"
                :step="1"
                :precision="0"
                controls-position="right"
                style="width: 180px"
                :data-test="`input-enrollment-target-${row.semester_first}`"
              />
              <span v-else>{{ orgEdits[String(row.semester_first)]?.enrollment_target ?? row.enrollment_target }}</span>
            </el-form-item>
            <el-form-item label="實際招生人數（自動）">
              <span class="readonly-val">{{ row.enrollment_actual ?? '-' }}</span>
            </el-form-item>
            <el-form-item label="招生達成率（自動）">
              <span class="readonly-val">{{ fmtPct(row.school_achievement_rate) }}</span>
            </el-form-item>
            <el-form-item label="全校達成率（覆寫）">
              <el-input-number
                v-if="canWrite && orgEdits[String(row.semester_first)]"
                v-model="orgEdits[String(row.semester_first)].school_achievement_rate_override"
                :min="0"
                :max="999.9"
                :step="0.1"
                :precision="1"
                :value-on-clear="null"
                :placeholder="fmtPct(row.school_achievement_rate)"
                controls-position="right"
                style="width: 180px"
                :data-test="`input-school-rate-override-${row.semester_first}`"
              />
              <span v-else>{{ fmtPct(row.school_achievement_rate_override) }}</span>
              <span class="field-hint">留空＝沿用系統建議值 {{ fmtPct(row.school_achievement_rate) }}</span>
            </el-form-item>
            <el-form-item label="機構達成率">
              <span class="readonly-val" :data-test="`display-org-rate-${row.semester_first}`">{{ fmtPct(row.org_achievement_rate) }}</span>
              <span class="field-hint">由系統依兩學期全校達成率平均自動計算（手動覆寫為後續階段）</span>
            </el-form-item>
            <el-form-item label="缺會議扣款（元）">
              <el-input-number
                v-if="canWrite && orgEdits[String(row.semester_first)]"
                v-model="orgEdits[String(row.semester_first)].meeting_absence_deduction"
                :min="0"
                :step="100"
                controls-position="right"
                style="width: 180px"
                :data-test="`input-meeting-deduction-${row.semester_first}`"
              />
              <span v-else>{{ row.meeting_absence_deduction }}</span>
            </el-form-item>
          </el-form>
          <!-- Task B6：三處目標人數對照——此頁「全校目標」是年終 org_settings
          目標的實際編輯來源；cycleTarget（考核週期目標）由 cycleTargets 橋接
          取得（見 <script> loadCycleTargets 註解），查無/失敗時為 null，元件容忍。 -->
          <TargetCrossRef
            :cycle-target="cycleTargets[String(row.semester_first)] ?? null"
            :org-setting-target="orgEdits[String(row.semester_first)]?.enrollment_target ?? row.enrollment_target"
            :actual="row.enrollment_actual ?? null"
          />
          <div class="save-row">
            <el-button
              v-if="canWrite"
              type="primary"
              size="small"
              :loading="orgSaving[String(row.semester_first)]"
              :data-test="`save-org-${row.semester_first}`"
              @click="saveOrgSettings(row)"
            >
              儲存 {{ semesterLabel(row.semester_first) }}
            </el-button>
          </div>
        </div>
      </div>

      <el-divider />

      <!-- 各班編制 (class_targets) -->
      <div class="class-targets-header">
        <h3 class="sub-title">各班編制</h3>
        <el-button
          v-if="canWrite"
          type="success"
          size="small"
          :loading="classAllSaving"
          data-test="save-all-class-targets"
          @click="saveAllClassTargets"
        >
          全部儲存
        </el-button>
      </div>
      <div v-if="classLoadError" class="yec-error">
        載入失敗
        <el-button data-test="class-load-retry" size="small" text type="primary" @click="loadClassTargets">重試</el-button>
      </div>
      <el-table
        v-loading="classLoading"
        :data="classTargets"
        border
        stripe
        size="small"
        data-test="class-targets-table"
      >
        <el-table-column label="學期" width="70">
          <template #default="{ row }">{{ semesterLabel(row.semester_first) }}</template>
        </el-table-column>
        <el-table-column label="班級" width="120">
          <template #default="{ row }">{{ classroomName(row.classroom_id) }}</template>
        </el-table-column>
        <el-table-column label="編制人數" width="120">
          <template #default="{ row }">
            <el-input-number
              v-if="canWrite && classEdits[row.id]"
              v-model="classEdits[row.id].head_count_target"
              :min="0"
              :max="99"
              :step="1"
              :precision="0"
              controls-position="right"
              style="width: 110px"
              size="small"
              :data-test="`input-headcount-${row.id}`"
            />
            <span v-else>{{ row.head_count_target }}</span>
          </template>
        </el-table-column>
        <el-table-column label="班導" min-width="160">
          <template #default="{ row }">
            <el-select
              v-if="canWrite && classEdits[row.id]"
              v-model="classEdits[row.id].head_teacher_employee_id"
              clearable
              placeholder="選擇班導"
              size="small"
              style="width: 150px"
              :data-test="`select-head-teacher-${row.id}`"
            >
              <el-option
                v-for="emp in employeeOptions"
                :key="emp.id"
                :label="String(emp.name)"
                :value="emp.id"
              />
            </el-select>
            <span v-else>{{ row.head_teacher_employee_id ?? '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="舊生率" width="140">
          <template #default="{ row }">
            <el-input-number
              v-if="canWrite && classEdits[row.id]"
              v-model="classEdits[row.id].returning_student_rate"
              :min="0"
              :max="1"
              :step="0.001"
              :precision="3"
              controls-position="right"
              style="width: 120px"
              size="small"
              :data-test="`input-returning-rate-${row.id}`"
            />
            <span v-else>{{ fmtPct(row.returning_student_rate, { isRatio: true }) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="班級績效%（自動）" width="130">
          <template #default="{ row }">
            <span class="readonly-val">{{ fmtPct(row.class_performance_rate) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="canWrite"
              size="small"
              type="primary"
              :loading="classSaving[row.id]"
              :data-test="`save-class-${row.id}`"
              @click="saveClassTarget(row)"
            >
              儲存此列
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- ===================== Section 2: 獎金標準 / 扣款費率 ===================== -->
    <el-card class="section-card">
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
          @click="goToYearEndRules"
        >
          前往年終規則設定
        </el-button>
        <span class="field-hint">才藝/學期紅利/考勤扣款費率於此編輯；節慶基準獎金請至薪資設定分頁</span>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.yec-error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--el-color-danger);
  font-size: var(--text-sm);
  margin-bottom: var(--space-3);
}
.year-end-config-view {
  padding: var(--space-4);
}
.toolbar {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: var(--space-4);
}
.title {
  margin: 0;
  font-size: 18px;
}
.section-card {
  margin-bottom: var(--space-5);
}
.section-title {
  font-weight: 600;
  font-size: 15px;
}
.sub-title {
  margin: 0 0 var(--space-3);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.class-targets-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.class-targets-header .sub-title {
  margin: 0;
}
.org-settings-grid {
  display: flex;
  gap: var(--space-8);
  flex-wrap: wrap;
}
.semester-block {
  flex: 1 1 320px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: var(--space-4);
}
.semester-header {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: var(--space-3);
  color: var(--el-color-primary);
}
.save-row {
  margin-top: var(--space-3);
  text-align: right;
}
.readonly-val {
  color: var(--text-secondary);
}
.field-hint {
  margin-left: var(--space-2);
  color: var(--text-tertiary);
  font-size: 12px;
}
.hint-icon {
  cursor: help;
  color: var(--text-tertiary);
}
.bonus-hint {
  margin-bottom: var(--space-3);
}
.bonus-link-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}
</style>
