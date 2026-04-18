<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="(v) => emit('update:visible', v)"
    :title="mode === 'create' ? '新增評量記錄' : '編輯評量記錄'"
    width="580px"
    @closed="onClosed"
  >
    <el-form label-width="100px">
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
      <el-form-item label="學期 *">
        <el-input v-model="form.semester" placeholder="例：2025上" style="width: 100%" />
      </el-form-item>
      <el-form-item label="評量類型 *">
        <el-select v-model="form.assessment_type" placeholder="選擇類型" style="width: 100%">
          <el-option v-for="t in ASSESSMENT_TYPES" :key="t" :label="t" :value="t" />
        </el-select>
      </el-form-item>
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
      <el-form-item label="改善建議">
        <el-input v-model="form.suggestions" type="textarea" :rows="2" placeholder="改善建議（選填）" />
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
import { ASSESSMENT_TYPES, DOMAINS, RATINGS } from '@/constants/studentRecords'
import { createAssessment, updateAssessment } from '@/api/studentAssessments'
import { getStudents } from '@/api/students'
import { apiError } from '@/utils/error'

const props = defineProps({
  visible: { type: Boolean, default: false },
  mode: { type: String, default: 'create' },
  initial: { type: Object, default: null },
  lockStudent: { type: Boolean, default: false },
  defaultStudentId: { type: Number, default: null },
  defaultClassroomId: { type: Number, default: null },
  classrooms: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:visible', 'submitted'])

const empty = () => ({
  student_id: null,
  semester: '',
  assessment_type: '',
  domain: '',
  rating: '',
  content: '',
  suggestions: '',
  assessment_date: '',
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
      semester: props.initial.semester || '',
      assessment_type: props.initial.assessment_type || '',
      domain: props.initial.domain || '',
      rating: props.initial.rating || '',
      content: props.initial.content || '',
      suggestions: props.initial.suggestions || '',
      assessment_date: props.initial.assessment_date || '',
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
    }
    let saved
    if (props.mode === 'create') {
      const res = await createAssessment(payload)
      saved = res.data
      ElMessage.success('新增成功')
    } else {
      const res = await updateAssessment(props.initial.id, payload)
      saved = res.data
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
