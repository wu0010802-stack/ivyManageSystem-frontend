<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { createClassroom, getGrades } from '@/api/classrooms'
import { useQuickAddSubmit } from './useQuickAddSubmit'

type Grade = { id: number; name: string }

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

const formRef = ref<FormInstance>()
const form = reactive({
  name: '',
  grade_id: null as number | null,
  capacity: 30,
})

const rules: FormRules = {
  name: [{ required: true, message: '請輸入班級名稱', trigger: 'blur' }],
  grade_id: [{ required: true, message: '請選擇年級', trigger: 'change' }],
}

const grades = ref<Grade[]>([])
const gradesLoading = ref(false)

const loadGrades = async () => {
  if (grades.value.length > 0) return
  gradesLoading.value = true
  try {
    const res = await getGrades()
    grades.value = Array.isArray(res.data) ? res.data : []
  } finally {
    gradesLoading.value = false
  }
}

onMounted(loadGrades)

const { submitting, run } = useQuickAddSubmit()

const resetForm = () => {
  form.name = ''
  form.grade_id = null
  form.capacity = 30
  formRef.value?.clearValidate()
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      resetForm()
      loadGrades()
    }
  },
)

const handleSubmit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || form.grade_id == null) return
  const result = await run({
    label: '班級',
    listPath: '/classrooms',
    listLabel: '班級管理',
    context: 'QuickClassroomDialog:submit',
    submit: () =>
      createClassroom({
        name: form.name,
        grade_id: form.grade_id as number,
        capacity: form.capacity,
        is_active: true,
      }),
  })
  if (result) emit('update:visible', false)
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="快速新增班級"
    width="480px"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
      <el-form-item label="班級名稱" prop="name">
        <el-input v-model="form.name" maxlength="50" placeholder="例：小班 A" />
      </el-form-item>
      <el-form-item label="年級" prop="grade_id">
        <el-select v-model="form.grade_id" placeholder="選擇年級" :loading="gradesLoading" style="width: 100%">
          <el-option v-for="g in grades" :key="g.id" :label="g.name" :value="g.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="人數上限">
        <el-input-number v-model="form.capacity" :min="1" :max="200" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">送出</el-button>
    </template>
  </el-dialog>
</template>
