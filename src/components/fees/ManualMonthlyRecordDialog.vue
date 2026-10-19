<template>
  <FormDialog
    :model-value="modelValue" title="補建月費單" size="compact"
    :loading="saving" :enter-submit="false" :destroy-on-close="false"
    append-to-body :close-on-click-modal="false" :close-on-press-escape="!saving"
    :show-close="!saving" @update:model-value="close"
  >
    <p class="mm-hint">
      為發單批次漏掉的學生（例如月中轉入）補建 {{ classroomName || '該班' }}的月費單；該生該月已有月費單時會被擋下。
    </p>
    <el-form label-position="top" :disabled="saving" @submit.prevent="submit">
      <el-form-item label="學生" required>
        <div class="mm-student">
          <el-select
            v-model="form.student_id" filterable placeholder="選擇學生" aria-label="學生"
            style="min-width: 200px" data-test="mm-student"
          >
            <el-option v-for="s in studentOptions" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
          <el-button :disabled="saving" data-test="mm-pick-other" @click="pickerOpen = true">搜尋其他學生</el-button>
        </div>
      </el-form-item>
      <el-form-item label="月份（YYYY-MM）" required>
        <el-input v-model="form.target_month" maxlength="7" placeholder="2026-10" aria-label="月份" data-test="mm-month" />
      </el-form-item>
      <el-form-item label="金額（元）" required>
        <el-input-number v-model="form.amount_due" :min="1" :max="999999" :precision="0" controls-position="right" aria-label="金額（元）" data-test="mm-amount" />
      </el-form-item>
      <el-form-item label="補建原因（10–200 字）" required>
        <el-input v-model="form.reason" type="textarea" :rows="3" maxlength="200" show-word-limit aria-label="補建原因" data-test="mm-reason" />
      </el-form-item>
    </el-form>
    <p v-if="validationError" class="mm-error" data-test="mm-validation">{{ validationError }}</p>
    <template #footer>
      <el-button :disabled="saving" data-test="mm-cancel" @click="close(false)">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="!!validationError || saving" data-test="mm-submit" @click="submit">補建月費單</el-button>
    </template>
  </FormDialog>
  <StudentPickerDialog v-model="pickerOpen" @pick="pickOther" />
</template>
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createManualMonthlyRecord } from '@/api/fees'
import { getStudents } from '@/api/students'
import { friendlyError } from '@/utils/errorMessages'
import FormDialog from '@/components/common/FormDialog.vue'
import StudentPickerDialog from './StudentPickerDialog.vue'
import { validateManualMonthly, type ManualMonthlyForm } from './manualMonthlyRecord'

interface StudentOption { id: number; name: string }

const props = defineProps<{
  modelValue: boolean
  /** 月繳總表當前月份 YYYY-MM，預帶 */
  month: string
  classroomName?: string
  /** 班級 id（可解析時才會撈該班在學名單，補上月表沒有的新生） */
  classroomId?: number | null
  /** 月表上該班已有的學生 */
  statementStudents: StudentOption[]
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: []
}>()

const form = reactive<ManualMonthlyForm>({
  student_id: null, target_month: props.month, amount_due: undefined, reason: '',
})
const saving = ref(false)
const pickerOpen = ref(false)
const rosterStudents = ref<StudentOption[]>([])
const extraStudents = ref<StudentOption[]>([])

const studentOptions = computed(() => {
  const map = new Map<number, StudentOption>()
  for (const s of [...props.statementStudents, ...rosterStudents.value, ...extraStudents.value]) {
    map.set(s.id, s)
  }
  return [...map.values()]
})
const validationError = computed(() => validateManualMonthly(form))

async function loadRoster() {
  rosterStudents.value = []
  if (props.classroomId == null) return
  try {
    const res = await getStudents({ classroom_id: props.classroomId, is_active: true, limit: 200 })
    const data = res.data as unknown as { items?: StudentOption[] } | StudentOption[]
    const items = Array.isArray(data) ? data : (data.items ?? [])
    rosterStudents.value = items.map((s) => ({ id: s.id, name: s.name }))
  } catch {
    // 名單撈失敗不擋補建：仍可用月表學生或「搜尋其他學生」
  }
}

watch(() => props.modelValue, (open) => {
  if (!open) return
  form.student_id = null
  form.target_month = props.month
  form.amount_due = undefined
  form.reason = ''
  extraStudents.value = []
  pickerOpen.value = false
  void loadRoster()
}, { immediate: true })

function pickOther(s: { id: number; name: string }) {
  extraStudents.value = [...extraStudents.value, { id: s.id, name: s.name }]
  form.student_id = s.id
}
function close(value: boolean) {
  if (!saving.value) emit('update:modelValue', value)
}

async function submit() {
  if (saving.value || validationError.value || form.student_id == null || form.amount_due == null) return
  saving.value = true
  try {
    await createManualMonthlyRecord({
      student_id: form.student_id,
      target_month: form.target_month,
      amount_due: form.amount_due,
      reason: form.reason.trim(),
    })
    ElMessage.success('已補建月費單')
    emit('created')
    emit('update:modelValue', false)
  } catch (error) {
    const e = error as { response?: { status?: number; data?: { detail?: { code?: string } } } }
    if (e.response?.status === 409 && e.response.data?.detail?.code === 'MONTHLY_RECORD_EXISTS') {
      ElMessage.error('此學生該月已有月費單')
    } else {
      ElMessage.error(friendlyError('補建月費單失敗，請稍後重試', error))
    }
  } finally {
    saving.value = false
  }
}
</script>
<style scoped>
.mm-hint { color: var(--color-text-secondary); margin: 0 0 var(--space-4); line-height: 1.6; }
.mm-student { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.mm-error { color: var(--color-danger, #f56c6c); margin: 0; font-size: 13px; }
</style>
