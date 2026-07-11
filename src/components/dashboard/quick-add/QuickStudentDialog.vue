<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { createStudent } from '@/api/students'
import { getClassrooms } from '@/api/classrooms'
import { useQuickAddSubmit } from './useQuickAddSubmit'
import { submitStudentCreateWithDuplicateConfirm } from '@/utils/studentDuplicateConflict'

type ClassroomOption = { id: number; name: string }

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

const formRef = ref<FormInstance>()
const form = reactive({
  student_id: '',
  name: '',
  gender: '' as '' | 'M' | 'F',
  birthday: '' as string,
  classroom_id: null as number | null,
})

const rules: FormRules = {
  student_id: [{ required: true, message: '請輸入學號', trigger: 'blur' }],
  name: [{ required: true, message: '請輸入姓名', trigger: 'blur' }],
}

const classrooms = ref<ClassroomOption[]>([])
const classroomsLoading = ref(false)

const loadClassrooms = async () => {
  if (classrooms.value.length > 0) return
  classroomsLoading.value = true
  try {
    const res = await getClassrooms({})
    const data = (res?.data ?? []) as unknown
    classrooms.value = Array.isArray(data) ? (data as ClassroomOption[]) : []
  } finally {
    classroomsLoading.value = false
  }
}

onMounted(loadClassrooms)

const { submitting, run } = useQuickAddSubmit()

const resetForm = () => {
  form.student_id = ''
  form.name = ''
  form.gender = ''
  form.birthday = ''
  form.classroom_id = null
  formRef.value?.clearValidate()
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      resetForm()
      loadClassrooms()
    }
  },
)

const handleSubmit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  const payload: Record<string, unknown> = {
    student_id: form.student_id.trim(),
    name: form.name.trim(),
  }
  if (form.gender) payload.gender = form.gender
  if (form.birthday) payload.birthday = form.birthday
  if (form.classroom_id != null) payload.classroom_id = form.classroom_id
  const result = await run({
    label: '學生',
    listPath: '/students',
    listLabel: '學生管理',
    context: 'QuickStudentDialog:submit',
    // 重複建檔查重（架構評估 D4）：命中 409 時彈確認框，使用者確認後帶
    // allow_duplicate:true 重送；取消則拋出 StudentDuplicateCreateCancelled，
    // run() 內部經 useErrorNotify 的 isSilentError 靜默處理（不顯示錯誤 toast）。
    submit: () => submitStudentCreateWithDuplicateConfirm(createStudent, payload),
  })
  if (result) emit('update:visible', false)
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="快速新增學生"
    width="520px"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
      <el-form-item label="學號" prop="student_id">
        <el-input v-model="form.student_id" maxlength="20" placeholder="例：S2026001" />
      </el-form-item>
      <el-form-item label="姓名" prop="name">
        <el-input v-model="form.name" maxlength="50" placeholder="學生姓名" />
      </el-form-item>
      <el-form-item label="性別">
        <el-radio-group v-model="form.gender">
          <el-radio value="M">男</el-radio>
          <el-radio value="F">女</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="生日">
        <el-date-picker
          v-model="form.birthday"
          type="date"
          value-format="YYYY-MM-DD"
          style="width: 100%"
          placeholder="選擇生日"
        />
      </el-form-item>
      <el-form-item label="班級">
        <el-select
          v-model="form.classroom_id"
          placeholder="選擇班級（可留空）"
          clearable
          filterable
          :loading="classroomsLoading"
          style="width: 100%"
        >
          <el-option v-for="c in classrooms" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">送出</el-button>
    </template>
  </el-dialog>
</template>
