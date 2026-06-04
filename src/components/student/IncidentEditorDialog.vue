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
    </el-form>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">確認</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { INCIDENT_TYPES, SEVERITIES } from '@/constants/studentRecords'
import { getStudents } from '@/api/students'
import { useStudentRecordsStore } from '@/stores/studentRecords'
import { apiError } from '@/utils/error'
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
}

const empty = (): IncidentForm => ({
  student_id: null,
  incident_type: '',
  severity: '',
  occurred_at: '',
  description: '',
  action_taken: '',
  parent_notified: false,
})

const form = reactive<IncidentForm>(empty())
const pickedClassroomId = ref<number | null>(null)
const studentOptions = ref<Record<string, unknown>[]>([])
const studentsLoading = ref(false)
const submitting = ref(false)

const loadStudents = async (classroomId: number | null) => {
  if (!classroomId) { studentOptions.value = []; return }
  studentsLoading.value = true
  try {
     
    const res = await getStudents({ classroom_id: classroomId, is_active: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    studentOptions.value = (res as any).data?.items || []
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

watch(() => props.visible, (v) => { if (v) hydrate() })

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
    const payload = {
      student_id: form.student_id,
      incident_type: form.incident_type,
      severity: form.severity || null,
      occurred_at: form.occurred_at,
      description: form.description,
      action_taken: form.action_taken || null,
      parent_notified: form.parent_notified,
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
