<template>
  <el-dialog :model-value="modelValue" :title="title" width="560px" append-to-body @update:model-value="(v: boolean) => emit('update:modelValue', v)">
    <p v-if="loading" role="status">正在讀取這一週的出勤…</p>
    <p v-else-if="loadError" class="rfu__error" role="alert">{{ loadError }}</p>
    <template v-else-if="grid">
      <section class="rfu__section" data-test="rfu-daily">
        <h4>未打卡的日子：改為每日調整（{{ split.daily.length }} 天）</h4>
        <p v-if="split.daily.length" class="rfu__dates">{{ split.daily.map(formatMonthDay).join('、') }} 改上 {{ targetName }}</p>
        <p v-else class="rfu__hint">沒有可改的未打卡日。</p>
        <el-button :loading="savingDaily" :disabled="!split.daily.length || target == null" data-test="rfu-daily-submit" @click="submitDaily">送出每日調整</el-button>
      </section>
      <section class="rfu__section" data-test="rfu-confirm">
        <h4>已打卡的日子：逐日確認（{{ split.confirm.length }} 天）</h4>
        <p v-if="split.confirm.length" class="rfu__dates">{{ split.confirm.map(formatMonthDay).join('、') }} 確認為 {{ targetName }}</p>
        <p v-else class="rfu__hint">沒有需要確認的已打卡日。</p>
        <p v-if="!canConfirm && split.confirm.length" class="rfu__hint" data-test="rfu-confirm-denied">
          確認已打卡的日子需要出勤寫入權限，請交給有權限的行政人員處理。
        </p>
        <el-button :disabled="!canConfirm || !units.length" data-test="rfu-confirm-open" @click="openBatch">開啟批次確認</el-button>
      </section>
      <p v-if="split.kept.length" class="rfu__hint" data-test="rfu-kept">
        已有個別調整，不更動：{{ split.kept.map((k) => `${formatMonthDay(k.date)}（${k.label}）`).join('、') }}。
        週排班本來就不會蓋過每日調整、換班和排休。
      </p>
      <p v-if="split.blocked.length" class="rfu__hint" data-test="rfu-blocked">
        {{ split.blocked.map(formatMonthDay).join('、') }} 無法在這裡處理（本人出勤、已封存或不在職）。
      </p>
    </template>
    <template #footer>
      <el-button data-test="rfu-close" @click="emit('update:modelValue', false)">關閉</el-button>
    </template>
  </el-dialog>
  <!-- append-to-body：本元件巢狀在套用對話框的 overlay（自成 stacking context）裡，批次確認不 teleport 會被蓋住 -->
  <BatchConfirmDialog v-model="batchOpen" :append-to-body="true" :units="batchUnits" :employee-names="employeeNames" :shift-names="shiftNames" @done="onBatchDone" />
</template>

<script setup lang="ts">
/**
 * 輪值表套用時「該週已有打卡」而整週略過的員工週，逐日補做（SPEC-027 §4 C 期、D-08）：
 * 未打卡的日子送每日調整（POST /shifts/daily，SCHEDULE）；已打卡的日子組成批次確認
 * （confirm-shift-batch，另需 ATTENDANCE_WRITE）。日子以當下的格子為準（recorded_dates 只是套用當時的快照）。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import BatchConfirmDialog from '@/components/schedule-attendance/BatchConfirmDialog.vue'
import { getScheduleAttendanceGrid } from '@/api/scheduleAttendance'
import { saveDaily } from '@/api/shifts'
import { formatMonthDay } from '@/utils/attendanceConfirm'
import { apiError } from '@/utils/error'
import type { ApplyChange } from '@/utils/dutyRotationGrid'
import { SOURCE_TAGS, addDaysISO, cellKey, confirmUnits, indexCells, isRecordedConflict, type BatchUnit, type GridOut, type PlanSource } from '@/utils/scheduleAttendanceGrid'

const props = defineProps<{
  modelValue: boolean
  change: ApplyChange | null
  shiftNames: Record<number, string>
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; changed: [] }>()

const grid = ref<GridOut | null>(null)
const loading = ref(false)
const loadError = ref('')
const savingDaily = ref(false)
const batchOpen = ref(false)
/** 開啟批次確認當下的 units 快照（與 ScheduleGridPanel 同模式）：部分失敗時對話框保持開啟、我們隨即重讀格子，live 的 units 會縮短，結果列以索引對 results 會錯位 */
const batchUnits = ref<BatchUnit[]>([])
const BLOCKING_LOCKS: ReadonlySet<string> = new Set(['self', 'finalized', 'not_employed'])
/** 日層級的個別調整：週排班層（含輪值表套用）本來就不會蓋過它們，後續處理也不更動（裁定：補做輪值表本來會做的事） */
const KEPT_SOURCES: ReadonlySet<PlanSource> = new Set<PlanSource>(['daily', 'swap', 'daily_off'])

const target = computed(() => props.change?.to_shift_type_id ?? null)
const targetName = computed(() => (target.value != null ? props.shiftNames[target.value] ?? `#${target.value}` : ''))
const title = computed(() => (props.change ? `後續處理：${props.change.employee_name}（${formatMonthDay(props.change.week_start_date)} 那週）` : '後續處理'))
const employeeNames = computed<Record<number, string>>(() => (props.change ? { [props.change.employee_id]: props.change.employee_name } : {}))
const canConfirm = computed(() => grid.value?.caller.can_confirm ?? false)
const cells = computed(() => indexCells(grid.value?.cells ?? []))

/**
 * 該週工作日依可做的動作分四類（判斷與週格子整週拆分同源：edit.recorded／edit.plan／locked_reason）。
 * 優先序：無法處理（本人／已封存／不在職）→ 已有個別調整（不更動）→ 已打卡（逐日確認）→ 可改（每日調整）。
 */
const split = computed(() => {
  const out = { daily: [] as string[], confirm: [] as string[], blocked: [] as string[], kept: [] as Array<{ date: string; label: string }> }
  const g = grid.value
  const c = props.change
  if (!g || !c) return out
  for (const d of g.days) {
    if (!d.is_workday) continue
    const cell = cells.value.get(cellKey(c.employee_id, d.date))
    if (!cell || !cell.employed) continue
    const lock = cell.edit.locked_reason
    if (lock && BLOCKING_LOCKS.has(lock)) out.blocked.push(d.date)
    else if (KEPT_SOURCES.has(cell.plan.source)) out.kept.push({ date: d.date, label: SOURCE_TAGS[cell.plan.source].label })
    else if (cell.edit.recorded) out.confirm.push(d.date)
    else if (cell.edit.plan) out.daily.push(d.date)
    else out.blocked.push(d.date)
  }
  return out
})
// 輪值表這週沒指定班別（target 為 null）時不組 units：confirmUnits 會把 null 當成「排休」
const units = computed(() =>
  props.change && canConfirm.value && target.value != null
    ? confirmUnits(cells.value, props.change.employee_id, split.value.confirm, target.value)
    : [],
)

// 只有最新一次讀取可寫入畫面：送出每日調整後的重讀與重新開啟的讀取若重疊，先送出但後回來的舊回應一律忽略
let loadSeq = 0
async function load(): Promise<void> {
  const c = props.change
  if (!c) return
  loadSeq += 1
  const mySeq = loadSeq
  loading.value = true
  loadError.value = ''
  try {
    const res = await getScheduleAttendanceGrid({ start_date: c.week_start_date, end_date: addDaysISO(c.week_start_date, 6) })
    if (mySeq !== loadSeq) return
    grid.value = res.data
  } catch (err) {
    if (mySeq !== loadSeq) return
    grid.value = null
    loadError.value = apiError(err, '讀取這一週的出勤失敗')
  } finally {
    if (mySeq === loadSeq) loading.value = false
  }
}
watch(() => [props.modelValue, props.change] as const, ([open]) => { if (open) void load() }, { immediate: true })

/** 逐日送；某天剛好被打卡（409）不中斷其他日子，改提示用逐日確認（SPEC-027 §4:143 不顯示原始錯誤） */
async function submitDaily(): Promise<void> {
  const c = props.change
  const shiftTypeId = target.value
  if (!c || shiftTypeId == null) return
  savingDaily.value = true
  let saved = 0
  const nowRecorded: string[] = []
  const errors: string[] = []
  try {
    for (const date of split.value.daily) {
      try {
        await saveDaily({ employee_id: c.employee_id, date, shift_type_id: shiftTypeId, day_off: false })
        saved += 1
      } catch (err) {
        if (isRecordedConflict(err)) nowRecorded.push(date)
        else errors.push(`${formatMonthDay(date)}：${apiError(err, '儲存失敗')}`)
      }
    }
  } finally {
    savingDaily.value = false
  }
  if (saved) ElMessage.success(`已改 ${saved} 天的每日調整`)
  if (nowRecorded.length) ElMessage.warning(`${nowRecorded.map(formatMonthDay).join('、')} 剛有打卡，請改用下方逐日確認`)
  if (errors.length) ElMessage.error(errors.join('；'))
  if (saved) emit('changed')
  await load()
}

function openBatch(): void {
  batchUnits.value = units.value
  batchOpen.value = true
}

async function onBatchDone(): Promise<void> {
  emit('changed')
  await load()
}
</script>

<style scoped>
.rfu__section { display: grid; gap: var(--space-2); justify-items: start; margin-bottom: var(--space-4); }
.rfu__section h4 { margin: 0; }
.rfu__dates { margin: 0; }
.rfu__hint { margin: 0; color: var(--el-text-color-secondary); font-size: var(--text-sm); }
.rfu__error { color: var(--el-color-danger); }
</style>
