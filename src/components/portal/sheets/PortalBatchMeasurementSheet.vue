<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { todayISO } from '@/utils/format'
import { ElMessage } from 'element-plus'
import { getMeasurementsLatest, createMeasurement } from '@/api/portalMeasurements'
import { apiError } from '@/utils/error'

interface MeasurementRow {
  student_id: number | string
  name?: string
  height_cm: string | number
  weight_kg: string | number
  last_measurement?: { measured_on?: string; height_cm?: string | number | null; weight_kg?: string | number | null } | null
  status: 'idle' | 'sending' | 'ok' | 'failed'
  error: string
}

const props = defineProps<{
  modelValue: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'done': []
}>()

const today = () => todayISO()

const measuredOn = ref(today())
const rows = ref<MeasurementRow[]>([])
const loading = ref(false)
const submitting = ref(false)
const progress = ref<{ done: number; total: number }>({ done: 0, total: 0 })

async function load() {
  loading.value = true
  try {
    const { data } = await getMeasurementsLatest()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows.value = data.map((r: any) => ({
      student_id: r.student_id,
      name: r.name,
      height_cm: '',
      weight_kg: '',
      last_measurement: r.last_measurement,
      status: 'idle', // idle | sending | ok | failed
      error: '',
    }))
  } catch (e) {
    ElMessage.error('讀取學生清單失敗')
  } finally {
    loading.value = false
  }
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      measuredOn.value = today()
      load()
    }
  },
  { immediate: true },
)

const filledRows = computed(() =>
  rows.value.filter((r) => r.height_cm !== '' || r.weight_kg !== ''),
)
const canSubmit = computed(() => filledRows.value.length > 0 && !submitting.value)
const failedRows = computed(() => rows.value.filter((r) => r.status === 'failed'))

async function submitRow(row: MeasurementRow) {
  row.status = 'sending'
  row.error = ''
  const payload: Record<string, string> = { measured_on: measuredOn.value }
  if (row.height_cm !== '') payload.height_cm = String(row.height_cm)
  if (row.weight_kg !== '') payload.weight_kg = String(row.weight_kg)
  try {
    await createMeasurement(Number(row.student_id), payload)
    row.status = 'ok'
  } catch (e) {
    row.status = 'failed'
    row.error = apiError(e, '未知錯誤')
  }
}

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  const targets = filledRows.value
  progress.value = { done: 0, total: targets.length }
  try {
    for (const row of targets) {
      await submitRow(row)
      progress.value.done += 1
    }
  } finally {
    submitting.value = false
  }
  const ok = targets.filter((r) => r.status === 'ok').length
  const failed = targets.length - ok
  if (ok > 0) {
    ElMessage.success(`已記 ${ok} 筆${failed ? `，${failed} 筆失敗` : ''}`)
    emit('done')
  } else {
    ElMessage.error(`${failed} 筆全部失敗，請重試或檢查網路`)
  }
}

async function retry() {
  submitting.value = true
  const targets = [...failedRows.value]
  progress.value = { done: 0, total: targets.length }
  try {
    for (const row of targets) {
      await submitRow(row)
      progress.value.done += 1
    }
  } finally {
    submitting.value = false
  }
  const ok = targets.filter((r) => r.status === 'ok').length
  if (ok > 0) emit('done')
}

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    direction="btt"
    size="90%"
    :show-close="true"
    title="全班量體位"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <div class="batch-sheet">
      <div class="header-row">
        <label>量測日期</label>
        <input type="date" :max="today()" v-model="measuredOn" />
      </div>

      <div v-if="loading" class="loading">載入中…</div>

      <div v-else class="table">
        <div class="table-header">
          <span class="col-name">學生</span>
          <span class="col-num">身高 (cm)</span>
          <span class="col-num">體重 (kg)</span>
          <span class="col-status"></span>
        </div>
        <div
          v-for="row in rows"
          :key="row.student_id"
          :class="['table-row', `status-${row.status}`]"
          :data-test="row.status === 'failed' ? `failed-row-${row.student_id}` : undefined"
        >
          <span class="col-name">
            {{ row.name }}
            <small v-if="row.last_measurement" class="hint">
              上次 {{ row.last_measurement.measured_on }} ·
              {{ row.last_measurement.height_cm || '—' }} /
              {{ row.last_measurement.weight_kg || '—' }}
            </small>
          </span>
          <input
            class="col-num"
            type="number"
            step="0.1"
            :data-test="`height-${row.student_id}`"
            v-model="row.height_cm"
            :disabled="submitting"
          />
          <input
            class="col-num"
            type="number"
            step="0.1"
            :data-test="`weight-${row.student_id}`"
            v-model="row.weight_kg"
            :disabled="submitting"
          />
          <span class="col-status">
            <template v-if="row.status === 'sending'">…</template>
            <template v-else-if="row.status === 'ok'">✓</template>
            <template v-else-if="row.status === 'failed'">
              <span class="failed" :title="row.error">✗</span>
            </template>
          </span>
        </div>
      </div>

      <div v-if="submitting" class="progress">
        送出中 {{ progress.done }} / {{ progress.total }}
      </div>

      <div class="actions">
        <button @click="close">關閉</button>
        <button
          v-if="failedRows.length > 0 && !submitting"
          class="warn"
          data-test="retry-btn"
          @click="retry"
        >
          重試失敗 {{ failedRows.length }} 筆
        </button>
        <button
          class="primary"
          data-test="submit-btn"
          :disabled="!canSubmit"
          @click="submit"
        >
          送出 ({{ filledRows.length }} 筆)
        </button>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.batch-sheet {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 16px 16px;
}
.header-row {
  display: flex;
  gap: 12px;
  align-items: center;
}
.table {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.table-header,
.table-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 32px;
  gap: 8px;
  align-items: center;
  padding: 6px 4px;
}
.table-header {
  font-weight: 600;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.col-num {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  font-size: 16px;
}
.col-name {
  display: flex;
  flex-direction: column;
}
.col-name .hint {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.status-failed {
  background: var(--el-color-danger-light-9);
}
.status-failed .failed {
  color: var(--el-color-danger);
  font-weight: 700;
}
.status-ok {
  opacity: 0.6;
}
.progress {
  text-align: center;
  color: var(--el-text-color-secondary);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.actions button {
  padding: 10px 16px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
  cursor: pointer;
}
.actions button.primary {
  background: var(--el-color-primary);
  color: white;
  border: none;
}
.actions button.warn {
  background: var(--el-color-warning);
  color: white;
  border: none;
}
.actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
