<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createGrowthReport } from '@/api/studentGrowthReports'

const props = withDefaults(defineProps<{
  modelValue?: boolean
  studentId: number
}>(), {
  modelValue: false,
})
const emit = defineEmits<{
  'update:modelValue': [v: boolean]
  'created': [data: unknown]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const form = ref<{
  period_label: string
  period_start: string | null
  period_end: string | null
  teacher_narrative: string
}>({
  period_label: '',
  period_start: null,
  period_end: null,
  teacher_narrative: '',
})

watch(visible, (v) => {
  if (v) {
    const today = new Date()
    const yyyy = today.getFullYear()
    form.value = {
      period_label: `${yyyy} 春季`,
      period_start: `${yyyy}-02-01`,
      period_end: `${yyyy}-06-30`,
      teacher_narrative: '',
    }
  }
})

const submitting = ref(false)

async function onSubmit() {
  if (!form.value.period_label || !form.value.period_start || !form.value.period_end) {
    ElMessage.warning('請填入期間標籤與起訖日')
    return
  }
  submitting.value = true
  try {
    const r = await createGrowthReport(props.studentId, form.value)
    ElMessage.success('報告已開始生成，請稍候')
    emit('created', r.data)
    visible.value = false
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ElMessage.error((e as any)?.response?.data?.detail || '建立失敗')
  } finally {
    submitting.value = false
  }
}

// Expose for tests
defineExpose({ form, onSubmit })
</script>

<template>
  <el-dialog v-model="visible" title="生成成長報告" width="480">
    <el-form :model="form" label-width="100" label-position="right">
      <el-form-item label="期間標籤">
        <el-input v-model="form.period_label" placeholder="例：2026 春季" />
      </el-form-item>
      <el-form-item label="起始日">
        <el-date-picker v-model="form.period_start" type="date" value-format="YYYY-MM-DD" />
      </el-form-item>
      <el-form-item label="結束日">
        <el-date-picker v-model="form.period_end" type="date" value-format="YYYY-MM-DD" />
      </el-form-item>
      <el-form-item label="教師敘述">
        <el-input v-model="form.teacher_narrative" type="textarea" :rows="4"
                  placeholder="本期孩子的綜合表現..." maxlength="5000" show-word-limit />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="onSubmit">建立並生成</el-button>
    </template>
  </el-dialog>
</template>
