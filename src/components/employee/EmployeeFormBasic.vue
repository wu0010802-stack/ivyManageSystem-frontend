<!-- src/components/employee/EmployeeFormBasic.vue -->
<script setup lang="ts">
import { computed, ref, reactive } from 'vue'
import { Lock } from '@element-plus/icons-vue'
import { SALARY_SENSITIVE_FIELDS } from '@/constants/employeeFields'
import {
  POSITION_OPTIONS, SUPERVISOR_ROLE_OPTIONS, EMPLOYEE_TYPE_OPTIONS,
} from '@/constants/employee'
import FormSection from '@/components/common/FormSection.vue'
import { sectionForField, countEmptyBySection } from '@/constants/employeeFormSections'

interface SelectOption {
  value?: string | number
  label?: string
  id: string | number
  name?: string
  grade_name?: string
}

export interface EmployeeFormBasicData {
  employee_id?: string
  name?: string
  job_title_id?: number | string | null
  title?: string
  position?: string
  bonus_grade?: string
  employee_type?: string
  supervisor_role?: string
  gender?: string
  hire_date?: string
  probation_end_date?: string
  birthday?: string
  id_number?: string
  birth_date?: string
  national_id?: string
  classroom_id?: number | null
  classroom_name?: string
  phone?: string
  dependents?: number | null
  email?: string
  address?: string
  emergency_contact?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  emergency_phone?: string
  work_start_time?: string
  work_end_time?: string
  staff_role_category?: string
  teacher_cert_no?: string
  teacher_cert_type?: string
  notes?: string
  [key: string]: unknown
}

const props = withDefaults(defineProps<{
  form: EmployeeFormBasicData
  bureauJobTitleOptions?: SelectOption[]
  classroomOptions?: SelectOption[]
  isSelfEdit?: boolean
  pendingSuggestion?: boolean
  suggestedSalary?: number | null
}>(), {
  bureauJobTitleOptions: () => [],
  classroomOptions: () => [],
  isSelfEdit: false,
  pendingSuggestion: false,
  suggestedSalary: null,
})

// 敏感欄位在 self-edit 模式下要呈現唯讀文字 + 鎖頭
const isLocked = (field: string) => props.isSelfEdit && SALARY_SENSITIVE_FIELDS.includes(field)

// readonly 顯示用 helper
const fmt = (v: string | number | null | undefined) => {
  if (v == null || v === '') return '—'
  return v
}

// employee_type 顯示用 label（避免顯示 raw value）
const employeeTypeLabel = computed(() => {
  const opt = EMPLOYEE_TYPE_OPTIONS.find(o => o.value === props.form.employee_type)
  return opt ? opt.label : fmt(props.form.employee_type)
})

// job_title_id 顯示用 name（從 bureauJobTitleOptions 反查，或 fallback form.title）
const jobTitleLabel = computed(() => {
  if (props.form.title) return props.form.title
  const found = props.bureauJobTitleOptions.find(o => o.id === props.form.job_title_id)
  return found ? found.name : fmt(props.form.job_title_id)
})

// classroom 顯示用 name。此欄位一律唯讀：Employee.classroom_id 由後端
// classroom_teacher_sync 從班級教師指派反算，指派入口只在班級管理頁。
const classroomLabel = computed(() => {
  const found = props.classroomOptions.find(c => c.id === props.form.classroom_id)
  if (found) return `${found.name} (${found.grade_name || ''})`
  if (props.form.classroom_name) return props.form.classroom_name
  if (props.form.classroom_id == null) return '未指派'
  return String(props.form.classroom_id)
})

// 可收合區段 refs
type CollapsibleSection = 'jobDetail' | 'personal' | 'worktime' | 'gov'

const jobDetailRef = ref<{ expand: () => void } | null>(null)
const personalRef = ref<{ expand: () => void } | null>(null)
const worktimeRef = ref<{ expand: () => void } | null>(null)
const govRef = ref<{ expand: () => void } | null>(null)
const sectionRefs: Record<CollapsibleSection, typeof jobDetailRef> = {
  jobDetail: jobDetailRef, personal: personalRef, worktime: worktimeRef, gov: govRef,
}
const sectionErrors = reactive<Record<CollapsibleSection, number>>({
  jobDetail: 0, personal: 0, worktime: 0, gov: 0,
})

function applyValidationErrors(invalidProps: string[]) {
  ;(Object.keys(sectionErrors) as CollapsibleSection[]).forEach(k => { sectionErrors[k] = 0 })
  for (const prop of invalidProps) {
    const sec = sectionForField(prop)
    if (sec === 'jobDetail' || sec === 'personal' || sec === 'worktime' || sec === 'gov') {
      sectionErrors[sec] += 1
      sectionRefs[sec].value?.expand()
    }
  }
}

// 「未填 n 項」info badge：n = 該區段欄位中空值（''/null/undefined）數量，隨 props.form 即時重算。
// 0/false 不算未填（見 countEmptyBySection 註解）。
const sectionEmptyCounts = computed(() => countEmptyBySection(props.form as unknown as Record<string, unknown>))

// 既有驗證失敗 error badge 優先於未填 info badge：sectionErrors[k] > 0 時顯示錯誤數，否則顯示未填數。
function badgeCountFor(section: CollapsibleSection): number {
  return sectionErrors[section] > 0 ? sectionErrors[section] : sectionEmptyCounts.value[section]
}
function badgeTypeFor(section: CollapsibleSection): 'error' | 'info' {
  return sectionErrors[section] > 0 ? 'error' : 'info'
}

defineExpose({ applyValidationErrors })
</script>

<template>
  <!-- 核心資料 -->
  <el-form-item label="姓名" prop="name">
    <el-input v-model="form.name" />
  </el-form-item>

  <el-form-item label="員工編號">
    <el-tag v-if="form.employee_id" data-test="employee-id-value" effect="plain">{{ form.employee_id }}</el-tag>
    <div v-else data-test="employee-id-auto" class="form-hint" style="margin-top:0">
      <el-tag type="success" effect="plain">儲存後自動配號（例：114001）</el-tag>
    </div>
  </el-form-item>

  <el-form-item label="教育局職稱" prop="job_title_id">
    <template v-if="isLocked('job_title_id')">
      <span class="readonly-text">{{ jobTitleLabel }} <el-icon><Lock /></el-icon></span>
      <div class="lock-hint">此欄位影響薪資，請由 HR 修改</div>
    </template>
    <el-select v-else v-model="form.job_title_id" placeholder="請選擇教育局職稱" style="width:100%">
      <el-option v-for="item in bureauJobTitleOptions" :key="item.id" :label="item.name" :value="item.id" />
    </el-select>
  </el-form-item>

  <el-form-item label="員工類型">
    <template v-if="isLocked('employee_type')">
      <span class="readonly-text">{{ employeeTypeLabel }} <el-icon><Lock /></el-icon></span>
    </template>
    <el-select v-else v-model="form.employee_type" style="width:100%">
      <el-option v-for="opt in EMPLOYEE_TYPE_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
    </el-select>
  </el-form-item>

  <el-form-item label="性別">
    <el-select v-model="form.gender" clearable placeholder="請選擇" style="width:100%">
      <el-option label="男" value="男" />
      <el-option label="女" value="女" />
      <el-option label="其他" value="其他" />
    </el-select>
  </el-form-item>

  <el-form-item label="到職日期">
    <template v-if="isLocked('hire_date')">
      <span class="readonly-text">{{ fmt(form.hire_date) }} <el-icon><Lock /></el-icon></span>
      <div class="lock-hint">此欄位影響薪資，請由 HR 修改</div>
    </template>
    <el-date-picker v-else v-model="form.hire_date" type="date" placeholder="選擇日期" style="width:100%" value-format="YYYY-MM-DD" />
  </el-form-item>

  <el-form-item label="班級">
    <span class="readonly-text" data-test="classroom-readonly">{{ classroomLabel }}</span>
    <div class="form-hint">由「班級管理」頁指派老師決定，此處僅顯示結果</div>
  </el-form-item>

  <!-- 職務細節 -->
  <FormSection ref="jobDetailRef" data-test="section-jobDetail" title="職務細節" collapsible :default-open="false"
    :badge-count="badgeCountFor('jobDetail')" :badge-type="badgeTypeFor('jobDetail')">
    <el-form-item label="園內職務" prop="position">
      <template v-if="isLocked('position')">
        <span class="readonly-text">{{ fmt(form.position) }} <el-icon><Lock /></el-icon></span>
        <div class="lock-hint">此欄位影響薪資，請由 HR 修改</div>
      </template>
      <el-select v-else v-model="form.position" filterable allow-create default-first-option placeholder="選擇或輸入園內職務" style="width:100%">
        <el-option v-for="p in POSITION_OPTIONS" :key="p" :label="p" :value="p" />
      </el-select>
    </el-form-item>
    <el-form-item label="主管職" prop="supervisor_role">
      <template v-if="isLocked('supervisor_role')">
        <span class="readonly-text">{{ fmt(form.supervisor_role) }} <el-icon><Lock /></el-icon></span>
      </template>
      <el-select v-else v-model="form.supervisor_role" clearable placeholder="無主管職" style="width:100%">
        <el-option v-for="item in SUPERVISOR_ROLE_OPTIONS" :key="item" :label="item" :value="item" />
      </el-select>
    </el-form-item>
    <el-form-item label="獎金等級覆蓋" prop="bonus_grade">
      <template v-if="isLocked('bonus_grade')">
        <span class="readonly-text">{{ fmt(form.bonus_grade) }} <el-icon><Lock /></el-icon></span>
      </template>
      <template v-else>
        <el-select v-model="form.bonus_grade" clearable filterable allow-create placeholder="自動（依教育局職稱）" style="width:100%">
          <el-option label="A 級（有教師證）" value="A" />
          <el-option label="B 級（教保員／助理教保員）" value="B" />
          <el-option label="C 級（非教保員）" value="C" />
        </el-select>
        <div class="form-hint">空白表示依教育局職稱自動判斷；保留手動覆蓋用於特例（A / B / C）</div>
      </template>
    </el-form-item>
    <el-form-item label="試用期結束">
      <el-date-picker v-model="form.probation_end_date" type="date" placeholder="選擇日期" style="width:100%" value-format="YYYY-MM-DD" clearable />
    </el-form-item>
  </FormSection>

  <!-- 個資・聯絡・緊急聯絡 -->
  <FormSection ref="personalRef" data-test="section-personal" title="個資・聯絡・緊急聯絡" collapsible :default-open="false"
    :badge-count="badgeCountFor('personal')" :badge-type="badgeTypeFor('personal')">
    <el-form-item label="生日">
      <el-date-picker v-model="form.birthday" type="date" placeholder="選擇日期" style="width:100%" value-format="YYYY-MM-DD" clearable />
    </el-form-item>
    <el-form-item label="身分證字號">
      <el-input v-model="form.id_number" name="id_number" autocomplete="off" placeholder="保留遮罩值將不會更新" />
      <div class="form-hint form-hint--example">例：A123456789</div>
    </el-form-item>
    <el-form-item label="聯絡電話">
      <el-input v-model="form.phone" type="tel" name="phone" autocomplete="tel" />
      <div class="form-hint form-hint--example">例：0912-345-678</div>
    </el-form-item>
    <el-form-item label="Email" prop="email">
      <el-input v-model="form.email" type="email" name="email" autocomplete="email" placeholder="example@mail.com" maxlength="100" />
    </el-form-item>
    <el-form-item label="眷屬人數" prop="dependents">
      <el-input-number v-model="form.dependents" :min="0" :max="9" :step="1" style="width:100%" />
    </el-form-item>
    <el-form-item label="通訊地址"><el-input v-model="form.address" type="textarea" :rows="2" /></el-form-item>
    <el-form-item label="緊急聯絡人"><el-input v-model="form.emergency_contact_name" /></el-form-item>
    <el-form-item label="緊急聯絡電話"><el-input v-model="form.emergency_contact_phone" type="tel" name="emergency_contact_phone" autocomplete="tel" /></el-form-item>
  </FormSection>

  <!-- 工作時間 -->
  <FormSection ref="worktimeRef" data-test="section-worktime" title="工作時間" collapsible :default-open="false"
    :badge-count="badgeCountFor('worktime')" :badge-type="badgeTypeFor('worktime')">
    <el-form-item label="上班時間">
      <el-time-select v-model="form.work_start_time" start="06:00" step="00:30" end="22:00" style="width:100%" />
    </el-form-item>
    <el-form-item label="下班時間">
      <el-time-select v-model="form.work_end_time" start="06:00" step="00:30" end="22:00" style="width:100%" />
    </el-form-item>
  </FormSection>

  <!-- 教保身分・政府申報 -->
  <FormSection ref="govRef" data-test="section-gov" title="教保身分・政府申報" collapsible :default-open="false"
    :badge-count="badgeCountFor('gov')" :badge-type="badgeTypeFor('gov')">
    <el-form-item label="教保身分別">
      <el-select v-model="form.staff_role_category" clearable placeholder="(未指定)" style="width:100%">
        <el-option label="幼教師（持幼教師證）" value="teacher_certified" />
        <el-option label="教保員（持教保員證）" value="educare_certified" />
        <el-option label="助理教保員" value="assistant_educare" />
        <el-option label="行政人員" value="office" />
        <el-option label="廚工" value="kitchen" />
        <el-option label="司機" value="driver" />
        <el-option label="其他" value="other" />
      </el-select>
    </el-form-item>
    <el-form-item label="教師/教保員證號" prop="teacher_cert_no">
      <el-input v-model="form.teacher_cert_no" name="teacher_cert_no" autocomplete="off" maxlength="50" style="width:100%" />
    </el-form-item>
    <el-form-item label="證號類型">
      <el-select v-model="form.teacher_cert_type" clearable style="width:100%">
        <el-option label="幼教師證" value="幼教師證" />
        <el-option label="教保員證" value="教保員證" />
        <el-option label="助理教保員證" value="助理教保員證" />
      </el-select>
    </el-form-item>
  </FormSection>
</template>

<style scoped>
.readonly-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  padding: 4px 12px;
  border-radius: 4px;
}
.lock-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
</style>
