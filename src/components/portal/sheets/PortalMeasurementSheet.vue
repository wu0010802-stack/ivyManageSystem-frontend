<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { todayISO } from '@/utils/format'
import { ElMessage } from 'element-plus'
import { createMeasurement } from '@/api/portalMeasurements'
import { apiError } from '@/utils/error'

interface Prefill {
  measured_on?: string
  height_cm?: string | number | null
  weight_kg?: string | number | null
  head_circumference_cm?: string | number | null
  vision_left?: string | number | null
  vision_right?: string | number | null
  [key: string]: unknown
}

interface MeasurementForm {
  measured_on: string
  height_cm: string
  weight_kg: string
  head_circumference_cm: string
  vision_left: string
  vision_right: string
  note: string
  [key: string]: string
}

const props = defineProps<{
  modelValue: boolean
  studentId: number | string
  studentName?: string
  prefill?: Prefill | null
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'done': []
  'next': []
}>()

const today = () => todayISO()

const form = ref<MeasurementForm>({
  measured_on: today(),
  height_cm: '',
  weight_kg: '',
  head_circumference_cm: '',
  vision_left: '',
  vision_right: '',
  note: '',
})
const advancedOpen = ref(false)
const submitting = ref(false)
const recorded = ref(false)

function resetValues({ keepDate = true } = {}) {
  form.value.height_cm = ''
  form.value.weight_kg = ''
  form.value.head_circumference_cm = ''
  form.value.vision_left = ''
  form.value.vision_right = ''
  form.value.note = ''
  if (!keepDate) form.value.measured_on = today()
  recorded.value = false
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      form.value.measured_on = today()
      resetValues({ keepDate: true })
    }
  },
)

const hasAnyValue = computed(() =>
  ['height_cm', 'weight_kg', 'head_circumference_cm', 'vision_left', 'vision_right'].some(
    (k) => form.value[k] !== '' && form.value[k] != null,
  ),
)

const prefillHint = (key: string) => {
  if (!props.prefill) return ''
  const v = props.prefill[key]
  return v != null ? `上次 ${v}` : ''
}

async function submit() {
  if (!hasAnyValue.value || submitting.value) return
  submitting.value = true
  try {
    const payload: Record<string, string> = {
      measured_on: form.value.measured_on,
    }
    for (const k of ['height_cm', 'weight_kg', 'head_circumference_cm', 'vision_left', 'vision_right']) {
      if (form.value[k] !== '' && form.value[k] != null) payload[k] = String(form.value[k])
    }
    if (form.value.note) payload.note = form.value.note
    await createMeasurement(Number(props.studentId), payload)
    recorded.value = true
    emit('done')
    ElMessage.success('已記錄量測')
  } catch (e) {
    ElMessage.error(apiError(e, '記錄失敗，請重試'))
  } finally {
    submitting.value = false
  }
}

function recordAnother() {
  resetValues({ keepDate: true })
  emit('next')
}

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    direction="btt"
    size="80%"
    :show-close="true"
    :title="`記量測 — ${studentName}`"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <div class="measurement-sheet">
      <template v-if="!recorded">
        <div class="row">
          <label>日期</label>
          <input
            type="date"
            aria-label="量測日期"
            data-test="input-date"
            :max="today()"
            v-model="form.measured_on"
          />
        </div>

        <div class="row">
          <label>身高 (cm)</label>
          <input
            type="number"
            step="0.1"
            min="0.01"
            max="200"
            aria-label="身高（公分）"
            data-test="input-height"
            :placeholder="prefillHint('height_cm')"
            v-model="form.height_cm"
          />
        </div>
        <div class="row">
          <label>體重 (kg)</label>
          <input
            type="number"
            step="0.1"
            min="0.01"
            max="100"
            aria-label="體重（公斤）"
            data-test="input-weight"
            :placeholder="prefillHint('weight_kg')"
            v-model="form.weight_kg"
          />
        </div>

        <button class="advanced-toggle" @click="advancedOpen = !advancedOpen">
          {{ advancedOpen ? '▼' : '▶' }} 進階（頭圍、視力）
        </button>
        <div v-if="advancedOpen" class="advanced">
          <div class="row">
            <label>頭圍 (cm)</label>
            <input type="number" step="0.1" aria-label="頭圍（公分）" v-model="form.head_circumference_cm" />
          </div>
          <div class="row">
            <label>視力 左</label>
            <input type="number" step="0.01" min="0.1" max="2" aria-label="視力 左" v-model="form.vision_left" />
          </div>
          <div class="row">
            <label>視力 右</label>
            <input type="number" step="0.01" min="0.1" max="2" aria-label="視力 右" v-model="form.vision_right" />
          </div>
        </div>

        <div class="row">
          <label>備註</label>
          <input type="text" maxlength="200" aria-label="備註" v-model="form.note" />
        </div>

        <div class="actions">
          <button @click="close">取消</button>
          <button
            class="primary"
            data-test="submit-btn"
            :disabled="!hasAnyValue || submitting"
            @click="submit"
          >
            送出
          </button>
        </div>
      </template>

      <template v-else>
        <div class="recorded">
          <div class="ok">✓ 已記錄</div>
          <div class="actions">
            <button data-test="record-another-btn" class="primary" @click="recordAnother">
              再記一個
            </button>
            <button @click="close">完成</button>
          </div>
        </div>
      </template>
    </div>
  </el-drawer>
</template>

<style scoped>
.measurement-sheet {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 16px 16px;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.row label {
  flex: 0 0 80px;
  font-size: 14px;
}
.row input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 6px;
  font-size: 16px;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
}
.advanced-toggle {
  align-self: flex-start;
  background: transparent;
  border: none;
  color: var(--el-color-primary, #409eff);
  cursor: pointer;
  padding: 4px 0;
}
.advanced {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-left: 12px;
  border-left: 2px solid var(--el-border-color-lighter, #ebeef5);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.actions button {
  padding: 10px 18px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color, #dcdfe6);
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
  cursor: pointer;
}
.actions button.primary {
  background: var(--el-color-primary, #409eff);
  color: white;
  border: none;
}
.actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.recorded {
  text-align: center;
  padding: 24px;
}
.recorded .ok {
  font-size: 32px;
  color: var(--el-color-success, #67c23a);
  margin-bottom: 16px;
}
</style>
