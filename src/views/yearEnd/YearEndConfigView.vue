<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getOrgSettings, postOrgSettings, getClassTargets, upsertClassTarget } from '@/api/yearEnd'
import { getEmployees } from '@/api/employees'
import { getClassrooms } from '@/api/classrooms'
import { hasPermission } from '@/utils/auth'
import { apiError } from '@/utils/error'
import { fmtPct } from '@/utils/format'

// ---- Derive row types from typed API wrappers — no hand-written `any` ----
type OrgSettingsRow = Awaited<ReturnType<typeof getOrgSettings>>['data'][number]
type ClassTargetRow = Awaited<ReturnType<typeof getClassTargets>>['data'][number]
type EmployeeOption = { id: number; name: unknown }
type ClassroomOption = { id: number; name: unknown }

const route = useRoute()
const router = useRouter()
const cycleId = Number(route.params.id)

const canWrite = computed(() => hasPermission('YEAR_END_WRITE'))

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

// ---- Helpers ----
function semesterLabel(semesterFirst: boolean): string {
  return semesterFirst ? '上學期' : '下學期'
}

// 百分比顯示統一走 utils/format.fmtPct（已是百分比形式的欄位直傳；
// 0–1 比率形式的欄位帶 { isRatio: true }），取代原 pctNum/pctRatio 雙軌。

function classroomName(id: number): string {
  return classroomMap.value[id] ?? `班級 ${id}`
}

// ---- Load ----
async function loadOrgSettings() {
  orgLoading.value = true
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
  } finally {
    orgLoading.value = false
  }
}

async function loadClassTargets() {
  classLoading.value = true
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
  } finally {
    classLoading.value = false
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

defineExpose({
  orgSettings,
  classTargets,
  orgEdits,
  classEdits,
  employeeOptions,
  classroomMap,
  canWrite,
  loadOrgSettings,
  loadClassTargets,
  saveOrgSettings,
  saveClassTarget,
  goToYearEndRules,
  cycleId,
})

onMounted(async () => {
  await Promise.all([loadOrgSettings(), loadClassTargets(), loadSupportData()])
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
      <h3 class="sub-title">各班編制</h3>
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
