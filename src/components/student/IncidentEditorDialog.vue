<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="(v) => emit('update:visible', v)"
    :title="mode === 'create' ? '新增事件紀錄' : '編輯事件紀錄'"
    width="560px"
    @closed="onClosed"
  >
    <el-form label-width="90px">
      <el-form-item v-if="!lockStudent" label="班級">
        <el-select
          v-model="pickedClassroomId"
          placeholder="選擇班級"
          @change="onClassroomChange"
          style="width: 100%"
        >
          <el-option v-for="c in classrooms" :key="c.id" :label="c.name" :value="c.id" />
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
          <el-option v-for="s in studentOptions" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="事件類型 *">
        <el-select v-model="form.incident_type" placeholder="選擇類型" style="width: 100%">
          <el-option v-for="t in INCIDENT_TYPES" :key="t" :label="t" :value="t" />
        </el-select>
      </el-form-item>
      <el-form-item label="嚴重程度">
        <el-select v-model="form.severity" placeholder="選擇嚴重程度" clearable style="width: 100%">
          <el-option v-for="s in SEVERITIES" :key="s" :label="s" :value="s" />
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
      <el-form-item label="處置方式">
        <el-input v-model="form.action_taken" type="textarea" :rows="2" placeholder="已採取的處置措施" />
      </el-form-item>
      <el-form-item label="通知家長">
        <el-checkbox v-model="form.parent_notified">已通知家長</el-checkbox>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">確認</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { INCIDENT_TYPES, SEVERITIES } from '@/constants/studentRecords'
import { getStudents } from '@/api/students'
import { useStudentRecordsStore } from '@/stores/studentRecords'
import { apiError } from '@/utils/error'

const props = defineProps({
  visible: { type: Boolean, default: false },
  mode: { type: String, default: 'create' }, // 'create' | 'edit'
  initial: { type: Object, default: null },
  lockStudent: { type: Boolean, default: false },
  defaultStudentId: { type: Number, default: null },
  defaultClassroomId: { type: Number, default: null },
  classrooms: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:visible', 'submitted'])

const empty = () => ({
  student_id: null,
  incident_type: '',
  severity: '',
  occurred_at: '',
  description: '',
  action_taken: '',
  parent_notified: false,
})

const form = reactive(empty())
const pickedClassroomId = ref(null)
const studentOptions = ref([])
const studentsLoading = ref(false)
const submitting = ref(false)

const loadStudents = async (classroomId) => {
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

const onClassroomChange = async (cid) => {
  form.student_id = null
  await loadStudents(cid)
}

const hydrate = () => {
  if (props.mode === 'edit' && props.initial) {
    Object.assign(form, {
      student_id: props.initial.student_id,
      incident_type: props.initial.incident_type || '',
      severity: props.initial.severity || '',
      occurred_at: props.initial.occurred_at ? props.initial.occurred_at.slice(0, 19) : '',
      description: props.initial.description || '',
      action_taken: props.initial.action_taken || '',
      parent_notified: !!props.initial.parent_notified,
    })
    pickedClassroomId.value = props.initial.classroom_id || props.defaultClassroomId || null
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
      saved = await recordsStore.updateRecord('incident', props.initial.id, payload)
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
