<template>
  <div v-if="employeeId === null" class="emp-month-panel__no-employee">請選擇員工</div>
  <div v-else ref="panel" v-loading="loading" class="emp-month-panel">
    <h3>{{ employeeName || '所選員工' }} · {{ year }} 年 {{ month }} 月出勤明細</h3>
    <p v-if="focusDate" role="status">核對日期：{{ focusDate }}<template v-if="!loading && !loadFailed && !rows.some(row => row.date === focusDate)"> · {{ focusDate }} 尚無打卡紀錄或應出勤班表</template></p>
    <div v-if="loadFailed" role="alert">載入出勤紀錄或班表失敗，無法判定缺卡。<el-button @click="load">重新載入</el-button></div>
    <EmptyState v-else-if="!loading && !rows.length" title="本月沒有應出勤日或打卡紀錄" />
    <table v-else-if="!loadFailed" class="month-record-table">
      <caption class="sr-only">{{ employeeName || '所選員工' }} {{ year }} 年 {{ month }} 月出勤</caption>
      <thead><tr><th scope="col">日期</th><th scope="col">應上班時段</th><th scope="col">上班打卡</th><th scope="col">下班打卡</th><th scope="col">狀態／請假</th><th scope="col">操作</th></tr></thead>
      <tbody>
        <tr v-for="row in visibleRows" :key="row.date" class="month-record-row" :class="{ 'month-record-row--anomaly': row.warning }" :data-attendance-date="row.date" :aria-current="row.date === focusDate ? 'date' : undefined" :tabindex="row.date === focusDate ? -1 : undefined">
          <th scope="row" data-label="日期">{{ row.date }}<small>{{ row.weekday }}</small></th>
          <td data-label="應上班時段">{{ row.expectedLabel }}</td>
          <td class="month-record-row__punch-in" data-label="上班打卡">{{ row.record?.punch_in || '—' }}</td>
          <td class="month-record-row__punch-out" data-label="下班打卡">{{ row.record?.punch_out || '—' }}</td>
          <td class="month-record-row__status" data-label="狀態／請假">{{ row.status }}<small v-if="row.leaveLabel">{{ row.leaveLabel }}</small><RawPunchDetails v-if="row.record" :import-metadata="row.record.import_metadata" /></td>
          <td data-label="操作"><el-button v-if="canWrite && row.canSupplement" size="small" :disabled="saving" @click="openSupplement(row)">補打卡</el-button></td>
        </tr>
        <tr v-if="futureRows.length && !showFuture" class="month-future-toggle">
          <td colspan="6">
            <button type="button" class="month-future-toggle__btn" @click="showFuture = true">
              ▸ {{ futureRows[0].date }} 起尚未到班日（{{ futureRows.length }} 天{{ futureLeaveCount ? `，含請假 ${futureLeaveCount} 天` : '' }}）
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <section v-if="editing && canWrite" ref="editForm" class="month-edit" aria-label="補打卡">
      <p>{{ employeeName || '所選員工' }} · {{ editing.date }}</p>
      <label>上班時間<el-time-picker v-model="punchIn" format="HH:mm" value-format="HH:mm" :disabled="saving" aria-label="補上班時間" placeholder="補上班" /></label>
      <label>下班時間<el-time-picker v-model="punchOut" format="HH:mm" value-format="HH:mm" :disabled="saving" aria-label="補下班時間" placeholder="補下班" /></label>
      <el-button :disabled="saving" @click="editing = null">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="saving || !hasNewPunch" @click="saveSupplement">儲存補卡</el-button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getRecords, upsertRecord } from '@/api/attendance'
import { getAttendanceMonthContext } from '@/api/attendanceMonthContext'
import { buildAttendanceMonthRows, taipeiDate } from '@/utils/attendanceMonthRows'
import { hasPermission } from '@/utils/auth'
import { useErrorNotify } from '@/composables/useErrorNotify'
import EmptyState from '@/components/common/EmptyState.vue'
import RawPunchDetails from './RawPunchDetails.vue'
import type { ApiResponse } from '@/api/_generated/typed'

const props = defineProps<{ employeeId: number | null; employeeName?: string; year: number; month: number; focusDate?: string | null }>()
const emit = defineEmits<{ updated: [] }>()
const { notify } = useErrorNotify()
const records = ref<ApiResponse<'/attendance/records', 'get'>>([])
const days = ref<ApiResponse<'/attendance/month-context', 'get'>['days']>([])
const loading = ref(false)
const loadFailed = ref(false)
const panel = ref<HTMLElement | null>(null)
const editForm = ref<HTMLElement | null>(null)
const now = ref(Date.now())
const clockTimer = window.setInterval(() => { now.value = Date.now() }, 60_000)
onUnmounted(() => { window.clearInterval(clockTimer); loadSequence += 1 })
const rows = computed(() => buildAttendanceMonthRows(days.value, records.value, now.value))
// 未來日收合（UI/UX 改版提案 09-10）：整月排到月底的「尚未到班日」預設摺起，展開一次
// 後維持展開；核對日期落在未來時自動視為已展開，確保 focusDate 定位一定找得到目標列。
const todayISO = computed(() => taipeiDate(now.value))
const pastRows = computed(() => rows.value.filter(row => row.date <= todayISO.value))
const futureRows = computed(() => rows.value.filter(row => row.date > todayISO.value))
const futureLeaveCount = computed(() => futureRows.value.filter(row => row.leaveLabel).length)
const showFuture = ref(false)
const visibleRows = computed(() => (
  showFuture.value || (!!props.focusDate && futureRows.value.some(row => row.date === props.focusDate))
) ? rows.value : pastRows.value)
const canWrite = computed(() => hasPermission('ATTENDANCE_WRITE'))
const editing = ref<ReturnType<typeof buildAttendanceMonthRows>[number] | null>(null)
const punchIn = ref<string | null>(null)
const punchOut = ref<string | null>(null)
const saving = ref(false)
let loadSequence = 0
const hasNewPunch = computed(() => !!editing.value && ((!!punchIn.value && punchIn.value !== editing.value.record?.punch_in) || (!!punchOut.value && punchOut.value !== editing.value.record?.punch_out)))

async function load(): Promise<void> {
  const sequence = ++loadSequence
  records.value = []; days.value = []; editing.value = null
  loadFailed.value = false; loading.value = false; showFuture.value = false
  const employeeId = props.employeeId
  if (employeeId === null) return
  loading.value = true
  try {
    const query = { employee_id: employeeId, year: props.year, month: props.month }
    const [recordResult, contextResult] = await Promise.all([getRecords(query), getAttendanceMonthContext(query)])
    if (sequence !== loadSequence) return
    records.value = recordResult.data ?? []
    days.value = contextResult.data.days
    now.value = Date.now()
  } catch (error) {
    if (sequence !== loadSequence) return
    loadFailed.value = true
    notify(error, 'EmployeeMonthPanel.load', null, { prefix: '載入失敗' })
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}
watch([() => props.employeeId, () => props.year, () => props.month], load, { immediate: true })
watch([() => props.focusDate, rows, loading], async () => {
  if (!props.focusDate || loading.value) return
  await nextTick()
  const target = [...(panel.value?.querySelectorAll<HTMLElement>('[data-attendance-date]') ?? [])].find(element => element.dataset.attendanceDate === props.focusDate)
  target?.scrollIntoView?.({ block: 'center' }); target?.focus({ preventScroll: true })
}, { flush: 'post' })
async function openSupplement(row: ReturnType<typeof buildAttendanceMonthRows>[number]): Promise<void> {
  if (!canWrite.value || saving.value || !row.canSupplement) return
  editing.value = row; punchIn.value = row.record?.punch_in ?? null; punchOut.value = row.record?.punch_out ?? null
  await nextTick()
  editForm.value?.scrollIntoView?.({ block: 'center' })
  editForm.value?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
}
async function saveSupplement(): Promise<void> {
  const row = editing.value
  const employeeId = props.employeeId
  if (!row || employeeId === null || saving.value || !canWrite.value || !hasNewPunch.value) return
  const sequence = loadSequence
  const payload = { employee_id: employeeId, date: row.date,
    ...(punchIn.value ? { punch_in: punchIn.value } : {}),
    ...(punchOut.value ? { punch_out: punchOut.value } : {}),
  }
  saving.value = true
  try {
    await upsertRecord(payload)
    emit('updated')
    if (sequence !== loadSequence) return
    ElMessage.success('補打卡成功'); editing.value = null
    await load()
  } catch (error) {
    notify(error, 'EmployeeMonthPanel.upsert', null, { prefix: '補打卡失敗' })
  } finally { saving.value = false }
}
</script>

<style scoped>
.emp-month-panel { display: grid; gap: var(--space-3); min-width: 0; padding: var(--space-3); }
.emp-month-panel h3, .emp-month-panel p { margin: 0; }
.emp-month-panel__no-employee { padding: var(--space-8); color: var(--el-text-color-secondary); }
.month-record-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: var(--text-sm); }
.month-record-table th, .month-record-table td { padding: var(--space-2); text-align: left; vertical-align: top; overflow-wrap: anywhere; border-bottom: 1px solid var(--el-border-color-light); }
.month-record-table thead th { position: sticky; top: 0; z-index: 1; background: var(--el-fill-color-light); font-weight: 600; }
.month-record-table small { display: block; color: var(--el-text-color-secondary); margin-top: var(--space-1); }
.month-record-row--anomaly { background: var(--el-color-warning-light-9); }
.month-future-toggle__btn {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--el-text-color-secondary);
  font: inherit;
  font-size: var(--text-sm);
  padding: var(--space-1) 0;
  cursor: pointer;
}
.month-future-toggle__btn:hover,
.month-future-toggle__btn:focus-visible { color: var(--el-color-primary); }
.month-record-row[aria-current='date'] { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
.month-edit { display: flex; flex-wrap: wrap; align-items: end; gap: var(--space-3); border: 1px solid var(--el-border-color-light); border-radius: var(--radius-md); padding: var(--space-3); }
.month-edit p { width: 100%; }
.month-edit label { display: grid; gap: var(--space-1); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
@media (--to-sm) {
  .month-record-table, .month-record-table tbody, .month-record-table tr { display: block; }
  .month-record-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .month-record-table tr { border: 1px solid var(--el-border-color-light); border-radius: var(--radius-sm); margin-bottom: var(--space-3); padding: var(--space-2); }
  .month-record-table td, .month-record-table tbody th { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: var(--space-2); }
  .month-record-table td::before, .month-record-table tbody th::before { content: attr(data-label); color: var(--el-text-color-secondary); font-weight: normal; }
  .month-edit label { width: 100%; }
}
</style>
