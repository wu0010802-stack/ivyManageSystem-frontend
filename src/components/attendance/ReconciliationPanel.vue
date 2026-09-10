<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useAttendanceReconciliation } from '@/composables/useAttendanceReconciliation'
import type { ApiResponse } from '@/api/_generated/typed'
import { hasPermission } from '@/utils/auth'
import { formatDateTimeTW, todayTaipeiISO } from '@/utils/format'
import { reconciliationRanges, reconciliationRangeError } from '@/utils/attendanceReconciliationRange'
import FormDialog from '@/components/common/FormDialog.vue'

type Row = ApiResponse<'/attendance/reconciliation/preview', 'post'>['rows'][number]
const props = defineProps<{ year: number; month: number; revision: number }>()
const emit = defineEmits<{ confirmed: []; records: [row: Row]; import: [row: Row] }>()
const { data, loading, saving, error, preview, confirm, reset } = useAttendanceReconciliation()
const start = ref('')
const end = ref('')
const showCoverageDetail = ref(false)
const filter = ref('exceptions')
const search = ref('')
const expandedEmployees = ref(new Set<number>())
function onGroupToggle(employeeId: number, event: Event): void {
  if ((event.target as HTMLDetailsElement).open) expandedEmployees.value.add(employeeId)
  else expandedEmployees.value.delete(employeeId)
}
const selected = ref<Row | null>(null)
const selectedShift = ref<number | null>(null)
const includePair = ref(false)
const reason = ref('')
const canWrite = computed(() => hasPermission('ATTENDANCE_WRITE') && hasPermission('SCHEDULE'))
const today = computed(() => todayTaipeiISO())
const ranges = computed(() => reconciliationRanges(props.year, props.month, today.value))
const rangeError = computed(() => reconciliationRangeError(start.value, end.value, ranges.value.first, ranges.value.last))
const selectedRange = ref<'today' | 'week' | 'elapsed' | 'custom'>('elapsed')
function chooseRange(key: 'today' | 'week' | 'elapsed' | 'custom'): void {
  selectedRange.value = key
  if (key === 'custom') return
  const range = ranges.value[key]
  if (!range) return
  start.value = range.start
  end.value = range.end
  void runPreview()
}
function onCustomRange(): void { selectedRange.value = 'custom' }

// 系統判定涵蓋（2026-09-10 改版，取代前端手動勾選「我已完整匯入」）：某日視為
// 已涵蓋，只要有匯入批次的日期範圍包含它，或當天有電子打卡台紀錄；後端回應
// 的 coverage.covered_dates 即為此判定結果，前端只負責顯示、不再自行送出
// complete_start_date/complete_end_date。
const totalDays = computed(() => {
  if (!start.value || !end.value) return 0
  const ms = new Date(`${end.value}T00:00:00`).getTime() - new Date(`${start.value}T00:00:00`).getTime()
  return Math.round(ms / 86_400_000) + 1
})
const coveredCount = computed(() => data.value?.coverage.covered_dates.length ?? 0)
const coverageLabel = computed(() => {
  if (!data.value) return ''
  if (coveredCount.value === 0) return '打卡資料尚未涵蓋任何一天'
  if (coveredCount.value >= totalDays.value) return `打卡資料已涵蓋全部 ${totalDays.value} 天`
  return `打卡資料已涵蓋 ${coveredCount.value}／${totalDays.value} 天`
})
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
const incompleteCount = computed(() => (data.value?.rows ?? []).filter(row => row.status === 'data_incomplete').length)
const groups = computed(() => {
  const result: { key: string; incomplete: boolean; rows: Row[] }[] = []
  const byEmployee = new Map<number, Row[]>()
  for (const row of rows.value) {
    if (row.status !== 'data_incomplete') {
      result.push({ key: `${row.employee_id}:${row.date}`, incomplete: false, rows: [row] })
      continue
    }
    let employeeRows = byEmployee.get(row.employee_id)
    if (!employeeRows) {
      employeeRows = []
      byEmployee.set(row.employee_id, employeeRows)
      result.push({ key: `incomplete:${row.employee_id}`, incomplete: true, rows: employeeRows })
    }
    employeeRows.push(row)
  }
  return result
})
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
  expandedEmployees.value.clear()
  const range = ranges.value.elapsed
  start.value = range?.start ?? ranges.value.first
  end.value = range?.end ?? ranges.value.first
  selectedRange.value = range ? 'elapsed' : 'custom'
  showCoverageDetail.value = false
  selected.value = null
  reset()
}
watch(() => [props.year, props.month], () => { resetRange(); void runPreview() }, { immediate: true })
watch(() => props.revision, () => { selected.value = null; reset(); void runPreview() })
watch([start, end], () => { showCoverageDetail.value = false; selected.value = null; reset() }, { flush: 'sync' })
watch(selectedShift, () => { includePair.value = false })

async function runPreview() {
  if (rangeError.value) return
  await preview({ start_date: start.value, end_date: end.value })
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
    <div class="reconciliation__setup">
    <p class="reconciliation__intro">比對班表與打卡，確認差異後再調整當日班別。</p>
    <div class="reconciliation__shortcuts" role="group" aria-label="核對日期快捷">
      <el-button :disabled="!ranges.today || saving" :aria-pressed="selectedRange === 'today'" @click="chooseRange('today')">今日</el-button>
      <el-button :disabled="!ranges.week || saving" :aria-pressed="selectedRange === 'week'" @click="chooseRange('week')">本週迄今</el-button>
      <el-button :disabled="!ranges.elapsed || saving" :aria-pressed="selectedRange === 'elapsed'" @click="chooseRange('elapsed')">{{ ranges.elapsedLabel }}</el-button>
      <el-button :disabled="saving" :aria-pressed="selectedRange === 'custom'" @click="chooseRange('custom')">自訂</el-button>
    </div>
    <p class="reconciliation__hint">快捷範圍限 {{ year }} 年 {{ month }} 月；本週迄今為週一至今天。{{ !ranges.today ? '今日不在所選月份，今日快捷無法使用。' : '' }}{{ !ranges.week ? '本週與所選月份沒有交集。' : '' }}{{ !ranges.elapsed ? '此月份尚無截至昨日的日期，請使用可選的快捷或自訂日期。' : '' }}</p>
    <div class="reconciliation__controls">
      <label>起日<input v-model="start" type="date" :min="ranges.first" :max="ranges.last" @input="onCustomRange" :disabled="saving" aria-label="核對起日" /></label>
      <label>迄日<input v-model="end" type="date" :min="ranges.first" :max="ranges.last" @input="onCustomRange" :disabled="saving" aria-label="核對迄日" /></label>
      <el-button type="primary" :loading="loading" :disabled="saving || !!rangeError" @click="runPreview">重新核對</el-button>
    </div>
    <p v-if="rangeError" role="alert" class="reconciliation__hint">{{ rangeError }}</p>
    <p v-if="data" class="reconciliation__coverage" role="status" :class="{ 'reconciliation__coverage--none': coveredCount === 0 }">
      {{ coverageLabel }}
      <button
        v-if="data.coverage.batches.length"
        type="button"
        class="reconciliation__coverage-toggle"
        :aria-expanded="showCoverageDetail"
        @click="showCoverageDetail = !showCoverageDetail"
      >{{ showCoverageDetail ? '收合明細' : '涵蓋明細' }}</button>
    </p>
    <ul v-if="showCoverageDetail && data" class="reconciliation__coverage-detail">
      <li v-for="(batch, i) in data.coverage.batches" :key="i">
        {{ batch.source === 'excel' ? 'Excel 匯入' : 'CSV 匯入' }}・{{ batch.date_from }} 至 {{ batch.date_to }}・{{ batch.row_count }} 筆・{{ formatDateTimeTW(batch.imported_at) }}{{ batch.imported_by ? `・${batch.imported_by}` : '' }}
      </li>
    </ul>
    <details class="reconciliation__guide">
      <summary>核對範圍與缺勤判讀說明</summary>
      <p class="reconciliation__hint">一次最多核對 31 天。打卡資料是否已涵蓋由系統依匯入批次與電子打卡台紀錄自動判定；已涵蓋且無打卡才會列為疑似缺勤，尚未涵蓋的日子列為資料待補。當日尚未結束，不判定整日缺勤。</p>
    </details>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <div v-if="data" class="reconciliation__filters">
      <p class="reconciliation__count" role="status"><strong>{{ unresolvedCount }} 筆待核對</strong><span>資料待補 {{ incompleteCount }} 筆 · 出勤差異 {{ unresolvedCount - incompleteCount }} 筆</span><span>共 {{ data.rows.length }} 筆人日；符合班表、請假與非應出勤日不列待核對。</span></p>
      <label>顯示<select v-model="filter" aria-label="核對狀態"><option value="exceptions">待核對</option><option value="all">全部</option><option v-for="(label, status) in labels" :key="status" :value="status">{{ label }}</option></select></label>
      <label>人員<input v-model="search" type="search" aria-label="搜尋核對人員" placeholder="姓名或工號" /></label>
    </div>
    <p v-if="loading" role="status">正在核對班表與打卡…</p>
    <p v-else-if="!data && !error" role="status">範圍或完整性設定已變更，請按「重新核對」。</p>
    <div v-else-if="data && !rows.length">
      <el-empty :description="data.rows.length ? '此篩選下沒有待核對項目' : '此期間沒有可核對的員工資料'" />
      <el-button v-if="data.rows.length" @click="search = ''; filter = 'all'">清除篩選</el-button>
    </div>
    <div v-else class="reconciliation__list">
      <div class="reconciliation__column-headings" aria-hidden="true"><span>人員／日期</span><span>原班表</span><span>上班打卡</span><span>下班打卡</span><span>可能班別</span></div>
      <component v-for="group in groups" :is="group.incomplete ? 'details' : 'div'" :key="group.key" :open="group.incomplete && expandedEmployees.has(group.rows[0].employee_id)" @toggle="onGroupToggle(group.rows[0].employee_id, $event)" :data-employee-id="group.incomplete ? group.rows[0].employee_id : undefined" class="reconciliation__group">
      <summary v-if="group.incomplete"><strong>{{ group.rows[0].employee_name }}</strong> · {{ group.rows[0].employee_number }} · {{ group.rows.length }} 天資料待補<span>展開逐日核對與匯入</span></summary>
      <article v-for="row in group.rows" :key="`${row.employee_id}:${row.date}`" class="reconciliation__row">
        <header><strong>{{ row.employee_name }}</strong><span>{{ row.employee_number }} · {{ row.date }}</span><el-tag :type="['matched', 'leave', 'off_day'].includes(row.status) ? 'info' : 'warning'">{{ labels[row.status] }}</el-tag></header>
        <dl>
          <div><dt>原班表</dt><dd>{{ row.day_off ? '非應出勤日' : `${row.expected_start}–${row.expected_end}` }}</dd></div>
          <div><dt>上班打卡</dt><dd>{{ row.punch_in ? formatDateTimeTW(row.punch_in) : '無紀錄' }}</dd></div>
          <div><dt>下班打卡</dt><dd>{{ row.punch_out ? formatDateTimeTW(row.punch_out) : '無紀錄' }}</dd></div>
          <div><dt>可能班別</dt><dd>{{ row.candidates.length ? row.candidates.map(c => `${c.name} ${c.work_start}–${c.work_end}`).join('、') : '無明確建議' }}</dd></div>
        </dl>
        <p class="reconciliation__reason">{{ row.reason }}</p>
        <div class="reconciliation__actions">
        <el-button v-if="canWrite && !row.punch_in && !row.punch_out" :type="row.status === 'data_incomplete' ? 'primary' : 'default'" :disabled="saving || loading" @click="emit('import', row)">匯入打卡</el-button>
        <el-button v-if="canWrite" :disabled="saving || loading" @click="openConfirm(row)">確認當日班別</el-button>
        <el-button v-if="['missing_punch', 'anomaly', 'suspected_absence'].includes(row.status)" text @click="emit('records', row)">查看出勤明細</el-button>
        </div>
      </article>
      </component>
    </div>
    <FormDialog v-model="dialogOpen" title="確認當日班別" size="compact" :enter-submit="false" :loading="saving" :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving">
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
    </FormDialog>
  </section>
</template>

<style scoped>
.reconciliation { --reconciliation-columns: minmax(0, 2fr) repeat(4, minmax(0, 1.5fr)); display: grid; gap: var(--space-4); min-width: 0; }
.reconciliation__setup { display: grid; gap: var(--space-2); padding: var(--space-3) var(--space-4); border: 1px solid var(--el-border-color-light); border-radius: var(--radius-md); background: var(--el-fill-color-light); }
.reconciliation__intro { margin: 0; color: var(--el-text-color-primary); }
.reconciliation__shortcuts { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.reconciliation__shortcuts .el-button { margin-left: 0; }
.reconciliation__shortcuts [aria-pressed="true"] { color: var(--el-color-primary); border-color: var(--el-color-primary); }
.reconciliation__column-headings { display: grid; grid-template-columns: var(--reconciliation-columns); gap: var(--space-4); position: sticky; top: 0; z-index: 2; padding: var(--space-3) var(--space-4); background: var(--el-fill-color-light); border-bottom: 1px solid var(--el-border-color-light); font-size: var(--text-sm); font-weight: 600; }
.reconciliation__controls, .reconciliation__filters { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: end; }
.reconciliation__controls label, .reconciliation__filters label { display: grid; gap: var(--space-1); font-size: var(--text-sm); }
.reconciliation input:not([type='checkbox']), .reconciliation select { min-width: 0; max-width: 100%; min-height: var(--touch-target-min); border: 1px solid var(--el-border-color); border-radius: var(--radius-sm); padding: var(--space-2); background: var(--el-bg-color); color: var(--el-text-color-primary); font: inherit; }
.reconciliation input:focus-visible, .reconciliation select:focus-visible, .reconciliation summary:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
.reconciliation__coverage { display: flex; align-items: center; gap: var(--space-2); min-height: var(--touch-target-min); margin: 0; color: var(--el-color-success); font-size: var(--text-sm); }
.reconciliation__coverage--none { color: var(--el-color-warning); }
.reconciliation__coverage-toggle { appearance: none; border: 0; background: transparent; color: var(--el-color-primary); font: inherit; font-size: var(--text-sm); padding: 0; cursor: pointer; min-height: var(--touch-target-min); }
.reconciliation__coverage-toggle:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
.reconciliation__coverage-detail { margin: 0; padding-left: var(--space-5); color: var(--el-text-color-secondary); font-size: var(--text-sm); display: grid; gap: var(--space-1); }
.reconciliation__hint { color: var(--el-text-color-secondary); font-size: var(--text-sm); margin: 0; }
.reconciliation__guide summary { cursor: pointer; color: var(--el-text-color-regular); font-size: var(--text-sm); padding-block: var(--space-2); }
.reconciliation__count { display: grid; gap: var(--space-1); margin: 0 auto 0 0; align-self: center; }
.reconciliation__count span { color: var(--el-text-color-secondary); font-size: var(--text-sm); }
.reconciliation__list { border: 1px solid var(--el-border-color-light); border-radius: var(--radius-md); background: var(--el-bg-color); }
.reconciliation__group + .reconciliation__group { border-top: 1px solid var(--el-border-color-light); }
.reconciliation__group > summary { cursor: pointer; padding: var(--space-3) var(--space-4); min-height: var(--touch-target-min); }
.reconciliation__group > summary span { margin-left: var(--space-3); font-size: var(--text-sm); color: var(--el-text-color-secondary); }
.reconciliation__row { display: grid; grid-template-columns: var(--reconciliation-columns); gap: var(--space-2) var(--space-4); padding: var(--space-3) var(--space-4); }
.reconciliation__row + .reconciliation__row { border-top: 1px solid var(--el-border-color-light); }
.reconciliation__row:focus-within { background: var(--el-fill-color-light); }
.reconciliation__row header { grid-column: 1; display: flex; flex-wrap: wrap; align-content: start; align-items: center; gap: var(--space-1) var(--space-2); }
.reconciliation__row header > span:not(.el-tag) { flex-basis: 100%; color: var(--el-text-color-secondary); font-size: var(--text-sm); }
.reconciliation__row dl { display: contents; }
.reconciliation__row dl > div { min-width: 0; }
.reconciliation__row dt { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); font-size: var(--text-sm); color: var(--el-text-color-secondary); }
.reconciliation__row dd { margin: var(--space-1) 0 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.reconciliation__reason { grid-column: 1 / 3; margin: 0; color: var(--el-text-color-regular); font-size: var(--text-sm); align-self: center; }
.reconciliation__actions { grid-column: 3 / -1; display: flex; flex-wrap: wrap; gap: var(--space-2); justify-content: flex-end; align-items: center; }
.reconciliation__actions .el-button { margin-left: 0; }
@media (--to-sm) {
  .reconciliation__column-headings { display: none; }
  .reconciliation__row dt { position: static; width: auto; height: auto; overflow: visible; clip-path: none; }
  .reconciliation__setup { padding: var(--space-3); }
  .reconciliation__row { grid-template-columns: minmax(0, 1fr); padding: var(--space-3); gap: var(--space-3); }
  .reconciliation__row > header, .reconciliation__row > dl, .reconciliation__row > .reconciliation__reason, .reconciliation__row > .reconciliation__actions { grid-column: 1 / -1; }
  .reconciliation__row dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); margin: 0; }
  .reconciliation__controls label, .reconciliation__filters label { flex: 1; min-width: 0; }
  .reconciliation__controls > .el-button { width: 100%; min-height: var(--touch-target-min); }
  .reconciliation__count { flex-basis: 100%; }
  .reconciliation__actions { justify-content: flex-start; }
  .reconciliation__actions .el-button, .reconciliation__guide summary { min-height: var(--touch-target-min); }
}
</style>
