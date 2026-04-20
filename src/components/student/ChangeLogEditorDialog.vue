<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="(v) => emit('update:visible', v)"
    :title="mode === 'create' ? '補登歷史異動紀錄' : '編輯補登紀錄'"
    width="520px"
    @closed="onClosed"
  >
    <el-alert
      v-if="mode === 'create'"
      type="warning"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    >
      <template #title>
        此功能僅補寫歷史遺漏的紀錄，<strong>不會更動學生目前狀態</strong>
      </template>
      <div style="font-size: 0.85em; line-height: 1.6">
        若要將學生轉為退學／畢業／轉出等，請使用「變更狀態」功能。
      </div>
    </el-alert>

    <el-form ref="formRef" :model="form" :rules="formRules" label-width="90px">
      <el-form-item v-if="mode === 'create'" label="學年學期" prop="termKey">
        <el-select v-model="form.termKey" style="width: 100%">
          <el-option v-for="t in allTermOptions" :key="t.key" :label="t.label" :value="t.key" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="mode === 'create' && !lockStudent" label="學生" prop="student_id">
        <el-select
          v-model="form.student_id"
          filterable
          remote
          :remote-method="searchStudents"
          :loading="studentSearchLoading"
          placeholder="輸入姓名搜尋"
          style="width: 100%"
          clearable
        >
          <el-option v-for="s in studentOptions" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="異動類型" prop="event_type">
        <el-select v-model="form.event_type" style="width: 100%" @change="form.reason = ''">
          <el-option v-for="et in eventTypes" :key="et" :label="et" :value="et" />
        </el-select>
      </el-form-item>
      <el-form-item label="原因" prop="reason">
        <el-select v-model="form.reason" style="width: 100%" clearable>
          <el-option v-for="r in currentReasonOptions" :key="r" :label="r" :value="r" />
        </el-select>
      </el-form-item>
      <el-form-item label="異動日期" prop="event_date">
        <el-date-picker
          v-model="form.event_date"
          type="date"
          format="YYYY-MM-DD"
          value-format="YYYY-MM-DD"
          :disabled-date="isFutureDate"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="備註">
        <el-input v-model="form.notes" type="textarea" :rows="3" placeholder="補充說明（選填）" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">
        {{ mode === 'create' ? '補登' : '儲存' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getCurrentAcademicTerm } from '@/utils/academic'
import { getChangeLogOptions } from '@/api/studentChangeLogs'
import { getStudents } from '@/api/students'
import { useStudentRecordsStore } from '@/stores/studentRecords'

const isoToday = () => new Date().toISOString().slice(0, 10)
const isFutureDate = (d) => {
  if (!(d instanceof Date)) return false
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}` > isoToday()
}

const props = defineProps({
  visible: { type: Boolean, default: false },
  mode: { type: String, default: 'create' },
  initial: { type: Object, default: null },
  lockStudent: { type: Boolean, default: false },
  defaultStudentId: { type: Number, default: null },
  defaultTermKey: { type: String, default: null }, // e.g. "114-2"
})

const emit = defineEmits(['update:visible', 'submitted'])

const currentTerm = getCurrentAcademicTerm()

const semLabel = (s) => (s === 1 ? '上學期' : '下學期')
const makeTerm = (sy, sem) => ({
  key: `${sy}-${sem}`,
  school_year: sy,
  semester: sem,
  label: `${sy}學年度 ${semLabel(sem)}`,
})

const allTermOptions = computed(() => {
  const terms = []
  let sy = currentTerm.school_year
  let s = currentTerm.semester
  for (let i = 0; i < 6; i++) {
    terms.push(makeTerm(sy, s))
    if (s === 1) { s = 2; sy -= 1 } else { s = 1 }
  }
  return terms
})

const defaultKey = () =>
  props.defaultTermKey || `${currentTerm.school_year}-${currentTerm.semester}`

const empty = () => ({
  termKey: defaultKey(),
  student_id: null,
  event_type: '',
  event_date: '',
  reason: '',
  notes: '',
})

const form = reactive(empty())
const formRef = ref(null)
const submitting = ref(false)

const formRules = {
  student_id: [{ required: true, message: '請選擇學生', trigger: 'change' }],
  event_type: [{ required: true, message: '請選擇異動類型', trigger: 'change' }],
  event_date: [
    { required: true, message: '請選擇異動日期', trigger: 'change' },
    {
      validator: (_rule, value, cb) => {
        if (value && value > isoToday()) {
          cb(new Error('補登只能選今天或過去的日期'))
        } else {
          cb()
        }
      },
      trigger: 'change',
    },
  ],
}

const eventTypes = ref([])
const reasonOptions = ref({})
const optionsLoaded = ref(false)

const loadOptions = async () => {
  if (optionsLoaded.value) return
  try {
    const res = await getChangeLogOptions()
    eventTypes.value = res.data.event_types
    reasonOptions.value = res.data.reason_options
  } catch {
    eventTypes.value = ['入學', '復學', '退學', '轉出', '轉入', '畢業']
  } finally {
    optionsLoaded.value = true
  }
}

const currentReasonOptions = computed(() =>
  form.event_type ? (reasonOptions.value[form.event_type] || []) : []
)

const studentOptions = ref([])
const studentSearchLoading = ref(false)

const searchStudents = async (query) => {
  if (!query) return
  studentSearchLoading.value = true
  try {
    const res = await getStudents({ search: query, page_size: 20 })
    studentOptions.value = res.data.items || []
  } catch {
    studentOptions.value = []
  } finally {
    studentSearchLoading.value = false
  }
}

const hydrate = async () => {
  await loadOptions()
  if (props.mode === 'edit' && props.initial) {
    Object.assign(form, {
      termKey: `${props.initial.school_year}-${props.initial.semester}`,
      student_id: props.initial.student_id,
      event_type: props.initial.event_type || '',
      event_date: props.initial.event_date || '',
      reason: props.initial.reason || '',
      notes: props.initial.notes || '',
    })
    studentOptions.value = props.initial.student_name
      ? [{ id: props.initial.student_id, name: props.initial.student_name }]
      : []
  } else {
    Object.assign(form, empty())
    if (props.lockStudent && props.defaultStudentId) {
      form.student_id = props.defaultStudentId
      studentOptions.value = [{ id: props.defaultStudentId, name: props.initial?.student_name || '本學生' }]
    } else {
      studentOptions.value = []
    }
  }
}

watch(() => props.visible, (v) => { if (v) hydrate() })

const onClosed = () => {
  formRef.value?.resetFields()
  Object.assign(form, empty())
}

const submit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    const recordsStore = useStudentRecordsStore()
    if (props.mode === 'create') {
      const [school_year, semester] = form.termKey.split('-').map(Number)
      await recordsStore.createRecord('change_log', {
        student_id: form.student_id,
        school_year,
        semester,
        event_type: form.event_type,
        event_date: form.event_date,
        reason: form.reason || undefined,
        notes: form.notes || undefined,
      })
      ElMessage.success('異動紀錄已補登')
    } else {
      await recordsStore.updateRecord('change_log', props.initial.id, {
        event_type: form.event_type,
        event_date: form.event_date,
        reason: form.reason || undefined,
        notes: form.notes || undefined,
      })
      ElMessage.success('補登紀錄已更新')
    }
    emit('submitted')
    emit('update:visible', false)
  } catch (err) {
    const detail = err?.response?.data?.detail
    ElMessage.error(detail || (props.mode === 'create' ? '補登失敗' : '更新失敗'))
  } finally {
    submitting.value = false
  }
}
</script>
