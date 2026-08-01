<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="(v) => emit('update:visible', v)"
    :title="mode === 'create' ? '新增評量記錄' : '編輯評量記錄'"
    width="580px"
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
      <el-form-item label="學期 *">
        <el-input v-model="form.semester" placeholder="例：2025上" style="width: 100%" />
      </el-form-item>
      <el-form-item label="評量類型 *">
        <el-select v-model="form.assessment_type" placeholder="選擇類型" style="width: 100%">
          <el-option v-for="t in ASSESSMENT_TYPES" :key="t" :label="t" :value="t" />
        </el-select>
      </el-form-item>
      <el-form-item label="評量日期 *">
        <el-date-picker
          v-model="form.assessment_date"
          type="date"
          placeholder="選擇日期"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="評量內容 *">
        <el-input v-model="form.content" type="textarea" :rows="4" placeholder="請描述評量觀察內容" />
      </el-form-item>

      <!-- 補充（選填） -->
      <FormSection data-test="section-extra" title="補充（選填）" collapsible :default-open="false">
        <el-form-item label="領域">
          <el-select v-model="form.domain" placeholder="選擇領域" clearable style="width: 100%">
            <el-option v-for="d in DOMAINS" :key="d" :label="d" :value="d" />
          </el-select>
        </el-form-item>
        <el-form-item label="評等">
          <el-select v-model="form.rating" placeholder="選擇評等" clearable style="width: 100%">
            <el-option v-for="r in RATINGS" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="改善建議">
          <el-input v-model="form.suggestions" type="textarea" :rows="2" placeholder="改善建議（選填）" />
        </el-form-item>
        <el-form-item label="關聯事件">
          <el-select
            v-model="form.related_incident_id"
            placeholder="（選填）引用本生既有事件"
            clearable
            :loading="incidentsLoading"
            style="width: 100%"
          >
            <el-option
              v-for="inc in incidentOptions"
              :key="inc.id as PropertyKey"
              :label="`${(inc.occurred_at as string | undefined)?.slice(0, 10) || ''}　${inc.incident_type || ''}`"
              :value="(inc.id as number)"
            />
          </el-select>
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
import { friendlyError } from '@/utils/errorMessages'
import { ASSESSMENT_TYPES, DOMAINS, RATINGS } from '@/constants/studentRecords'
import { getStudents } from '@/api/students'
import { getIncidents } from '@/api/studentIncidents'
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

interface AssessmentForm {
  student_id: number | null
  semester: string
  assessment_type: string
  domain: string
  rating: string
  content: string
  suggestions: string
  assessment_date: string
  related_incident_id: number | null
}

const empty = (): AssessmentForm => ({
  student_id: null,
  semester: '',
  assessment_type: '',
  domain: '',
  rating: '',
  content: '',
  suggestions: '',
  assessment_date: '',
  related_incident_id: null,
})

const form = reactive<AssessmentForm>(empty())
const pickedClassroomId = ref<number | null>(null)
const studentOptions = ref<Record<string, unknown>[]>([])
const studentsLoading = ref(false)
const submitting = ref(false)
const incidentOptions = ref<Record<string, unknown>[]>([])
const incidentsLoading = ref(false)

const loadIncidents = async (studentId: number | null) => {
  if (!studentId) {
    incidentOptions.value = []
    return
  }
  incidentsLoading.value = true
  try {
    const res = await getIncidents({ student_id: studentId, limit: 50 })
    incidentOptions.value = (res.data?.items ?? []) as unknown as Record<string, unknown>[]
  } catch {
    incidentOptions.value = []
  } finally {
    incidentsLoading.value = false
  }
}

watch(
  () => form.student_id,
  (sid) => {
    if (sid) loadIncidents(sid as number)
    else incidentOptions.value = []
  },
)

const loadStudents = async (classroomId: number | null) => {
  if (!classroomId) { studentOptions.value = []; return }
  studentsLoading.value = true
  try {
     
    const res = await getStudents({ classroom_id: classroomId, is_active: true, limit: 500 })
    studentOptions.value = res.data.items || []
  } catch (e) {
    ElMessage.error(friendlyError('載入學生資料失敗', e))
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
    const init = props.initial
    Object.assign(form, {
      student_id: init.student_id,
      semester: init.semester || '',
      assessment_type: init.assessment_type || '',
      domain: init.domain || '',
      rating: init.rating || '',
      content: init.content || '',
      suggestions: init.suggestions || '',
      assessment_date: init.assessment_date || '',
      related_incident_id: init.related_incident_id ?? null,
    })
    pickedClassroomId.value = (init.classroom_id as number | null) || props.defaultClassroomId || null
    studentOptions.value = init.student_name
      ? [{ id: init.student_id, name: init.student_name }]
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
  if (!form.student_id || !form.semester || !form.assessment_type || !form.content || !form.assessment_date) {
    ElMessage.warning('請填寫必填欄位（學生、學期、評量類型、評量內容、評量日期）')
    return
  }
  submitting.value = true
  try {
    const payload = {
      student_id: form.student_id,
      semester: form.semester,
      assessment_type: form.assessment_type,
      domain: form.domain || null,
      rating: form.rating || null,
      content: form.content,
      suggestions: form.suggestions || null,
      assessment_date: form.assessment_date,
      related_incident_id: form.related_incident_id ?? null,
    }
    const recordsStore = useStudentRecordsStore()
    let saved
    if (props.mode === 'create') {
      saved = await recordsStore.createRecord('assessment', payload)
      ElMessage.success('新增成功')
    } else {
      saved = await recordsStore.updateRecord('assessment', props.initial!.id as number, payload)
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
