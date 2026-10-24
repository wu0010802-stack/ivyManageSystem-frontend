<template>
  <FormDialog
    :model-value="modelValue"
    title="逐日確認當日班別"
    size="wide"
    :loading="submitting"
    :disabled="!canSubmit"
    :submit-text="phase === 'done' ? '已送出' : '確認並重算'"
    :enter-submit="false"
    data-test="batch-confirm-dialog"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @submit="submit"
  >
    <p class="batch-confirm__lead">
      以下 {{ units.length }} 個人日已有打卡，改班須逐日確認並重算出勤。先看試算結果，確認無誤再送出。
    </p>
    <p v-if="previewing" role="status">正在試算…</p>
    <el-alert v-if="previewError" type="error" :closable="false" :title="previewError" />
    <el-table v-if="rows.length" :data="rows" size="small" data-test="batch-confirm-table">
      <el-table-column label="日期" prop="date" width="110" />
      <el-table-column label="人員" prop="names" min-width="110" />
      <el-table-column label="改為" prop="target" min-width="100" />
      <el-table-column label="目前" prop="before" min-width="150" />
      <el-table-column label="確認後" prop="after" min-width="150" />
      <el-table-column label="結果" min-width="170">
        <template #default="{ row }">
          <el-tag :type="row.tone" size="small" data-test="batch-confirm-outcome">{{ row.outcome }}</el-tag>
          <span v-if="row.message" class="batch-confirm__message">{{ row.message }}</span>
        </template>
      </el-table-column>
    </el-table>
    <el-form label-position="top" @submit.prevent>
      <el-form-item label="確認原因" required>
        <el-input
          v-model="reason"
          type="textarea"
          :rows="2"
          :maxlength="500"
          :disabled="phase === 'done'"
          placeholder="例如：依實際打卡與老師說明改為晚車"
          data-test="batch-confirm-reason"
        />
      </el-form-item>
    </el-form>
  </FormDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import FormDialog from '@/components/common/FormDialog.vue'
import { confirmReconciliationShiftBatch } from '@/api/attendanceReconciliation'
import type { ApiResponse } from '@/api/_generated/typed'
import { apiError } from '@/utils/error'
import { RECON_STATUS_LABELS, chunk, type BatchUnit } from '@/utils/scheduleAttendanceGrid'

type BatchResult = ApiResponse<'/attendance/reconciliation/confirm-shift-batch', 'post'>['results'][number]
type BatchState = BatchResult['before'][number]

/** 後端每批上限（ConfirmShiftBatchIn.units max_length）；超過由前端分批，預覽與送出用同一分批。 */
const BATCH_SIZE = 100
const PREVIEW_REASON = '試算預覽'

const CODE_LABELS: Record<NonNullable<BatchResult['code']>, string> = {
  VERSION_MISMATCH: '資料已更新，請重新整理',
  FINALIZED: '薪資已封存',
  SELF: '本人不可自行確認',
  USE_PTO: '已用特休抵銷',
  LEAVE_CONFLICT: '請假需個別核查',
  INVALID: '無法確認',
}

const props = defineProps<{
  modelValue: boolean
  units: BatchUnit[]
  employeeNames: Record<number, string>
  shiftNames: Record<number, string>
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  done: [applied: number]
}>()

const reason = ref('')
const previewing = ref(false)
const previewError = ref('')
const submitting = ref(false)
const phase = ref<'preview' | 'done'>('preview')
const results = ref<Map<number, BatchResult>>(new Map())
let previewSeq = 0

interface BatchAccumulator {
  applied: number
  results: Map<number, BatchResult>
  completedBatches: number
}

/** 每批回來即寫入累加器，中途失敗時呼叫端仍拿得到已完成批次的結果。 */
async function runBatches(dryRun: boolean, text: string, acc: BatchAccumulator): Promise<void> {
  let offset = 0
  for (const part of chunk(props.units, BATCH_SIZE)) {
    const res = await confirmReconciliationShiftBatch({ units: part, reason: text, dry_run: dryRun })
    acc.applied += res.data.applied_count
    for (const result of res.data.results) acc.results.set(offset + result.unit_index, result)
    acc.completedBatches += 1
    offset += part.length
  }
}

function newAccumulator(): BatchAccumulator {
  return { applied: 0, results: new Map<number, BatchResult>(), completedBatches: 0 }
}

async function runPreview(): Promise<void> {
  const seq = ++previewSeq
  previewing.value = true
  previewError.value = ''
  results.value = new Map()
  try {
    const acc = newAccumulator()
    await runBatches(true, PREVIEW_REASON, acc)
    if (seq === previewSeq) results.value = acc.results
  } catch (err) {
    if (seq === previewSeq) previewError.value = apiError(err, '試算失敗，請稍後再試')
  } finally {
    if (seq === previewSeq) previewing.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    reason.value = ''
    phase.value = 'preview'
    void runPreview()
  },
  { immediate: true },
)

const canSubmit = computed(
  () =>
    phase.value === 'preview' &&
    !previewing.value &&
    reason.value.trim().length > 0 &&
    [...results.value.values()].some((r) => r.outcome === 'ok'),
)

function describe(states: BatchState[]): string {
  if (!states.length) return '—'
  return states
    .map((s) => {
      const parts = [s.status ? RECON_STATUS_LABELS[s.status] : '不在職']
      if (s.late_minutes) parts.push(`遲到 ${s.late_minutes} 分`)
      if (s.early_leave_minutes) parts.push(`早退 ${s.early_leave_minutes} 分`)
      return parts.join('・')
    })
    .join('；')
}

const rows = computed(() =>
  props.units.map((unit, index) => {
    const result = results.value.get(index)
    const first = unit.items[0]
    const outcome = !result
      ? '試算中'
      : result.outcome === 'ok'
        ? phase.value === 'done' ? '已套用' : '可套用'
        : result.outcome === 'skipped'
          ? '已略過'
          : CODE_LABELS[result.code ?? 'INVALID']
    return {
      date: first.date,
      names: unit.items.map((item) => props.employeeNames[item.employee_id] ?? `#${item.employee_id}`).join('、'),
      target: first.day_off ? '排休' : props.shiftNames[first.shift_type_id ?? 0] ?? '—',
      before: result ? describe(result.before) : '—',
      after: result ? describe(result.after) : '—',
      outcome,
      tone: !result ? 'info' : result.outcome === 'ok' ? 'success' : 'warning',
      message: result && result.outcome !== 'ok' ? result.message ?? '' : '',
    }
  }),
)

async function submit(): Promise<void> {
  if (!canSubmit.value) return
  submitting.value = true
  const acc = newAccumulator()
  try {
    await runBatches(false, reason.value.trim(), acc)
    results.value = acc.results
    phase.value = 'done'
    emit('done', acc.applied)
    const failed = props.units.length - acc.applied
    if (failed === 0) {
      ElMessage.success(`已確認 ${acc.applied} 個人日並重算出勤`)
      emit('update:modelValue', false)
    } else {
      ElMessage.warning(`已確認 ${acc.applied} 個人日，${failed} 個未套用，請看結果欄`)
    }
  } catch (err) {
    if (acc.completedBatches > 0) {
      // 已有批次寫入資料庫：保留結果、通知父層刷新，對話框保持開啟，避免重試撞 VERSION_MISMATCH。
      results.value = acc.results
      phase.value = 'done'
      emit('done', acc.applied)
      ElMessage.warning(
        `已確認 ${acc.applied} 個人日；之後的批次因錯誤未送出（${apiError(err, '確認失敗')}），請重新整理後再確認其餘人日`,
      )
    } else {
      ElMessage.error(apiError(err, '確認失敗，請稍後再試'))
    }
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.batch-confirm__lead { margin: 0 0 var(--space-3); color: var(--el-text-color-regular); }
.batch-confirm__message { margin-left: var(--space-2); color: var(--el-text-color-secondary); font-size: var(--text-sm); }
</style>
