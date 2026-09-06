<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useAttendanceReconciliation } from '@/composables/useAttendanceReconciliation'
import type { ApiResponse } from '@/api/_generated/typed'
import { hasPermission } from '@/utils/auth'
import { dateToLocalISO, formatDateTimeTW, todayTaipeiISO } from '@/utils/format'
import { FORM_DIALOG_WIDTH } from '@/constants/formDialog'

type Row = ApiResponse<'/attendance/reconciliation/preview', 'post'>['rows'][number]
const props = defineProps<{ year: number; month: number; revision: number }>()
const emit = defineEmits<{ confirmed: []; records: [row: Row]; import: [row: Row] }>()
const { data, loading, saving, error, preview, confirm, reset } = useAttendanceReconciliation()
const start = ref('')
const end = ref('')
const complete = ref(false)
const filter = ref('exceptions')
const search = ref('')
const selected = ref<Row | null>(null)
const selectedShift = ref<number | null>(null)
const includePair = ref(false)
const reason = ref('')
const canWrite = computed(() => hasPermission('ATTENDANCE_WRITE') && hasPermission('SCHEDULE'))
const today = computed(() => todayTaipeiISO())
const completeAllowed = computed(() => !!start.value && !!end.value && end.value < today.value && start.value <= end.value)
const labels: Record<Row['status'], string> = {
  matched: '符合原班表', possible_shift_change: '疑似換班', missing_punch: '缺卡待確認',
  suspected_absence: '疑似缺勤', data_incomplete: '資料待補', leave: '已核准請假',
  off_day: '非應出勤日', unscheduled_attendance: '非原排班出勤', anomaly: '出勤異常',
}
const rows = computed(() => (data.value?.rows ?? []).filter(row => {
  const statusMatch = filter.value === 'all' || (filter.value === 'exceptions'
    ? !['matched', 'leave', 'off_day'].includes(row.status) : row.status === filter.value)
  const term = search.value.trim()
  return statusMatch && (!term || row.employee_name.includes(term) || row.employee_number.includes(term))
}))
const unresolvedCount = computed(() => (data.value?.rows ?? []).filter(row => !['matched', 'leave', 'off_day'].includes(row.status)).length)
const pair = computed(() => {
  const row = selected.value
  if (!row || row.original_shift_type_id === null || selectedShift.value === null || selectedShift.value === 0) return null
  const matches = (data.value?.rows ?? []).filter(other => other.date === row.date && other.employee_id !== row.employee_id
    && other.status === 'possible_shift_change' && other.original_shift_type_id === selectedShift.value
    && other.candidates.some(candidate => candidate.shift_type_id === row.original_shift_type_id))
  return matches.length === 1 ? matches[0] : null
})
const dialogOpen = computed({ get: () => selected.value !== null, set: (value: boolean) => { if (!value && !saving.value) selected.value = null } })

function resetRange() {
  const first = new Date(props.year, props.month - 1, 1)
  const last = new Date(props.year, props.month, 0)
  const yesterday = new Date(`${todayTaipeiISO()}T12:00:00+08:00`)
  yesterday.setDate(yesterday.getDate() - 1)
  start.value = dateToLocalISO(first)
  end.value = dateToLocalISO(last < yesterday ? last : yesterday < first ? first : yesterday)
  complete.value = false
  selected.value = null
  reset()
}
watch(() => [props.year, props.month, props.revision], () => { resetRange(); void runPreview() }, { immediate: true })
watch([start, end], () => { complete.value = false; selected.value = null; reset() }, { flush: 'sync' })
watch(complete, () => { selected.value = null; reset() }, { flush: 'sync' })
watch(selectedShift, () => { includePair.value = false })

async function runPreview() {
  if (!start.value || !end.value || start.value > end.value) return
  await preview({ start_date: start.value, end_date: end.value,
    ...(complete.value && completeAllowed.value ? { complete_start_date: start.value, complete_end_date: end.value } : {}),
  })
}
function openConfirm(row: Row) {
  selected.value = row
  selectedShift.value = row.candidates.length === 1 ? row.candidates[0].shift_type_id : row.original_shift_type_id
  includePair.value = false
  reason.value = ''
}
async function saveShift() {
  const row = selected.value
  if (!row || selectedShift.value === null || !reason.value.trim() || !canWrite.value || saving.value) return
  const items = [{ employee_id: row.employee_id, date: row.date, shift_type_id: selectedShift.value === 0 ? null : selectedShift.value,
    day_off: selectedShift.value === 0, version: row.version }]
  if (includePair.value && pair.value && row.original_shift_type_id !== null) {
    items.push({ employee_id: pair.value.employee_id, date: pair.value.date,
      shift_type_id: row.original_shift_type_id, day_off: false, version: pair.value.version })
  }
  const success = await confirm({ items, reason: reason.value.trim() })
  selected.value = null
  if (success) {
    ElMessage.success('已更新當日班別並重新計算出勤')
    emit('confirmed')
    await runPreview()
  }
}
</script>

<template>
  <section class="reconciliation" aria-label="班表與打卡核對">
    <p class="reconciliation__intro">依應出勤名單比對已匯入的打卡。班別不符時先提出建議，確認後才更新當日班表。</p>
    <div class="reconciliation__controls">
      <label>起日<input v-model="start" type="date" :disabled="saving" aria-label="核對起日" /></label>
      <label>迄日<input v-model="end" type="date" :disabled="saving" aria-label="核對迄日" /></label>
      <el-button type="primary" :loading="loading" :disabled="saving || !start || !end || start > end" @click="runPreview">重新核對</el-button>
    </div>
    <label class="reconciliation__complete">
      <input v-model="complete" type="checkbox" :disabled="!completeAllowed || saving" />
      我已完整匯入上述期間所有員工、所有打卡來源的紀錄
    </label>
    <p class="reconciliation__hint">一次最多核對 31 天。完整性確認只適用本次範圍；換日期或再次匯入後需重新確認。當日尚未結束，不判定整日缺勤。</p>
    <p v-if="!complete" class="reconciliation__hint">尚未確認資料完整：沒有打卡者會列為「資料待補」。</p>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <div v-if="data" class="reconciliation__filters">
      <p role="status">共 {{ data.rows.length }} 筆人日，{{ unresolvedCount }} 筆待核對</p>
      <label>顯示<select v-model="filter" aria-label="核對狀態"><option value="exceptions">待核對</option><option value="all">全部</option><option v-for="(label, status) in labels" :key="status" :value="status">{{ label }}</option></select></label>
      <label>人員<input v-model="search" type="search" aria-label="搜尋核對人員" placeholder="姓名或工號" /></label>
    </div>
    <p v-if="loading" role="status">正在核對班表與打卡…</p>
    <p v-else-if="!data && !error" role="status">範圍或完整性設定已變更，請按「重新核對」。</p>
    <el-empty v-else-if="data && !rows.length" :description="data.rows.length ? '此篩選下沒有待核對項目' : '此期間沒有可核對的員工資料'" />
    <div v-else class="reconciliation__list">
      <article v-for="row in rows" :key="`${row.employee_id}:${row.date}`" class="reconciliation__row">
        <header><strong>{{ row.employee_name }}</strong><span>{{ row.employee_number }} · {{ row.date }}</span><el-tag :type="['matched', 'leave', 'off_day'].includes(row.status) ? 'info' : 'warning'">{{ labels[row.status] }}</el-tag></header>
        <dl>
          <div><dt>原班表</dt><dd>{{ row.day_off ? '非應出勤日' : `${row.expected_start}–${row.expected_end}` }}</dd></div>
          <div><dt>上班打卡</dt><dd>{{ row.punch_in ? formatDateTimeTW(row.punch_in) : '無紀錄' }}</dd></div>
          <div><dt>下班打卡</dt><dd>{{ row.punch_out ? formatDateTimeTW(row.punch_out) : '無紀錄' }}</dd></div>
          <div><dt>可能班別</dt><dd>{{ row.candidates.length ? row.candidates.map(c => `${c.name} ${c.work_start}–${c.work_end}`).join('、') : '無明確建議' }}</dd></div>
        </dl>
        <div class="reconciliation__reason"><p>{{ row.reason }}</p><el-button v-if="canWrite" :disabled="saving || loading" @click="openConfirm(row)">確認當日班別</el-button></div>
        <el-button v-if="['missing_punch', 'anomaly', 'suspected_absence'].includes(row.status)" text @click="emit('records', row)">查看出勤明細</el-button>
        <el-button v-if="canWrite && !row.punch_in && !row.punch_out" text @click="emit('import', row)">補匯入當日紀錄</el-button>
      </article>
    </div>
    <el-dialog v-model="dialogOpen" title="確認當日班別" :width="FORM_DIALOG_WIDTH.compact" :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving">
      <template v-if="selected">
        <p>{{ selected.employee_name }} · {{ selected.date }}</p>
        <p>打卡：{{ selected.punch_in ? formatDateTimeTW(selected.punch_in) : '無上班卡' }} ／ {{ selected.punch_out ? formatDateTimeTW(selected.punch_out) : '無下班卡' }}</p>
        <el-form label-position="top">
          <el-form-item label="實際班別" required>
            <el-select v-model="selectedShift" aria-label="實際班別" :disabled="saving" placeholder="請確認班別">
              <el-option v-for="shift in data?.shift_types ?? []" :key="shift.shift_type_id" :value="shift.shift_type_id" :label="`${shift.name} ${shift.work_start}–${shift.work_end}`" />
              <el-option :value="0" label="當日排休" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="pair" label="可能的同日換班對象">
            <el-checkbox v-model="includePair" :disabled="saving">一併確認 {{ pair.employee_name }} 改上原班別（{{ selected.expected_start }}–{{ selected.expected_end }}）</el-checkbox>
          </el-form-item>
          <el-form-item label="確認原因" required><el-input v-model="reason" type="textarea" :maxlength="500" :disabled="saving" aria-label="確認原因" placeholder="例如：已與當事人確認今日互換早晚班" /></el-form-item>
        </el-form>
        <p class="reconciliation__hint">只調整當日班表並重新計算出勤；保留原始打卡與異動紀錄。缺勤、漏卡或跨日調休仍須查證。</p>
      </template>
      <template #footer><el-button :disabled="saving" @click="selected = null">取消</el-button><el-button type="primary" :loading="saving" :disabled="selectedShift === null || !reason.trim() || !canWrite" @click="saveShift">確認並重算</el-button></template>
    </el-dialog>
  </section>
</template>

<style scoped>
.reconciliation { display: grid; gap: var(--space-3); }
.reconciliation__intro { margin: 0; color: var(--el-text-color-primary); }
.reconciliation__controls, .reconciliation__filters { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: end; }
.reconciliation__controls label, .reconciliation__filters label { display: grid; gap: var(--space-1); }
.reconciliation input:not([type='checkbox']), .reconciliation select { min-height: var(--touch-target-min); border: 1px solid var(--el-border-color); border-radius: var(--radius-sm); padding: var(--space-2); background: var(--el-bg-color); color: var(--el-text-color-primary); font: inherit; }
.reconciliation input:focus-visible, .reconciliation select:focus-visible { outline: 2px solid var(--el-color-primary); }
.reconciliation__complete { display: flex; align-items: center; gap: var(--space-2); min-height: var(--touch-target-min); }
.reconciliation__hint { color: var(--el-text-color-secondary); font-size: var(--font-size-sm); margin: 0; }
.reconciliation__row { border: 1px solid var(--el-border-color-light); border-radius: var(--radius-md); padding: var(--space-4); margin-bottom: var(--space-3); background: var(--el-bg-color); }
.reconciliation__row header { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
.reconciliation__row header span { color: var(--el-text-color-secondary); }
.reconciliation__row dl { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); }
.reconciliation__row dt { font-size: var(--font-size-sm); color: var(--el-text-color-secondary); }
.reconciliation__row dd { margin: var(--space-1) 0 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.reconciliation__reason { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-2); }
.reconciliation__reason p { margin: 0; }
@media (--to-sm) { .reconciliation__row dl { grid-template-columns: repeat(2, minmax(0, 1fr)); } .reconciliation__controls label { flex: 1; min-width: 140px; } }
</style>
