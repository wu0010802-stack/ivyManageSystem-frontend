<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="(v) => emit('update:visible', v)"
    :title="mode === 'create' ? '新增事件紀錄' : '編輯事件紀錄'"
    width="560px"
    @closed="onClosed"
  >
    <el-form label-position="top">
      <el-form-item v-if="!lockStudent" label="班級">
        <el-select
          v-model="pickedClassroomId"
          placeholder="選擇班級"
          @change="onClassroomChange"
          style="width: 100%"
        >
          <el-option v-for="c in classrooms" :key="c.id as PropertyKey" :label="c.name as string" :value="(c.id as number)" />
        </el-select>
      </el-form-item>
      <el-form-item label="學生 *">
        <el-select
          v-model="form.student_id"
          :disabled="lockStudent"
          :loading="studentsLoading"
          placeholder="選擇學生"
          style="width: 100%"
        >
          <el-option v-for="s in studentOptions" :key="s.id as PropertyKey" :label="s.name as string" :value="(s.id as number)" />
        </el-select>
      </el-form-item>
      <el-form-item label="事件類型 *">
        <el-select v-model="form.incident_type" placeholder="選擇類型" style="width: 100%">
          <el-option v-for="t in INCIDENT_TYPES" :key="t" :label="t" :value="t" />
        </el-select>
      </el-form-item>
      <el-form-item label="發生時間 *">
        <el-date-picker
          v-model="form.occurred_at"
          type="datetime"
          placeholder="選擇日期時間"
          value-format="YYYY-MM-DDTHH:mm:ss"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="事件描述 *">
        <el-input v-model="form.description" type="textarea" :rows="3" placeholder="請描述事件經過" />
      </el-form-item>

      <!-- 補充（選填） -->
      <FormSection data-test="section-extra" title="補充（選填）" collapsible :default-open="false">
        <el-form-item label="嚴重程度">
          <el-select v-model="form.severity" placeholder="選擇嚴重程度" clearable style="width: 100%">
            <el-option v-for="s in SEVERITIES" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="處置方式">
          <el-input v-model="form.action_taken" type="textarea" :rows="2" placeholder="已採取的處置措施" />
        </el-form-item>
        <el-form-item label="通知家長">
          <el-checkbox v-model="form.parent_notified">已通知家長</el-checkbox>
        </el-form-item>
      </FormSection>

      <!-- 考核歸責：僅管理角色（BE is_unrestricted）且僅意外受傷可設 -->
      <FormSection
        v-if="showAppraisalFields"
        data-test="section-appraisal"
        title="考核歸責（僅管理角色）"
        collapsible
        :default-open="true"
      >
        <el-form-item label="責任教師">
          <el-select
            v-model="form.responsible_employee_id"
            clearable
            filterable
            :loading="employeesLoading"
            placeholder="未指定時依學生班級歸責"
            style="width: 100%"
          >
            <el-option v-for="e in employeeOptions" :key="e.id" :label="e.name" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="考核評議分（0 ～ −10，留空＝不納入考核）">
          <el-input-number
            v-model="form.appraisal_score_delta"
            :min="MANUAL_DELTA_RANGES.CHILD_ACCIDENT.min"
            :max="MANUAL_DELTA_RANGES.CHILD_ACCIDENT.max"
            :step="0.5"
            style="width: 100%"
          />
        </el-form-item>
      </FormSection>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">確認</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { INCIDENT_TYPES, SEVERITIES } from '@/constants/studentRecords'
import { getStudents } from '@/api/students'
import { getEmployees } from '@/api/employees'
import { useStudentRecordsStore } from '@/stores/studentRecords'
import { getUserInfo } from '@/utils/auth'
import { apiError } from '@/utils/error'
import { MANUAL_DELTA_RANGES } from '@/views/appraisal/scoreItemLabels'
import FormSection from '@/components/common/FormSection.vue'

const props = withDefaults(defineProps<{
  visible?: boolean
  mode?: string
  initial?: Record<string, unknown> | null
  lockStudent?: boolean
  defaultStudentId?: number | null
  defaultClassroomId?: number | null
  classrooms?: Record<string, unknown>[]
}>(), {
  visible: false,
  mode: 'create',
  initial: null,
  lockStudent: false,
  defaultStudentId: null,
  defaultClassroomId: null,
  classrooms: () => [],
})

const emit = defineEmits<{
  'update:visible': [v: boolean]
  'submitted': [payload: { payload: Record<string, unknown>; saved: unknown }]
}>()

interface IncidentForm {
  student_id: number | null
  incident_type: string
  severity: string
  occurred_at: string
  description: string
  action_taken: string
  parent_notified: boolean
  // el-select/el-input-number 的 clear 會把 model 設成 undefined，型別須容納
  responsible_employee_id: number | null | undefined
  appraisal_score_delta: number | null | undefined
}

const empty = (): IncidentForm => ({
  student_id: null,
  incident_type: '',
  severity: '',
  occurred_at: '',
  description: '',
  action_taken: '',
  parent_notified: false,
  responsible_employee_id: null,
  appraisal_score_delta: null,
})

const form = reactive<IncidentForm>(empty())
const pickedClassroomId = ref<number | null>(null)
const studentOptions = ref<Record<string, unknown>[]>([])
const studentsLoading = ref(false)
const submitting = ref(false)

// 鏡射 BE utils/portfolio_access._UNRESTRICTED_ROLES：考核欄位僅這些角色可寫（否則 403）
const UNRESTRICTED_ROLES = ['admin', 'hr', 'supervisor']
const canWriteAppraisalFields = computed(() => {
  const info = getUserInfo() as Record<string, unknown> | null
  return UNRESTRICTED_ROLES.includes((info?.role as string) ?? '')
})
// BE 422：appraisal_score_delta 僅可用於 incident_type=意外受傷
const showAppraisalFields = computed(
  () => canWriteAppraisalFields.value && form.incident_type === '意外受傷',
)

const employeeOptions = ref<{ id: number; name: string }[]>([])
const employeesLoading = ref(false)
const loadEmployees = async () => {
  if (employeeOptions.value.length) return
  employeesLoading.value = true
  try {
    const res = await getEmployees({ is_active: true } as Parameters<typeof getEmployees>[0])
    employeeOptions.value = (res.data as { id: number; name: string }[]).filter((e) => e.id != null)
  } catch {
    // 非致命：下拉退化但其餘欄位仍可編輯
  } finally {
    employeesLoading.value = false
  }
}

const loadStudents = async (classroomId: number | null) => {
  if (!classroomId) { studentOptions.value = []; return }
  studentsLoading.value = true
  try {
     
    const res = await getStudents({ classroom_id: classroomId, is_active: true })
    studentOptions.value = res.data.items || []
  } catch {
    ElMessage.error('載入學生資料失敗')
  } finally {
    studentsLoading.value = false
  }
}

const onClassroomChange = async (cid: number | null) => {
  form.student_id = null
  await loadStudents(cid)
}

const hydrate = () => {
  if (props.mode === 'edit' && props.initial) {
    Object.assign(form, {
      student_id: props.initial.student_id,
      incident_type: props.initial.incident_type || '',
      severity: props.initial.severity || '',
      occurred_at: props.initial.occurred_at ? (props.initial.occurred_at as string).slice(0, 19) : '',
      description: props.initial.description || '',
      action_taken: props.initial.action_taken || '',
      parent_notified: !!props.initial.parent_notified,
      responsible_employee_id: (props.initial.responsible_employee_id as number | null) ?? null,
      // BE Decimal 序列化可能是字串（'-2.00'），統一轉 number
      appraisal_score_delta:
        props.initial.appraisal_score_delta != null
          ? Number(props.initial.appraisal_score_delta)
          : null,
    })
    pickedClassroomId.value = (props.initial.classroom_id as number | null) || props.defaultClassroomId || null
    studentOptions.value = props.initial.student_name
      ? [{ id: props.initial.student_id, name: props.initial.student_name }]
      : []
  } else {
    Object.assign(form, empty())
    if (props.lockStudent && props.defaultStudentId) {
      form.student_id = props.defaultStudentId
    }
    pickedClassroomId.value = props.defaultClassroomId || null
    if (props.defaultClassroomId && !props.lockStudent) {
      loadStudents(props.defaultClassroomId)
    } else if (props.lockStudent && props.defaultStudentId) {
      studentOptions.value = [{ id: props.defaultStudentId, name: props.initial?.student_name || '本學生' }]
    } else {
      studentOptions.value = []
    }
  }
}

watch(() => props.visible, (v) => {
  if (!v) return
  hydrate()
  if (canWriteAppraisalFields.value) loadEmployees()
})

const onClosed = () => {
  Object.assign(form, empty())
  pickedClassroomId.value = null
  studentOptions.value = []
}

const submit = async () => {
  if (!form.student_id || !form.incident_type || !form.occurred_at || !form.description) {
    ElMessage.warning('請填寫必填欄位（學生、類型、發生時間、描述）')
    return
  }
  submitting.value = true
  try {
    const payload: Record<string, unknown> = {
      student_id: form.student_id,
      incident_type: form.incident_type,
      severity: form.severity || null,
      occurred_at: form.occurred_at,
      description: form.description,
      action_taken: form.action_taken || null,
      parent_notified: form.parent_notified,
    }
    if (canWriteAppraisalFields.value) {
      // 非管理角色不可帶這兩鍵（BE touch 即 403）；clear 產生的 undefined 會被
      // JSON.stringify 丟鍵 → BE exclude_unset 視為未變更，必以 ?? null 正規化。
      // 非意外受傷型別送 null（BE 對非 null delta 回 422，並清掉改型別後的殘值）。
      const isAccident = form.incident_type === '意外受傷'
      payload.responsible_employee_id = isAccident ? (form.responsible_employee_id ?? null) : null
      payload.appraisal_score_delta = isAccident ? (form.appraisal_score_delta ?? null) : null
    }
    const recordsStore = useStudentRecordsStore()
    let saved
    if (props.mode === 'create') {
      saved = await recordsStore.createRecord('incident', payload)
      ElMessage.success('新增成功')
    } else {
      saved = await recordsStore.updateRecord('incident', props.initial!.id as number, payload)
      ElMessage.success('更新成功')
    }
    emit('submitted', { payload, saved })
    emit('update:visible', false)
  } catch (e) {
    ElMessage.error(apiError(e, '操作失敗'))
  } finally {
    submitting.value = false
  }
}
</script>
