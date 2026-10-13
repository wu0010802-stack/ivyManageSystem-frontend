<template>
  <el-drawer
    :model-value="modelValue"
    :title="title"
    :size="mobile ? '100%' : '460px'"
    append-to-body
    data-test="person-day-drawer"
    :before-close="beforeClose"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div v-if="cell && employee" class="pdd">
      <p v-if="otherClasses" class="pdd__note" data-test="pdd-other-classes">另兼：{{ otherClasses }}</p>
      <section class="pdd__section">
        <h3>應上班</h3>
        <p class="pdd__plan" data-test="pdd-plan">{{ planLine }}</p>
        <p v-if="cell.edit.locked_reason === 'finalized'" class="pdd__note">已封存：{{ LOCKED_REASON_LABELS.finalized }}</p>
      </section>

      <section class="pdd__section">
        <h3>來源</h3>
        <ol class="pdd__chain" data-test="pdd-chain">
          <li v-for="layer in chain" :key="layer.key" :class="{ 'pdd__chain-item--active': layer.active }">
            <span class="pdd__chain-label">{{ layer.label }}</span>
            <span>{{ layer.value }}</span>
          </li>
        </ol>
      </section>

      <section class="pdd__section">
        <h3>打卡與判定</h3>
        <p v-if="!caller.can_view_attendance" class="pdd__note">沒有查看打卡紀錄的權限。</p>
        <p v-else-if="!cell.actual" class="pdd__note">{{ cell.date > today ? '尚未到這一天。' : '這天不在核對範圍內。' }}</p>
        <template v-else>
          <dl class="pdd__facts" data-test="pdd-actual">
            <dt>上班</dt><dd>{{ hhmm(cell.actual.punch_in) }}</dd>
            <dt>下班</dt><dd>{{ hhmm(cell.actual.punch_out) }}</dd>
            <dt>判定</dt><dd>{{ verdict }}</dd>
          </dl>
          <p class="pdd__reason">{{ cell.actual.reason }}</p>
          <p v-if="cell.actual.candidates.length" data-test="pdd-candidates">
            系統推測：{{ cell.actual.candidates.map((c) => `${c.name} ${c.work_start}–${c.work_end}`).join('、') }}
            <template v-if="suggestedPair">（疑似和 {{ employeeNames[suggestedPair.employee_id] }} 對調）</template>
          </p>
          <p v-if="cell.confirmation" data-test="pdd-confirmation">
            老師確認：{{ confirmationLabel }}
          </p>
        </template>
      </section>

      <section v-if="cell.edit.plan" class="pdd__section" data-test="pdd-edit-day">
        <h3>改這天</h3>
        <el-select v-model="dayChoice" :aria-label="'改這天的班別'" class="pdd__select" data-test="pdd-day-select">
          <el-option :value="INHERIT" label="繼承週排班" />
          <el-option v-for="s in optionsWith(initialDayChoice)" :key="s.shift_type_id" :value="s.shift_type_id" :disabled="!s.is_active" :label="`${s.name} ${s.work_start}–${s.work_end}${s.is_active ? '' : '（已停用）'}`" />
          <el-option :value="DAY_OFF" label="排休（明確不上班）" />
        </el-select>
        <el-button type="primary" :loading="savingDay" :disabled="dayChoice === initialDayChoice || loadingDaily" data-test="pdd-day-apply" @click="applyDay">套用</el-button>
      </section>

      <section v-if="cell.edit.confirm && cell.actual" class="pdd__section" data-test="pdd-confirm">
        <h3>確認當日班別</h3>
        <el-form label-position="top" @submit.prevent>
          <el-form-item label="實際班別" required>
            <el-select v-model="confirmChoice" class="pdd__select" data-test="pdd-confirm-select">
              <el-option v-for="s in optionsWith(confirmInitial)" :key="s.shift_type_id" :value="s.shift_type_id" :disabled="!s.is_active" :label="`${s.name} ${s.work_start}–${s.work_end}${s.is_active ? '' : '（已停用）'}`" />
              <el-option :value="0" label="當日排休" />
            </el-select>
          </el-form-item>
          <el-checkbox v-if="pair" v-model="includePair" data-test="pdd-pair">
            一併確認 {{ employeeNames[pair.employee_id] }} 改上原班別（{{ shiftName(cell.actual.original_shift_type_id) }}）
          </el-checkbox>
          <el-form-item label="確認原因" required>
            <el-input v-model="confirmReason" type="textarea" :rows="2" :maxlength="500" data-test="pdd-confirm-reason" />
          </el-form-item>
        </el-form>
        <el-button type="primary" :loading="confirming" :disabled="confirmChoice === null || !confirmReason.trim()" data-test="pdd-confirm-submit" @click="submitConfirm">確認並重算</el-button>
      </section>

      <p v-if="!cell.edit.plan && !cell.edit.confirm && cell.edit.locked_reason" class="pdd__note" data-test="pdd-locked">
        {{ LOCKED_REASON_LABELS[cell.edit.locked_reason] }}
      </p>

      <footer class="pdd__footer">
        <el-button
          v-if="caller.can_edit_attendance && cell.actual && !cell.actual.punch_in && !cell.actual.punch_out"
          :type="cell.actual.status === 'data_incomplete' ? 'primary' : 'default'"
          data-test="pdd-import"
          @click="emit('import', { employee_id: cell.employee_id, employee_name: employee.name, date: cell.date })"
        >匯入這天打卡</el-button>
        <el-button v-if="caller.can_view_attendance" data-test="pdd-records" @click="emit('records', cell.employee_id, cell.date)">看他整月（補卡、豁免）</el-button>
      </footer>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { confirmReconciliationShift } from '@/api/attendanceReconciliation'
import { deleteDaily, getDaily, saveDaily } from '@/api/shifts'
import { apiError } from '@/utils/error'
import { confirmDiscardChanges } from '@/composables/useUnsavedChangesGuard'
import { KIND_LABELS, STATUS_LABELS } from '@/utils/attendanceConfirm'
import {
  LOCKED_REASON_LABELS,
  RECON_STATUS_LABELS,
  SOURCE_TAGS,
  cellDisplay,
  findPairCell,
  isRecordedConflict,
  planText,
  type GridCell,
  type GridDay,
  type GridEmployee,
  type GridOut,
  type GridShiftType,
} from '@/utils/scheduleAttendanceGrid'

const INHERIT = -2
const DAY_OFF = -1
const WEEKDAY = ['一', '二', '三', '四', '五', '六', '日']

const props = defineProps<{
  modelValue: boolean
  cell: GridCell | null
  employee: GridEmployee | null
  day: GridDay | null
  groupLabel: string
  shiftTypes: GridShiftType[]
  sameDayCells: GridCell[]
  employeeNames: Record<number, string>
  /** 該員工該週的週排班（未套用本地緩衝前的現值），null＝沒有週排班 */
  weeklyShiftId: number | null
  today: string
  caller: GridOut['caller']
  mobile?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  changed: []
  records: [employeeId: number, date: string]
  /** 沒有任何打卡的人日：帶人員與日期開匯入（沿用原打卡核對清單的「匯入打卡」） */
  import: [context: { employee_id: number; employee_name: string; date: string }]
}>()

// 下拉：在用班別＋目前已選的那個（即使已停用，才能顯示其名稱；但它不可再被選）
function optionsWith(current: number | null) {
  return props.shiftTypes.filter((s) => s.is_active || s.shift_type_id === current)
}
const shiftName = (id: number | null | undefined) =>
  props.shiftTypes.find((s) => s.shift_type_id === id)?.name ?? '無'
const hhmm = (iso: string | null | undefined) => (iso ? iso.slice(11, 16) : '無紀錄')

const title = computed(() => {
  if (!props.employee || !props.day) return ''
  const [, m, d] = props.day.date.split('-').map(Number)
  const parts = [props.employee.name, props.groupLabel, props.employee.role_label].filter(Boolean)
  return `${parts.join('・')}　${m}/${d}（${WEEKDAY[props.day.weekday]}）`
})

/** spec §7：兼兩班時歸主要班級組，抽屜註明另一班 */
const otherClasses = computed(() => (props.employee?.other_classroom_labels ?? []).join('、'))

const planLine = computed(() => {
  if (!props.cell) return ''
  return `${planText(props.cell)}（${SOURCE_TAGS[props.cell.plan.source].label}）`
})

/**
 * 週排班層的值。沒有 SCHEDULE 的人不會載入週排班（weeklyShiftId 為 null），但來源是週排班或輪值表
 * （輪值表套用後寫成週排班，帶 rotation_id）時，生效的週排班班別就是格子計畫的班別，不能寫「無」。
 */
function weeklyValue(cell: GridCell): string {
  if (props.weeklyShiftId) return shiftName(props.weeklyShiftId)
  const plan = cell.plan
  if ((plan.source === 'weekly' || plan.source === 'rotation') && plan.name) return plan.name
  return '無'
}

const chain = computed(() => {
  const cell = props.cell
  if (!cell) return []
  const plan = cell.plan
  const rotation = plan.rotation
  const dailyLike = plan.source === 'daily' || plan.source === 'daily_off' || plan.source === 'swap'
  const layers = [
    {
      key: 'rotation',
      label: '輪值表',
      value: rotation
        ? `${rotation.school_year} 學年${rotation.semester === 1 ? '上' : '下'}學期・第 ${rotation.week_label ?? '?'} 週・${rotation.row_label ?? '—'}`
        : '無',
      active: plan.source === 'rotation',
    },
    { key: 'weekly', label: '週排班', value: weeklyValue(cell), active: plan.source === 'weekly' },
    {
      key: 'daily',
      label: '每日調整',
      value: dailyLike && plan.source !== 'swap' ? `${plan.day_off ? '排休' : shiftName(plan.shift_type_id)}${plan.daily_notes ? `（${plan.daily_notes}）` : ''}` : '無',
      active: plan.source === 'daily' || plan.source === 'daily_off',
    },
    {
      key: 'swap',
      label: '換班',
      value: plan.source === 'swap' ? `換班單 #${plan.swap_request_id}：${plan.day_off ? '排休' : shiftName(plan.shift_type_id)}` : '無',
      active: plan.source === 'swap',
    },
    {
      key: 'leave',
      label: '請假',
      value: cell.leaves.length
        ? cell.leaves
            .map((l) => `${l.leave_type_label}${l.is_full_day ? '（全天）' : `（${l.start_time ?? '起'}–${l.end_time ?? '迄'}）`}${l.status === 'pending' ? '・待審' : ''}`)
            .join('、')
        : '無',
      active: false,
    },
  ]
  if (plan.source === 'employee' || plan.source === 'default') {
    layers.splice(4, 0, { key: 'default', label: '預設', value: SOURCE_TAGS[plan.source].label, active: true })
  }
  return layers
})

const verdict = computed(() => {
  const cell = props.cell
  const actual = cell?.actual
  if (!cell || !actual) return ''
  // R9：與格子同一套判定（今天的上班中／尚未打卡不能和格子不一致）
  const shown = cellDisplay(cell, props.today)
  if (shown.state === 'working' || shown.state === 'not_punched') return shown.verdict?.label ?? ''
  const parts = [RECON_STATUS_LABELS[actual.status]]
  if (actual.late_minutes) parts.push(`遲到 ${actual.late_minutes} 分`)
  if (actual.early_leave_minutes) parts.push(`早退 ${actual.early_leave_minutes} 分`)
  return parts.join('・')
})

const confirmationLabel = computed(() => {
  const c = props.cell?.confirmation
  if (!c) return ''
  const kind = KIND_LABELS[c.kind as keyof typeof KIND_LABELS] ?? c.kind
  const status = STATUS_LABELS[c.status as keyof typeof STATUS_LABELS] ?? c.status
  return `${kind}・${status}`
})

const suggestedPair = computed(() => {
  const cell = props.cell
  if (!cell?.actual || cell.actual.candidates.length !== 1) return null
  return findPairCell(cell, cell.actual.candidates[0].shift_type_id, props.sameDayCells)
})

// ── 改這天（每日調整）────────────────────────────────────────────
const dayChoice = ref<number>(INHERIT)
const initialDayChoice = ref<number>(INHERIT)
const dailyRecordId = ref<number | null>(null)
const savingDay = ref(false)
const loadingDaily = ref(false)

// ── 確認當日班別 ────────────────────────────────────────────────
const confirmChoice = ref<number | null>(null)
const confirmInitial = ref<number | null>(null)
const confirmReason = ref('')
const includePair = ref(false)
const confirming = ref(false)
const pair = computed(() => {
  const cell = props.cell
  if (!cell || confirmChoice.value === null) return null
  return findPairCell(cell, confirmChoice.value, props.sameDayCells)
})
watch(confirmChoice, () => { includePair.value = false })

// X、Esc、點遮罩關閉前：打了一半的確認原因或選了沒套用的「改這天」不能無聲丟掉
const isDirty = () => confirmReason.value.trim() !== '' || dayChoice.value !== initialDayChoice.value
async function beforeClose(done: () => void): Promise<void> {
  if (!isDirty()) return done()
  const ok = await confirmDiscardChanges({
    title: '尚未送出',
    message: '確認原因或班別選擇還沒送出，關閉會捨棄。',
    cancelText: '繼續編輯',
  })
  if (ok) done()
}

let openSeq = 0
watch(
  () => [props.modelValue, props.cell?.employee_id, props.cell?.date] as const,
  async ([open]) => {
    const cell = props.cell
    if (!open || !cell) return
    const seq = ++openSeq
    const plan = cell.plan
    const current = plan.source === 'daily_off' || (plan.source === 'swap' && plan.day_off)
      ? DAY_OFF
      : plan.source === 'daily' || plan.source === 'swap'
        ? plan.shift_type_id ?? INHERIT
        : INHERIT
    dayChoice.value = current
    initialDayChoice.value = current
    dailyRecordId.value = null
    loadingDaily.value = false
    const candidates = cell.actual?.candidates ?? []
    confirmChoice.value = candidates.length === 1 ? candidates[0].shift_type_id : cell.actual?.original_shift_type_id ?? null
    confirmInitial.value = confirmChoice.value
    confirmReason.value = ''
    includePair.value = false
    if (cell.edit.plan && current !== INHERIT) {
      loadingDaily.value = true
      try {
        const rows = (await getDaily({ start_date: cell.date, end_date: cell.date, employee_id: cell.employee_id })).data
        if (seq === openSeq) dailyRecordId.value = rows[0]?.id ?? null
      } catch (err) {
        if (seq === openSeq) ElMessage.error(apiError(err, '讀取每日調整失敗'))
      } finally {
        if (seq === openSeq) loadingDaily.value = false
      }
    }
  },
  { immediate: true },
)

async function applyDay(): Promise<void> {
  const cell = props.cell
  if (!cell) return
  savingDay.value = true
  try {
    if (dayChoice.value === INHERIT) {
      let id = dailyRecordId.value
      if (id === null) {
        const rows = (await getDaily({ start_date: cell.date, end_date: cell.date, employee_id: cell.employee_id })).data
        id = rows[0]?.id ?? null
      }
      if (id === null) {
        ElMessage.warning('這天已沒有每日調整，已重新整理')
        emit('changed')
        return
      }
      await deleteDaily(id)
    } else if (dayChoice.value === DAY_OFF) {
      await saveDaily({ employee_id: cell.employee_id, date: cell.date, day_off: true })
    } else {
      await saveDaily({ employee_id: cell.employee_id, date: cell.date, shift_type_id: dayChoice.value, day_off: false })
    }
    ElMessage.success('已更新這天的班別')
    // 抽屜不關（同一格的 watch 不會重跑），套用後的選擇就是新的現值
    initialDayChoice.value = dayChoice.value
    if (dayChoice.value === INHERIT) dailyRecordId.value = null
    emit('changed')
  } catch (err) {
    if (isRecordedConflict(err)) {
      ElMessage.warning('這天已有打卡紀錄，已重新整理；請改用「確認當日班別」')
      emit('changed')
    } else {
      ElMessage.error(apiError(err, '更新班別失敗'))
    }
  } finally {
    savingDay.value = false
  }
}

async function submitConfirm(): Promise<void> {
  const cell = props.cell
  if (!cell?.actual || confirmChoice.value === null || !confirmReason.value.trim()) return
  const items = [{
    employee_id: cell.employee_id,
    date: cell.date,
    shift_type_id: confirmChoice.value === 0 ? null : confirmChoice.value,
    day_off: confirmChoice.value === 0,
    version: cell.actual.version,
  }]
  const partner = pair.value
  if (includePair.value && partner?.actual && cell.actual.original_shift_type_id != null) {
    items.push({
      employee_id: partner.employee_id,
      date: partner.date,
      shift_type_id: cell.actual.original_shift_type_id,
      day_off: false,
      version: partner.actual.version,
    })
  }
  confirming.value = true
  try {
    await confirmReconciliationShift({ items, reason: confirmReason.value.trim() })
    ElMessage.success('已更新當日班別並重新計算出勤')
    confirmReason.value = ''
    includePair.value = false
    emit('changed')
  } catch (err) {
    if ((err as { response?: { status?: number } })?.response?.status === 409) {
      ElMessage.warning(apiError(err, '班表、打卡或請假已更新，請再確認一次'))
      emit('changed')
    } else {
      ElMessage.error(apiError(err, '確認失敗，請重新整理後再試'))
    }
  } finally {
    confirming.value = false
  }
}
</script>

<style scoped>
.pdd { display: grid; gap: var(--space-4); }
.pdd__section h3 { margin: 0 0 var(--space-2); font-size: var(--text-sm); color: var(--el-text-color-secondary); }
.pdd__plan { margin: 0; font-weight: 600; }
.pdd__note { margin: 0; color: var(--el-text-color-secondary); font-size: var(--text-sm); }
.pdd__chain { margin: 0; padding-left: var(--space-4); display: grid; gap: var(--space-1); }
.pdd__chain-label { display: inline-block; min-width: 4.5em; color: var(--el-text-color-secondary); }
.pdd__chain-item--active { font-weight: 600; }
.pdd__facts { display: grid; grid-template-columns: 4em 1fr; gap: var(--space-1) var(--space-2); margin: 0; }
.pdd__facts dt { color: var(--el-text-color-secondary); }
.pdd__facts dd { margin: 0; }
.pdd__reason { margin: var(--space-1) 0 0; font-size: var(--text-sm); color: var(--el-text-color-regular); }
.pdd__select { width: 100%; margin-bottom: var(--space-2); }
.pdd__footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--space-2); }
</style>
