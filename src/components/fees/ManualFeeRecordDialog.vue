<template>
  <FormDialog
    :model-value="modelValue" title="新增單筆費用" size="compact"
    :loading="saving" :enter-submit="false" :destroy-on-close="false"
    append-to-body :close-on-click-modal="false" :close-on-press-escape="!saving"
    :show-close="!saving" @update:model-value="close"
  >
    <p class="manual-fee-hint">補登尚未列入銷帳單的額外費用；建立後列為待收，不會修改原銷帳單。</p>
    <el-form label-position="top" :disabled="saving" @submit.prevent="submit">
      <el-form-item label="學生" required>
        <div class="manual-fee-student">
          <span>{{ student ? `${student.name}（${student.classroom_name || '未編班'}）` : '請指定一位學生' }}</span>
          <el-button :disabled="saving" data-test="manual-fee-pick" @click="pickerOpen = true">{{ student ? '更換學生' : '指定學生' }}</el-button>
        </div>
      </el-form-item>
      <el-form-item label="費用項目" required>
        <el-input v-model="name" :disabled="saving" maxlength="100" placeholder="例如：衣服、娃娃車" aria-label="費用項目" data-test="manual-fee-name" />
      </el-form-item>
      <el-form-item label="金額（元）" required>
        <el-input-number v-model="amount" :disabled="saving" :min="1" :max="999999" :precision="0" controls-position="right" aria-label="金額（元）" data-test="manual-fee-amount" />
      </el-form-item>
      <el-form-item label="收費日期" required>
        <el-date-picker v-model="billingDate" :disabled="saving" type="date" value-format="YYYY-MM-DD" placeholder="選擇收費日期" aria-label="收費日期" data-test="manual-fee-date" />
      </el-form-item>
      <el-form-item label="繳費期限（選填）" :error="dueDate && dueDate < billingDate ? '繳費期限不可早於收費日期' : undefined">
        <el-date-picker v-model="dueDate" :disabled="saving" type="date" value-format="YYYY-MM-DD" clearable placeholder="未指定期限" aria-label="繳費期限" data-test="manual-fee-due-date" />
      </el-form-item>
      <el-form-item label="備註（選填）">
        <el-input v-model="notes" :disabled="saving" type="textarea" :rows="2" maxlength="500" show-word-limit aria-label="備註" data-test="manual-fee-notes" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button :disabled="saving" data-test="manual-fee-cancel" @click="close(false)">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="!valid || saving" data-test="manual-fee-submit" @click="submit">新增費用</el-button>
    </template>
  </FormDialog>
  <StudentPickerDialog v-model="pickerOpen" @pick="pickStudent" />
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createManualFeeRecord } from '@/api/fees'
import type { Schema } from '@/api/_generated/typed'
import { todayTaipeiISO } from '@/utils/format'
import { friendlyError } from '@/utils/errorMessages'
import StudentPickerDialog from './StudentPickerDialog.vue'
import FormDialog from '@/components/common/FormDialog.vue'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: [record: Schema<'FeeRecordOut'>]
}>()
interface PickedStudent { id: number; name: string; classroom_name: string | null }
const student = ref<PickedStudent | null>(null)
const pickerOpen = ref(false)
const name = ref('')
const amount = ref<number | undefined>()
const billingDate = ref(todayTaipeiISO())
const dueDate = ref('')
const notes = ref('')
const saving = ref(false)
function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(`${value}T00:00:00Z`)
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day
}
const valid = computed(() => Boolean(student.value)
  && name.value.trim().length > 0 && name.value.trim().length <= 100
  && Number.isSafeInteger(amount.value) && amount.value! > 0 && amount.value! <= 999999
  && isDate(billingDate.value)
  && (!dueDate.value || (isDate(dueDate.value) && dueDate.value >= billingDate.value))
  && notes.value.trim().length <= 500)

function pickStudent(value: PickedStudent) {
  if (saving.value) return
  student.value = value
  pickerOpen.value = false
}
function close(value: boolean) {
  if (!saving.value) emit('update:modelValue', value)
}
watch(() => props.modelValue, (open) => {
  if (!open) return
  student.value = null
  name.value = ''
  amount.value = undefined
  billingDate.value = todayTaipeiISO()
  dueDate.value = ''
  notes.value = ''
  pickerOpen.value = false
})
async function submit() {
  if (saving.value || !valid.value || !student.value || amount.value == null) return
  saving.value = true
  try {
    const { data } = await createManualFeeRecord({
      student_id: student.value.id,
      fee_item_name: name.value.trim(),
      amount_due: amount.value,
      billing_start_date: billingDate.value,
      due_date: dueDate.value || null,
      notes: notes.value.trim() || null,
    })
    ElMessage.success(`已新增 ${student.value.name} 的${name.value.trim()}，列為待收費用`)
    emit('created', data)
    emit('update:modelValue', false)
  } catch (error) {
    ElMessage.error(friendlyError('新增費用失敗，請稍後重試', error))
  } finally {
    saving.value = false
  }
}
</script>
<style scoped>
.manual-fee-hint { color: var(--color-text-secondary); margin: 0 0 var(--space-4); line-height: 1.6; }
.manual-fee-student { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
</style>
