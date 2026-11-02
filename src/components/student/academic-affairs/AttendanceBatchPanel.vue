<script setup lang="ts">
/**
 * 管理端點名編修：單班單日的學生點名表，直接在列上改狀態、只送出有改動的學生。
 *
 * 用在兩處：學生儀表板「每日點名」（AttendanceSection，班級／日期由外層控制）與
 * 學生出席紀錄頁「點名編修」分頁（自帶班級、日期選擇）。
 *
 * 2026-11-02 改版（純邏輯見 utils/rollcallEditor.ts）：
 * - 未點名維持「未點名」，不再預設成出席；批次「未點名的設為出席」只補空白列。
 * - 只送出有改動的學生，不再整班 upsert。
 * - 切換班級／日期或離開頁面時，有未存變更會先詢問；選「返回儲存」會把班級／日期切回來
 *   （透過 update:classroomId／update:date，外層需接 v-model 或對應事件）。
 * - 家長請假（remark＝家長申請#id）的列備註唯讀，避免改掉假單連結。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { apiError } from '@/utils/error'
import { batchSaveAttendance, getDailyAttendance } from '@/api/studentAttendance'
import { domainBus, ATTENDANCE_EVENTS } from '@/utils/domainBus'
import { buildStudentProfileLink } from '@/utils/studentLinks'
import { showAbsenceWarnings } from '@/utils/attendanceWarnings'
import { confirmDiscardChanges, useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'
import {
  ROLLCALL_STATUSES,
  buildBatchEntries,
  fillUnmarked,
  isLeaveStatus,
  isRowDirty,
  markAllAbsent,
  matchesRollcallFilter,
  newlyAbsentCount,
  overriddenLeaveRemark,
  parentLeaveId,
  summarizeRollcall,
  toRollcallRows,
  type RollcallBaseline,
  type RollcallFilter,
  type RollcallRow,
} from '@/utils/rollcallEditor'

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
  出席: 'success',
  遲到: 'warning',
  缺席: 'danger',
  病假: 'info',
  事假: 'info',
}

const props = withDefaults(defineProps<{
  classroomId?: number | string | null
  date: string
  classroomOptions?: Record<string, unknown>[]
  hideClassroomSelect?: boolean
  hideDatePicker?: boolean
  hint?: string
  /** 只顯示這位學生（學生儀表板的「學生（選填）」篩選）；批次動作仍以全班為範圍，故此時隱藏。 */
  studentId?: number | null
}>(), {
  classroomId: null,
  classroomOptions: () => [],
  hideClassroomSelect: false,
  hideDatePicker: false,
  hint: '',
  studentId: null,
})

const emit = defineEmits<{
  'update:classroomId': [v: number | string | null]
  'update:date': [v: string]
  'saved': [payload: { date: string; classroom_id: number | string | null }]
}>()

const localClassroomId = computed({
  get: () => props.classroomId,
  set: (v) => emit('update:classroomId', v),
})
const localDate = computed({
  get: () => props.date,
  set: (v) => emit('update:date', v),
})

const rows = ref<RollcallRow[]>([])
const baseline = ref<Map<number, RollcallBaseline>>(new Map())
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const filter = ref<RollcallFilter>('all')

let fetchEpoch = 0
const loadedContext = ref('')
const contextKey = computed(() => JSON.stringify([localClassroomId.value, localDate.value]))
const hasClassroom = computed(() => {
  const id = Number(localClassroomId.value)
  return !!localClassroomId.value && !Number.isNaN(id)
})

const scopedRows = computed(() =>
  props.studentId ? rows.value.filter(r => r.student_id === props.studentId) : rows.value,
)
const visibleRows = computed(() => scopedRows.value.filter(r => matchesRollcallFilter(r, filter.value)))
const summary = computed(() => summarizeRollcall(scopedRows.value))

const dirtyRows = computed(() => rows.value.filter(r => isRowDirty(r, baseline.value.get(r.student_id))))
const entries = computed(() => buildBatchEntries(rows.value, baseline.value))
const statuslessDirtyCount = computed(() => dirtyRows.value.filter(r => !r.status).length)
const absentNotifyCount = computed(() => newlyAbsentCount(rows.value, baseline.value))
const isDirty = computed(() => dirtyRows.value.length > 0)
/** 學生篩選下看不到、但仍會一起儲存的改動 */
const hiddenDirtyCount = computed(() =>
  props.studentId ? dirtyRows.value.filter(r => r.student_id !== props.studentId).length : 0,
)
const canSave = computed(() =>
  !loading.value && !saving.value && loadedContext.value === contextKey.value && entries.value.length > 0,
)

const progressText = computed(() => {
  const s = summary.value
  if (!s.total) return ''
  if (props.studentId) return s.unmarked ? '這位學生還沒點名' : '這位學生已點名'
  if (s.unmarked === s.total) return `全班 ${s.total} 位都還沒點名`
  if (s.unmarked) return `還有 ${s.unmarked} 位未點名`
  return `全班 ${s.total} 位已完成點名`
})

const filterChips = computed(() => {
  const s = summary.value
  return [
    { key: 'all' as const, label: '全部', count: s.total, tone: 'neutral' },
    { key: 'unmarked' as const, label: '未點名', count: s.unmarked, tone: s.unmarked ? 'attention' : 'neutral' },
    { key: '出席' as const, label: '出席', count: s.present, tone: 'success' },
    { key: '遲到' as const, label: '遲到', count: s.late, tone: 'warning' },
    { key: '缺席' as const, label: '缺席', count: s.absent, tone: 'danger' },
    { key: 'leave' as const, label: '請假', count: s.leave, tone: 'info' },
  ]
})

const fetchDaily = async () => {
  const epoch = ++fetchEpoch
  const requestedContext = contextKey.value
  loadedContext.value = ''
  loadError.value = ''
  rows.value = []
  baseline.value = new Map()
  if (!hasClassroom.value || !localDate.value) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    const res = await getDailyAttendance({
      date: localDate.value,
      classroom_id: Number(localClassroomId.value),
    })
    if (epoch !== fetchEpoch || requestedContext !== contextKey.value) return
    const next = toRollcallRows(res.data.records ?? [])
    rows.value = next.rows
    baseline.value = next.baseline
    loadedContext.value = requestedContext
  } catch (error) {
    if (epoch === fetchEpoch && requestedContext === contextKey.value) {
      loadError.value = apiError(error, '載入點名資料失敗')
    }
  } finally {
    if (epoch === fetchEpoch) loading.value = false
  }
}

const resetEdits = () => {
  for (const r of rows.value) {
    const base = baseline.value.get(r.student_id)
    if (!base) continue
    r.status = base.status
    r.remark = base.remark
  }
}

const handleFillUnmarked = () => {
  const n = fillUnmarked(rows.value)
  if (n) ElMessage.info(`已把 ${n} 位未點名的學生設為出席，記得儲存`)
}

const handleMarkAllAbsent = async () => {
  const targets = rows.value.filter(r => r.status !== '缺席' && r.status !== '病假' && r.status !== '事假').length
  if (!targets) {
    ElMessage.info('沒有可改為缺席的學生（已請假的學生不會更動）')
    return
  }
  try {
    await ElMessageBox.confirm(
      `會把 ${targets} 位學生標為缺席，已請假的學生不變。儲存後系統會以 LINE 通知這些學生的家長。`,
      '全部標為缺席',
      { type: 'warning', confirmButtonText: '標為缺席', confirmButtonClass: 'el-button--danger', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  markAllAbsent(rows.value)
}

/** 自己存檔後發出的 ATTENDANCE_EVENTS.CHANGED 不要再觸發自己重抓（存檔流程會自己重抓）。 */
let emittingOwnChange = false

const saveDaily = async () => {
  if (!canSave.value) return
  const savedContext = contextKey.value
  const epoch = fetchEpoch
  const payloadContext = { date: localDate.value, classroom_id: localClassroomId.value }
  const payloadEntries = entries.value
  saving.value = true
  try {
    const resp = await batchSaveAttendance({ date: payloadContext.date, entries: payloadEntries })
    emittingOwnChange = true
    try {
      domainBus.emit(ATTENDANCE_EVENTS.CHANGED, payloadContext)
    } finally {
      emittingOwnChange = false
    }
    // 資料已寫入：即使使用者在等待中切了班級／日期也要告知；但不對新的上下文發 saved 或重抓
    ElMessage.success(`已儲存 ${payloadEntries.length} 位學生的點名（${payloadContext.date}）`)
    showAbsenceWarnings(resp?.data?.warnings)
    if (epoch !== fetchEpoch || savedContext !== contextKey.value) return
    emit('saved', payloadContext)
    await fetchDaily()
  } catch (error) {
    ElMessage.error(apiError(error, '儲存點名失敗'))
  } finally {
    saving.value = false
  }
}

// 班級／日期切換：有未存變更先問；選「返回儲存」就把外層的班級／日期切回來。
let revertTarget: string | null = null
watch(contextKey, async (next, prev) => {
  if (revertTarget !== null && next === revertTarget) {
    revertTarget = null
    // 詢問期間若又被程式切到別的上下文並載入過，切回來時要重抓，表格才會對得上外層
    if (loadedContext.value !== next) void fetchDaily()
    return
  }
  // 存檔已送出時不問「捨棄」：請求擋不回來，問了反而誤導；存檔結果會照常提示
  if (isDirty.value && !saving.value && prev !== undefined && loadedContext.value === prev) {
    const count = dirtyRows.value.length
    const discard = await confirmDiscardChanges({
      title: '點名還沒儲存',
      message: `有 ${count} 位學生的點名變更還沒儲存，切換班級或日期會捨棄這些變更。`,
      cancelText: '返回儲存',
    })
    if (!discard) {
      const [prevClassroom, prevDate] = JSON.parse(prev) as [number | string | null, string]
      revertTarget = prev
      emit('update:classroomId', prevClassroom)
      emit('update:date', prevDate)
      await nextTick()
      // 外層沒有接回寫事件（切不回去）：只能照新的班級／日期重新載入，舊的編修作廢。
      if (contextKey.value !== prev) {
        revertTarget = null
        void fetchDaily()
      } else if (loadedContext.value !== prev) {
        void fetchDaily()
      }
      return
    }
  }
  filter.value = 'all'
  void fetchDaily()
})

useUnsavedChangesGuard(() => isDirty.value)

const onExternalChange = (payload: { date: unknown; classroom_id: unknown }) => {
  if (emittingOwnChange) return
  if (String(payload?.classroom_id) !== String(localClassroomId.value) || payload?.date !== localDate.value) return
  // 使用者正在改：不要用別處的新資料蓋掉畫面上的編修
  if (isDirty.value || saving.value) return
  void fetchDaily()
}

onMounted(() => {
  domainBus.on(ATTENDANCE_EVENTS.CHANGED, onExternalChange)
  void fetchDaily()
})

onUnmounted(() => {
  fetchEpoch += 1
  domainBus.off(ATTENDANCE_EVENTS.CHANGED, onExternalChange)
})

const rowClassName = ({ row }: { row: RollcallRow }) => {
  const classes: string[] = []
  if (isRowDirty(row, baseline.value.get(row.student_id))) classes.push('is-dirty')
  if (!row.status) classes.push('is-unmarked')
  return classes.join(' ')
}

const baseParentLeaveId = (row: RollcallRow) => parentLeaveId(baseline.value.get(row.student_id)?.remark)

/** 家長假單列：仍是請假就標假單；改成非請假時，顯示儲存後會留下的備註（見 rollcallEditor.overriddenLeaveRemark）。 */
const parentLeaveRemarkLabel = (row: RollcallRow) => {
  const id = baseParentLeaveId(row)
  if (id == null) return ''
  return isLeaveStatus(row.status) ? `家長請假（假單 #${id}）` : overriddenLeaveRemark(id)
}

defineExpose({ fetchDaily, isDirty })
</script>

<template>
  <div class="rollcall-panel">
    <div v-if="!hideClassroomSelect || !hideDatePicker" class="rollcall-context">
      <el-select
        v-if="!hideClassroomSelect"
        v-model="localClassroomId"
        placeholder="選擇班級"
        aria-label="班級"
        class="rollcall-context__classroom"
      >
        <el-option
          v-for="item in classroomOptions"
          :key="item.value as PropertyKey"
          :label="item.label as string"
          :value="(item.value as number | string)"
        />
      </el-select>
      <el-date-picker
        v-if="!hideDatePicker"
        v-model="localDate"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="選擇日期"
        aria-label="點名日期"
        :clearable="false"
        class="rollcall-context__date"
      />
    </div>

    <el-alert
      v-if="loadError"
      type="error"
      show-icon
      :closable="false"
      title="點名資料載入失敗"
      class="rollcall-error"
    >
      <p class="rollcall-error__text">{{ loadError }}。載入成功前請勿視為全班未點名。</p>
      <el-button size="small" type="primary" @click="fetchDaily">重試</el-button>
    </el-alert>

    <p v-else-if="!hasClassroom" class="rollcall-empty">請先選擇班級</p>

    <el-skeleton v-else-if="loading && !rows.length" :rows="6" animated class="rollcall-skeleton" />

    <p v-else-if="!rows.length" class="rollcall-empty">這個班級目前沒有在籍學生</p>

    <template v-else>
      <div class="rollcall-bar">
        <p class="rollcall-progress" :class="{ 'is-pending': summary.unmarked > 0 }" role="status">
          {{ progressText }}
        </p>
        <div class="rollcall-save">
          <span v-if="isDirty" class="rollcall-dirty" role="status">
            已修改 {{ dirtyRows.length }} 位<template v-if="absentNotifyCount">，其中 {{ absentNotifyCount }} 位缺席儲存後會以 LINE 通知家長</template><template v-if="statuslessDirtyCount">；{{ statuslessDirtyCount }} 位只填了備註，要選狀態才會儲存</template><template v-if="hiddenDirtyCount">（含 {{ hiddenDirtyCount }} 位不在目前的學生篩選中）</template>
          </span>
          <el-button v-if="isDirty" :disabled="saving" @click="resetEdits">復原</el-button>
          <el-button
            type="primary"
            :loading="saving"
            :disabled="!canSave"
            data-testid="rollcall-save"
            @click="saveDaily"
          >
            {{ entries.length ? `儲存 ${entries.length} 位` : '儲存' }}
          </el-button>
        </div>
      </div>

      <div class="rollcall-bar rollcall-bar--secondary">
        <div class="rollcall-filters" role="group" aria-label="依點名狀態篩選">
          <button
            v-for="chip in filterChips"
            :key="chip.key"
            type="button"
            class="rollcall-chip"
            :class="[`rollcall-chip--${chip.tone}`, { 'is-active': filter === chip.key }]"
            :aria-pressed="filter === chip.key"
            @click="filter = chip.key"
          >
            {{ chip.label }}<span class="rollcall-chip__count">{{ chip.count }}</span>
          </button>
        </div>
        <div v-if="!studentId" class="rollcall-bulk">
          <el-button :disabled="!summary.unmarked || saving" @click="handleFillUnmarked">
            未點名的設為出席<template v-if="summary.unmarked">（{{ summary.unmarked }}）</template>
          </el-button>
          <el-button text type="danger" :disabled="saving" @click="handleMarkAllAbsent">全部缺席…</el-button>
        </div>
      </div>

      <el-table
        v-loading="loading"
        :data="visibleRows"
        row-key="student_id"
        :row-class-name="rowClassName"
        class="rollcall-table"
        max-height="480"
      >
        <el-table-column prop="student_no" label="學號" width="104" />
        <el-table-column label="姓名" min-width="140">
          <template #default="{ row }">
            <div class="rollcall-name">
              <router-link
                v-if="buildStudentProfileLink(row.student_id, 'records', 'attendance')"
                :to="buildStudentProfileLink(row.student_id, 'records', 'attendance')!"
                class="rollcall-name__link"
              >{{ row.name }}</router-link>
              <span v-else>{{ row.name }}</span>
              <span v-if="!row.status" class="rollcall-name__unmarked">未點名</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="點名狀態" width="292">
          <template #default="{ row }">
            <el-radio-group
              v-model="row.status"
              size="small"
              class="status-seg"
              :disabled="saving"
              :aria-label="`${row.name} 點名狀態`"
            >
              <el-radio-button
                v-for="status in ROLLCALL_STATUSES"
                :key="status"
                :value="status"
                :class="`seg-tone-${STATUS_TONE[status]}`"
              >
                {{ status }}
              </el-radio-button>
            </el-radio-group>
          </template>
        </el-table-column>
        <el-table-column label="備註" min-width="160">
          <template #default="{ row }">
            <span v-if="baseParentLeaveId(row)" class="rollcall-leave-ref">
              {{ parentLeaveRemarkLabel(row) }}
            </span>
            <el-input
              v-else
              v-model="row.remark"
              placeholder="選填"
              size="small"
              clearable
              :disabled="saving"
              :aria-label="`${row.name} 備註`"
            />
          </template>
        </el-table-column>
        <template #empty>
          <span class="rollcall-table__empty">這個篩選下沒有學生</span>
        </template>
      </el-table>

      <p v-if="hint" class="rollcall-hint">{{ hint }}</p>
    </template>
  </div>
</template>

<style scoped>
.rollcall-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.rollcall-context {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.rollcall-context__classroom {
  width: 12rem;
}

.rollcall-context__date {
  width: 11rem;
}

.rollcall-error__text {
  margin: 0 0 var(--space-2);
}

.rollcall-empty {
  margin: 0;
  padding: var(--space-8) 0;
  text-align: center;
  color: var(--text-tertiary);
}

.rollcall-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2) var(--space-3);
}

.rollcall-progress {
  margin: 0;
  font-weight: var(--font-weight-semibold);
  color: var(--color-success-darker);
}

.rollcall-progress.is-pending {
  color: var(--color-warning-darker);
}

.rollcall-save,
.rollcall-bulk {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
}

/* el-button 相鄰預設有 margin-left，改由 gap 負責 */
.rollcall-save :deep(.el-button + .el-button),
.rollcall-bulk :deep(.el-button + .el-button) {
  margin-left: 0;
}

.rollcall-dirty {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.rollcall-filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.rollcall-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-height: 30px;
  padding: 0 var(--space-3);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  background: var(--surface-color);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: background-color var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
}

.rollcall-chip:hover {
  border-color: var(--color-primary);
  color: var(--text-primary);
}

.rollcall-chip:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.rollcall-chip__count {
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.rollcall-chip--attention .rollcall-chip__count { color: var(--color-warning-darker); }
.rollcall-chip--success .rollcall-chip__count { color: var(--color-success-darker); }
.rollcall-chip--warning .rollcall-chip__count { color: var(--color-warning-darker); }
.rollcall-chip--danger .rollcall-chip__count { color: var(--color-danger-darker); }
.rollcall-chip--info .rollcall-chip__count { color: var(--color-info-darker); }

.rollcall-chip.is-active {
  border-color: var(--color-primary);
  background: var(--color-primary-lighter);
  color: var(--text-primary);
}

.rollcall-table {
  width: 100%;
}

.rollcall-table :deep(.is-dirty > td.el-table__cell) {
  background: var(--color-primary-lighter);
}

.rollcall-name {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-1) var(--space-2);
}

.rollcall-name__link {
  color: var(--color-primary);
  text-decoration: none;
}

.rollcall-name__link:hover {
  text-decoration: underline;
}

.rollcall-name__unmarked {
  font-size: var(--text-xs);
  color: var(--color-warning-darker);
}

.rollcall-leave-ref {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.rollcall-table__empty,
.rollcall-hint {
  color: var(--text-tertiary);
  font-size: var(--text-sm);
}

.rollcall-hint {
  margin: 0;
}

/* 狀態鈕選中色隨狀態走（淡底深字，與狀態 tag 同一組 token），一眼分出缺席與請假 */
.status-seg .seg-tone-success {
  --el-radio-button-checked-bg-color: var(--color-success-soft);
  --el-radio-button-checked-text-color: var(--color-success-darker);
  --el-radio-button-checked-border-color: var(--color-success);
}
.status-seg .seg-tone-warning {
  --el-radio-button-checked-bg-color: var(--color-warning-soft);
  --el-radio-button-checked-text-color: var(--color-warning-darker);
  --el-radio-button-checked-border-color: var(--color-warning);
}
.status-seg .seg-tone-danger {
  --el-radio-button-checked-bg-color: var(--color-danger-soft);
  --el-radio-button-checked-text-color: var(--color-danger-darker);
  --el-radio-button-checked-border-color: var(--color-danger);
}
.status-seg .seg-tone-info {
  --el-radio-button-checked-bg-color: var(--color-info-soft);
  --el-radio-button-checked-text-color: var(--color-info-darker);
  --el-radio-button-checked-border-color: var(--color-info);
}
.status-seg :deep(.el-radio-button.is-active .el-radio-button__inner) {
  font-weight: var(--font-weight-bold);
}

@media (pointer: coarse) {
  .status-seg :deep(.el-radio-button__inner),
  .rollcall-chip {
    min-height: var(--touch-target-min);
    display: inline-flex;
    align-items: center;
  }
}

@media (--to-sm) {
  .rollcall-save,
  .rollcall-bulk {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
