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
      <nav v-if="nav && nav.total > 0" class="pdd__nav" aria-label="逐日待辦導覽" data-test="pdd-nav">
        <el-button :icon="ArrowLeft" :disabled="!nav.hasPrev" title="上一件待辦（K）" aria-keyshortcuts="k" data-test="pdd-prev" @click="go(-1)">上一件</el-button>
        <span class="pdd__nav-pos" data-test="pdd-nav-pos">{{ nav.label }}</span>
        <el-button :disabled="!nav.hasNext" title="下一件待辦（J）" aria-keyshortcuts="j" data-test="pdd-next" @click="go(1)">下一件<el-icon class="el-icon--right"><ArrowRight /></el-icon></el-button>
      </nav>
      <p v-if="nav?.back" class="pdd__back"><el-button link type="primary" data-test="pdd-back" @click="goBack">回剛才處理的 {{ nav.back }}</el-button></p>
      <p v-if="otherClasses" class="pdd__note" data-test="pdd-other-classes">另兼：{{ otherClasses }}</p>
      <div v-if="patternShown" class="pdd__pattern" role="note" data-test="pdd-pattern">
        <p class="pdd__pattern-lead">{{ patternTag(pattern!) }}：{{ patternSummary(pattern!) }}</p>
        <p class="pdd__pattern-text">{{ patternHint(pattern!) }}{{ patternNext }}</p>
        <div class="pdd__pattern-actions">
          <el-button link type="primary" data-test="pdd-pattern-list" @click="emit('patterns')">看本月設定檢查</el-button>
          <el-button v-if="canViewEmployees" link type="primary" data-test="pdd-pattern-employee" @click="openEmployee">員工資料</el-button>
          <el-button v-if="pattern!.kind === 'fixed_offset' && caller.can_edit_attendance" link type="primary" data-test="pdd-pattern-recalc" @click="emit('recalculate')">重算本月出勤</el-button>
        </div>
      </div>
      <!-- 決策卡優先（缺卡、出勤異常）：應上班、打卡與判定都寫在決策卡裡，這裡不重複 -->
      <section v-if="!decisionFirst" class="pdd__section">
        <h3>應上班</h3>
        <p class="pdd__plan" data-test="pdd-plan">{{ planLine }}</p>
        <!-- 已封存只寫這一次（底部的鎖定說明略過封存） -->
        <p v-if="cell.edit.locked_reason === 'finalized'" class="pdd__note" data-test="pdd-sealed">{{ LOCKED_REASON_LABELS.finalized }}</p>
      </section>

      <section v-if="!decisionFirst" class="pdd__section">
        <h3>打卡與判定</h3>
        <p v-if="!caller.can_view_attendance" class="pdd__note">沒有查看打卡紀錄的權限。</p>
        <p v-else-if="!cell.actual" class="pdd__note">{{ cell.date > today ? '尚未到這一天。' : '這天不在核對範圍內。' }}</p>
        <template v-else>
          <dl class="pdd__facts" data-test="pdd-actual">
            <dt>上班</dt><dd>{{ hhmm(cell.actual.punch_in) }}</dd>
            <dt>下班</dt><dd>{{ hhmm(cell.actual.punch_out) }}</dd>
            <dt>判定</dt><dd>{{ verdict }}</dd>
          </dl>
          <p v-if="!missingFromImport" class="pdd__reason">{{ cell.actual.reason }}</p>
          <div v-if="absenceRisk" class="pdd__absence" data-test="pdd-absence">
            <template v-if="missingFromImport">
              <p class="pdd__absence-lead">打卡資料裡沒有他這天的紀錄。格子暫不判缺勤，但算薪只看有沒有打卡：正職員工不處理的話，這天會算曠職扣款。</p>
              <p v-if="resolveMode !== 'none'" class="pdd__note">有上班：卡號對好後重新匯入這天打卡，或在下方補登上下班。有請假：建立請假單。</p>
            </template>
            <template v-else>
              <p class="pdd__absence-lead">這天沒有任何打卡。正職員工不處理的話，算薪時會算曠職扣款。</p>
              <p v-if="resolveMode !== 'none'" class="pdd__note">有上班但忘了打卡：在下方補登上下班。有請假：建立請假單。確定是曠職就不必動作，算薪會自動扣（這格會留在待處理）。</p>
            </template>
            <p v-if="resolveMode === 'none' && !isOwnCell && !caller.can_edit_attendance" class="pdd__note">有上班或有請假，要由有出勤寫入權限的行政人員補登或建立請假單。</p>
            <el-button v-if="canCreateLeave" link type="primary" class="pdd__link" data-test="pdd-create-leave" @click="openLeave">建立請假單</el-button>
          </div>
        </template>
      </section>
      <!-- 系統推測與老師確認不在決策卡裡：決策卡優先時也照樣寫出 -->
      <p v-if="caller.can_view_attendance && cell.actual?.candidates.length" class="pdd__fact" data-test="pdd-candidates">
        系統推測：{{ cell.actual.candidates.map((c) => `${c.name} ${c.work_start}–${c.work_end}`).join('、') }}
        <template v-if="suggestedPair">（疑似和 {{ employeeNames[suggestedPair.employee_id] }} 對調）</template>
      </p>
      <p v-if="caller.can_view_attendance && cell.actual && cell.confirmation" class="pdd__fact" data-test="pdd-confirmation">
        老師確認：{{ confirmationLabel }}
      </p>

      <p v-if="selfBlocked" class="pdd__note" data-test="pdd-self-note">本人出勤需由其他行政人員補登</p>

      <DayResolveSection
        v-if="resolveMode !== 'none' && resolveMode !== 'confirm-first'"
        ref="resolveRef"
        :cell="cell"
        :locked="actionsLocked"
        :mode="resolveMode"
        :accept-warning="acceptWarning"
        :employee-name="employee.name"
        :employee-number="employee.employee_number ?? ''"
        :weekday="weekdayLabel"
        :will-advance="willAdvance"
        @changed="(opts: ChangedOptions) => emit('changed', opts)"
        @undone="emit('undone')"
      />

      <!-- 決策卡優先時，改這天與確認當日班別是判定本身錯了才用的次要動作：收進預設收合的「其他處理」 -->
      <component
        :is="otherCollapsed ? 'details' : 'div'"
        :class="otherCollapsed ? 'pdd__more' : 'pdd__group'"
        :data-test="otherCollapsed ? 'pdd-more' : undefined"
      >
      <summary v-if="otherCollapsed">{{ otherSummary }}</summary>
      <section v-if="cell.edit.plan" class="pdd__section" data-test="pdd-edit-day">
        <h3>改這天</h3>
        <p v-if="swapLocked" class="pdd__note" data-test="pdd-swap-locked">{{ swapLockedNote }}</p>
        <el-select v-model="dayChoice" :aria-label="'改這天的班別'" :disabled="swapLocked" class="pdd__select" data-test="pdd-day-select">
          <el-option :value="INHERIT" :label="inheritLabel" />
          <el-option v-for="s in optionsWith(initialDayChoice)" :key="s.shift_type_id" :value="s.shift_type_id" :disabled="!s.is_active" :label="`${s.name} ${s.work_start}–${s.work_end}${s.is_active ? '' : '（已停用）'}`" />
          <el-option :value="DAY_OFF" label="排休（明確不上班）" />
        </el-select>
        <el-button :type="resolveMode === 'side-by-side' || decisionFirst ? 'default' : 'primary'" :loading="savingDay" :disabled="swapLocked || dayChoice === initialDayChoice || loadingDaily || actionsLocked" data-test="pdd-day-apply" @click="applyDay">套用</el-button>
      </section>

      <section v-if="cell.edit.confirm && cell.actual" class="pdd__section" data-test="pdd-confirm">
        <h3>確認當日班別</h3>
        <el-button v-if="!confirmExpanded" text type="primary" data-test="pdd-confirm-toggle" @click="confirmExpanded = true">改確認當日班別</el-button>
        <el-form v-if="confirmExpanded" label-position="top" @submit.prevent>
          <div v-if="cell.actual.candidates.length" class="pdd__candidates" role="group" aria-label="系統推測的班別">
            <span class="pdd__candidates-label">系統推測</span>
            <el-button
              v-for="c in cell.actual.candidates"
              :key="c.shift_type_id"
              size="small"
              :type="confirmChoice === c.shift_type_id ? 'primary' : 'default'"
              :plain="confirmChoice === c.shift_type_id"
              :data-test="`pdd-candidate-${c.shift_type_id}`"
              @click="pickCandidate(c)"
            >{{ c.name }} {{ c.work_start }}–{{ c.work_end }}</el-button>
          </div>
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
        <el-button v-if="confirmExpanded" :type="resolveMode === 'resolve-first' || resolveMode === 'side-by-side' ? 'default' : 'primary'" :loading="confirming" :disabled="confirmChoice === null || !confirmReason.trim() || actionsLocked" data-test="pdd-confirm-submit" @click="submitConfirm">確認並重算</el-button>
      </section>
      </component>

      <DayResolveSection
        v-if="resolveMode === 'confirm-first'"
        ref="resolveRef"
        :cell="cell"
        :locked="actionsLocked"
        mode="confirm-first"
        :accept-warning="acceptWarning"
        :employee-name="employee.name"
        :employee-number="employee.employee_number ?? ''"
        :weekday="weekdayLabel"
        :will-advance="willAdvance"
        @changed="(opts: ChangedOptions) => emit('changed', opts)"
        @undone="emit('undone')"
      />

      <p v-if="!cell.edit.plan && !cell.edit.confirm && cell.edit.locked_reason && cell.edit.locked_reason !== 'finalized'" class="pdd__note" data-test="pdd-locked">
        {{ lockedNote }}
      </p>

      <!-- 班別來源是查證用的細節：判定與動作在前，來源收在最後（標題寫出生效的那一層） -->
      <details class="pdd__source" data-test="pdd-source">
        <summary>班別來源：{{ SOURCE_TAGS[cell.plan.source].label }}</summary>
        <ol class="pdd__chain" data-test="pdd-chain">
          <li v-for="layer in chain" :key="layer.key" :class="{ 'pdd__chain-item--active': layer.active }">
            <span class="pdd__chain-label">{{ layer.label }}</span>
            <span>{{ layer.value }}</span>
          </li>
        </ol>
      </details>

      <footer class="pdd__footer">
        <el-button
          v-if="caller.can_edit_attendance && cell.actual && !cell.actual.punch_in && !cell.actual.punch_out"
          :type="cell.actual.status === 'data_incomplete' ? 'primary' : 'default'"
          data-test="pdd-import"
          @click="emit('import', { employee_id: cell.employee_id, employee_name: employee.name, date: cell.date })"
        >匯入這天打卡</el-button>
        <el-button v-if="caller.can_view_attendance" data-test="pdd-records" @click="emit('records', cell.employee_id, cell.date)">看他整月</el-button>
      </footer>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { confirmReconciliationShift } from '@/api/attendanceReconciliation'
import DayResolveSection, { type DayResolveMode } from './DayResolveSection.vue'
import { deleteDaily, getDaily, saveDaily } from '@/api/shifts'
import { apiError } from '@/utils/error'
import { confirmDiscardChanges } from '@/composables/useUnsavedChangesGuard'
import { KIND_LABELS, STATUS_LABELS } from '@/utils/attendanceConfirm'
import { hasPermission } from '@/utils/auth'
import { leaveCreateLink } from '@/utils/leaveDeepLink'
import { rotationWeekText } from '@/utils/dutyRotationGrid'
import { patternAcceptWarning, patternHint, patternSummary, patternTag, type AttendancePattern } from '@/utils/attendancePatterns'
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
/** 處理成功的附帶說明：undoToast＝已跳了可復原的提示（接受扣款／豁免），面板跳下一件時不必再提示 */
type ChangedOptions = { undoToast: boolean }

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
  /**
   * 上一件／下一件逐日待辦（面板依整月的列與篩選排好）；label＝面板寫好的位置文字（「9 月逐日待辦 3 / 12」）；
   * back＝剛自動跳走的那格（可回去）；null＝不顯示
   */
  nav?: { position: number | null; total: number; label: string; hasPrev: boolean; hasNext: boolean; back?: string | null } | null
  /** 剛自動跳到這格：短暫鎖住動作，連點不會落到這一筆 */
  actionsLocked?: boolean
  /** 這位員工本月的型態（整月沒打卡／時段可能設錯）；patternMatchesDay＝這格就是那個型態的一格 */
  pattern?: AttendancePattern | null
  patternMatchesDay?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  /** 換到上一筆（-1）或下一筆（1）待處理 */
  navigate: [direction: 1 | -1]
  /** 回剛才自動跳走的那格 */
  back: []
  /** 這格有異動（格子要重抓）；opts 見 ChangedOptions，改這天、確認當日班別不帶 */
  changed: [opts?: ChangedOptions]
  /** 接受扣款／豁免後按了復原（格子要重抓，但不是新的處理，不自動跳格） */
  undone: []
  records: [employeeId: number, date: string]
  /** 沒有任何打卡的人日：帶人員與日期開匯入（沿用原打卡核對清單的「匯入打卡」） */
  import: [context: { employee_id: number; employee_name: string; date: string }]
  /** 開本月設定檢查清單 */
  patterns: []
  /** 開重算本月出勤（改好員工上下班時間或類型之後） */
  recalculate: []
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

const weekdayLabel = computed(() => (props.day ? WEEKDAY[props.day.weekday] : ''))

/**
 * 就地處理打卡依判定給一個主要動作（SPEC-027 §3 第 8 點；R3 於 2026-10-13 推翻）：
 * 缺卡／出勤異常＝補卡在前；疑似換班＝確認當日班別在前；疑似缺勤＝補登上下班與改這天並列。
 * 需要能看打卡（抓異常卡）也能寫出勤；已封存、本人、今天以後不處理。
 */
const actionableMode = computed<DayResolveMode | 'none'>(() => {
  const cell = props.cell
  const actual = cell?.actual
  if (!cell || !actual || !props.caller.can_view_attendance || !props.caller.can_edit_attendance) return 'none'
  if (cell.date >= props.today) return 'none'
  const lock = cell.edit.locked_reason
  if (lock === 'finalized' || lock === 'self' || lock === 'not_employed') return 'none'
  if (actual.status === 'possible_shift_change') return 'confirm-first'
  if (actual.status === 'missing_punch' || actual.status === 'anomaly') return 'resolve-first'
  if (actual.status === 'suspected_absence') return 'side-by-side'
  // 當天有匯入、打卡檔裡卻沒有這個人：和疑似缺勤一樣可以補登上下班（否則管理員只看到「要找有權限的人」）
  if (missingFromImport.value) return 'side-by-side'
  return 'none'
})
/** 資料待補且整天沒打卡、當天又有匯入＝匯入的打卡檔裡沒有他這天（多半是卡號沒對照） */
const missingFromImport = computed(() => {
  const actual = props.cell?.actual
  return !!actual && actual.status === 'data_incomplete' && !actual.punch_in && !actual.punch_out && props.day?.import_covered !== false
})
/**
 * 本人出勤一律不能自己補（後端 require_not_self_attendance 回 403）。已打卡的本人格後端給 locked_reason
 * 'self'；沒有出勤紀錄列的（疑似缺勤）沒有鎖定原因，只能靠 caller.employee_id 認出本人（F2）。
 */
const isOwnCell = computed(() => props.caller.employee_id != null && props.cell?.employee_id === props.caller.employee_id)
const selfBlocked = computed(() => isOwnCell.value && actionableMode.value !== 'none')
const resolveMode = computed<DayResolveMode | 'none'>(() => (isOwnCell.value ? 'none' : actionableMode.value))
/** 決策卡優先（缺卡、出勤異常）：判定與事實只寫在決策卡，改這天與確認當日班別收進「其他處理」 */
const decisionFirst = computed(() => resolveMode.value === 'resolve-first')
const otherParts = computed(() => {
  const cell = props.cell
  if (!cell) return []
  return [cell.edit.plan ? '改這天班別' : '', cell.edit.confirm && cell.actual ? '確認是換班' : ''].filter(Boolean)
})
const otherCollapsed = computed(() => decisionFirst.value && otherParts.value.length > 0)
const otherSummary = computed(() => `其他處理：${otherParts.value.join('・')}`)
/** 這格在佇列裡、佇列還有別件：處理完面板會自動跳下一件（復原提示據此寫「跳到下一件」） */
const willAdvance = computed(() => !!props.nav && props.nav.position !== null && props.nav.total > 1)
/**
 * 「確認當日班別」只在它就是要做的事時展開：疑似換班、非原排班出勤。其他判定（全天請假、符合班表、
 * 補卡為主的缺卡）收起來，需要時再按「改確認當日班別」——否則全天病假也會出現必填的班別與原因。
 * 重抓後判定改變（例如補卡後變疑似換班）要跟著重設。
 */
const CONFIRM_FIRST_STATUSES: ReadonlySet<string> = new Set(['possible_shift_change', 'unscheduled_attendance'])
const confirmFirst = computed(() => CONFIRM_FIRST_STATUSES.has(props.cell?.actual?.status ?? ''))
const confirmExpanded = ref(false)
watch(confirmFirst, (first) => { confirmExpanded.value = first })

/** 沒有排班權限但能處理打卡時，「沒有修改權限」會和下方補卡區矛盾，改說清楚是不能改班 */
const lockedNote = computed(() => {
  const reason = props.cell?.edit.locked_reason
  if (!reason) return ''
  if (reason === 'no_permission' && resolveMode.value !== 'none') return '沒有改班權限；打卡仍可在下方處理'
  return LOCKED_REASON_LABELS[reason]
})

/**
 * 應上班卻整天沒有打卡（疑似缺勤，或當天有匯入但沒有這個人的資料待補）：薪資引擎對正職會把這天算曠職
 * （應上班日－有打卡日－全天假），不管是不是「資料待補」。整天未匯入的日子格子寫「未匯入」，這裡不重複。
 */
const absenceRisk = computed(() => {
  const cell = props.cell
  const actual = cell?.actual
  if (!cell || !actual || cell.date >= props.today) return false
  // 已封存：薪資已結算，「不處理會扣」不再成立
  if (cell.edit.locked_reason === 'finalized') return false
  if (!cell.plan.expected || cell.plan.day_off || actual.punch_in || actual.punch_out) return false
  if (cell.leaves.some((leave) => leave.status === 'approved' && leave.is_full_day)) return false
  if (actual.status === 'suspected_absence') return true
  return actual.status === 'data_incomplete' && props.day?.import_covered !== false
})
const canCreateLeave = hasPermission('LEAVES_WRITE')
const canViewEmployees = hasPermission('EMPLOYEES_READ')
const router = useRouter()

/** 型態提醒只在這格就是那個型態的一格時出現（同一人的其他異常照常逐日處理） */
const patternShown = computed(() => !!props.pattern && !!props.patternMatchesDay)
const patternNext = computed(() => {
  if (!props.pattern) return ''
  return props.pattern.kind === 'fixed_offset'
    ? '先改員工資料，再按「重算本月出勤」，這些格子會一起更新；不要逐格接受扣款。'
    : '修好後重新匯入，這些天會一起補上；不要逐格補登。'
})
/** 接受扣款前的提醒（ResolveCard 會先問）：照現在設錯的時段逐格扣薪是最容易犯的錯 */
const acceptWarning = computed(() => (props.pattern && props.patternMatchesDay ? patternAcceptWarning(props.pattern) : null))
async function openEmployee(): Promise<void> {
  const cell = props.cell
  if (!cell || !(await requestClose())) return
  void router?.push(`/employees/${cell.employee_id}`)
}
/** 建立請假單會離開這頁：先過未送出檢查 */
async function openLeave(): Promise<void> {
  const cell = props.cell
  if (!cell || !(await requestClose())) return
  void router?.push(leaveCreateLink(cell.employee_id, cell.date))
}

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

/** 「改這天」刪掉每日調整後會落回哪一層：有週排班（含輪值表寫入的）寫班別名，否則是預設工時 */
const inheritLabel = computed(() => {
  const cell = props.cell
  const weekly = cell ? weeklyValue(cell) : '無'
  return weekly === '無' ? '不另外調整（沿用預設工時）' : `不另外調整（沿用週排班：${weekly}）`
})

// 換班來源：一般換班是申請單編號；老師自行補登（SPEC-026 3-3）套用後寫入的格子沒有申請單，改寫確認項目編號
function swapOrigin(plan: GridCell['plan']): string {
  if (plan.swap_request_id != null) return `換班單 #${plan.swap_request_id}`
  if (plan.swap_confirmation_item_id != null) return `換班補登（確認項目 #${plan.swap_confirmation_item_id}）`
  return '換班'
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
        ? `${rotation.school_year} 學年${rotation.semester === 1 ? '上' : '下'}學期・${rotationWeekText(rotation.week_label)}・${rotation.row_label ?? '—'}`
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
      value: plan.source === 'swap' ? `${swapOrigin(plan)}：${plan.day_off ? '排休' : shiftName(plan.shift_type_id)}` : '無',
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
  const shown = cellDisplay(cell, props.today, props.day?.import_covered === false ? new Set([props.day.date]) : undefined)
  if (shown.state === 'working' || shown.state === 'not_punched' || shown.state === 'awaiting_import') return shown.verdict?.label ?? ''
  // 與格子同一個判定文字（含「・已豁免／已接受扣款」）；非應出勤日格子不寫判定，這裡仍寫狀態名
  const parts = [shown.verdict?.label ?? RECON_STATUS_LABELS[actual.status]]
  // 出勤異常的格子判定已寫出分鐘數，不再重複
  if (actual.status !== 'anomaly') {
    if (actual.late_minutes) parts.push(`遲到 ${actual.late_minutes} 分`)
    if (actual.early_leave_minutes) parts.push(`早退 ${actual.early_leave_minutes} 分`)
  }
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
/**
 * 換班格（換班單或老師補登換班）不能用「改這天」：改寫會丟掉換班標記（notes），選「不另外調整」只刪本人
 * 那列、對方仍是對調後的班（QA #21）。要改得先撤銷換班。
 */
const swapLocked = computed(() => props.cell?.plan.source === 'swap')
const swapPartnerName = computed(() => {
  const cell = props.cell
  if (!cell || !swapLocked.value) return null
  const { swap_request_id: requestId, swap_confirmation_item_id: itemId } = cell.plan
  const partner = props.sameDayCells.find((c) =>
    c.employee_id !== cell.employee_id
    && c.plan.source === 'swap'
    && ((requestId != null && c.plan.swap_request_id === requestId)
      || (itemId != null && c.plan.swap_confirmation_item_id === itemId)))
  return partner ? props.employeeNames[partner.employee_id] ?? null : null
})
const swapLockedNote = computed(() => {
  const cell = props.cell
  if (!cell) return ''
  const partner = swapPartnerName.value ? `，與 ${swapPartnerName.value} 對調` : ''
  return `這天的班來自${swapOrigin(cell.plan)}${partner}。直接改只會改到本人、對方仍是對調後的班，需先撤銷換班再調整。`
})
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

/** 點系統推測的班別：原因還空著就帶入建議原因（可再改）；開抽屜時不自動帶，否則還沒動就算未送出 */
function pickCandidate(c: { shift_type_id: number; name: string; work_start: string; work_end: string }): void {
  confirmChoice.value = c.shift_type_id
  if (!confirmReason.value.trim()) confirmReason.value = `打卡時間符合${c.name} ${c.work_start}–${c.work_end}（系統推測）`
}

// X、Esc、點遮罩關閉前：打了一半的確認原因或選了沒套用的「改這天」不能無聲丟掉。
// 只算畫面上看得到的區塊：重載後區塊消失（例如改這天撞到已打卡）殘留的選擇不算。
const resolveRef = ref<InstanceType<typeof DayResolveSection> | null>(null)
const isDirty = (): boolean => {
  const cell = props.cell
  if (!cell) return false
  const dayDirty = cell.edit.plan && dayChoice.value !== initialDayChoice.value
  const reasonDirty = cell.edit.confirm && !!cell.actual && confirmReason.value.trim() !== ''
  return dayDirty || reasonDirty || (resolveRef.value?.isDirty() ?? false)
}
/** 頁面要程式關閉（看他整月）前呼叫；回 true＝可以關 */
async function requestClose(): Promise<boolean> {
  if (!isDirty()) return true
  return confirmDiscardChanges({
    title: '尚未送出',
    message: '確認原因或班別選擇還沒送出，關閉會捨棄。',
    cancelText: '繼續編輯',
  })
}
async function beforeClose(done: () => void): Promise<void> {
  if (await requestClose()) done()
}
defineExpose({ requestClose })

// ── 上一筆／下一筆待處理 ───────────────────────────────────────────
async function go(direction: 1 | -1): Promise<void> {
  const nav = props.nav
  if (!nav || (direction === 1 ? !nav.hasNext : !nav.hasPrev)) return
  if (!(await requestClose())) return
  emit('navigate', direction)
}
async function goBack(): Promise<void> {
  if (!(await requestClose())) return
  emit('back')
}
/**
 * J／K 換筆：焦點在這個抽屜裡（或沒有焦點）才算。疊在上面的對話框（例如從抽屜開的匯入打卡）、
 * 打字中、選單展開、確認框開著、按住不放都不算。
 */
function onKeydown(event: KeyboardEvent): void {
  if (!props.modelValue || !props.nav || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return
  const key = event.key.toLowerCase()
  if (key !== 'j' && key !== 'k') return
  const target = event.target instanceof Element ? event.target : null
  const inDrawer = !!target?.closest('[data-test="person-day-drawer"]')
  if (!inDrawer && target !== document.body && target !== document.documentElement) return
  if (target?.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"]')) return
  if (document.querySelector('.el-overlay-message-box')) return
  event.preventDefault()
  void go(key === 'j' ? 1 : -1)
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

let openSeq = 0
// 只在開關或換格時重設表單：getter 回傳陣列會讓每次重抓（cell 物件換新）都重設、打到一半的原因被清掉
watch(
  [() => props.modelValue, () => props.cell?.employee_id, () => props.cell?.date],
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
    confirmExpanded.value = confirmFirst.value
    if (cell.edit.plan && current !== INHERIT && plan.source !== 'swap') {
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

/** 送出時的格子：送出途中換到別格，舊格完成時不能改寫新格的表單 */
const cellKey = (cell: GridCell | null): string => (cell ? `${cell.employee_id}|${cell.date}` : '')

async function applyDay(): Promise<void> {
  const cell = props.cell
  if (!cell || swapLocked.value) return
  const key = cellKey(cell)
  const choice = dayChoice.value
  // 帶回原本每日調整的備註：後端 upsert 會把沒帶的 notes 存成 None
  const notes = cell.plan.daily_notes ?? null
  savingDay.value = true
  try {
    if (choice === INHERIT) {
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
    } else if (choice === DAY_OFF) {
      await saveDaily({ employee_id: cell.employee_id, date: cell.date, day_off: true, notes })
    } else {
      await saveDaily({ employee_id: cell.employee_id, date: cell.date, shift_type_id: choice, day_off: false, notes })
    }
    ElMessage.success('已更新這天的班別')
    // 抽屜不關（同一格的 watch 不會重跑），套用後的選擇就是新的現值；已換到別格就不動新格的表單
    if (cellKey(props.cell) === key) {
      initialDayChoice.value = choice
      if (choice === INHERIT) dailyRecordId.value = null
    }
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
  const key = cellKey(cell)
  confirming.value = true
  try {
    await confirmReconciliationShift({ items, reason: confirmReason.value.trim() })
    ElMessage.success('已更新當日班別並重新計算出勤')
    if (cellKey(props.cell) === key) {
      confirmReason.value = ''
      includePair.value = false
    }
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
.pdd__nav { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); padding-bottom: var(--space-3); border-bottom: 1px solid var(--el-border-color-lighter); }
.pdd__nav .el-button { margin-left: 0; }
.pdd__nav-pos { color: var(--el-text-color-secondary); font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
.pdd__back { margin: calc(-1 * var(--space-2)) 0 0; }
.pdd__section h3 { margin: 0 0 var(--space-2); font-size: var(--text-sm); color: var(--el-text-color-secondary); }
.pdd__plan { margin: 0; font-weight: 600; }
.pdd__fact { margin: 0; }
/* 不收合時只是分組殼：子區塊照樣排進 .pdd 的格線間距 */
.pdd__group { display: contents; }
/* details 不吃 grid／flex 排版（各瀏覽器不一），子區塊間距用 margin */
.pdd__more { border-top: 1px solid var(--el-border-color-lighter); padding-top: var(--space-3); }
.pdd__more > summary { cursor: pointer; color: var(--el-text-color-regular); font-size: var(--text-sm); font-weight: 600; }
.pdd__more[open] > summary { margin-bottom: var(--space-3); }
.pdd__more > section + section { margin-top: var(--space-4); }
.pdd__more > summary:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
.pdd__note { margin: 0; color: var(--el-text-color-secondary); font-size: var(--text-sm); }
.pdd__source summary { cursor: pointer; color: var(--el-text-color-secondary); font-size: var(--text-sm); }
.pdd__source summary:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
.pdd__source[open] summary { margin-bottom: var(--space-2); }
.pdd__chain { margin: 0; padding-left: var(--space-4); display: grid; gap: var(--space-1); }
.pdd__chain-label { display: inline-block; min-width: 4.5em; color: var(--el-text-color-secondary); }
.pdd__chain-item--active { font-weight: 600; }
.pdd__facts { display: grid; grid-template-columns: 4em 1fr; gap: var(--space-1) var(--space-2); margin: 0; }
.pdd__facts dt { color: var(--el-text-color-secondary); }
.pdd__facts dd { margin: 0; }
.pdd__reason { margin: var(--space-1) 0 0; font-size: var(--text-sm); color: var(--el-text-color-regular); }
.pdd__absence { display: grid; gap: var(--space-1); margin-top: var(--space-2); padding: var(--space-2) var(--space-3); border: 1px solid var(--el-color-warning-light-5); border-radius: var(--radius-md); background: var(--el-color-warning-light-9); }
.pdd__absence p { margin: 0; }
.pdd__absence-lead { font-size: var(--text-sm); font-weight: 600; color: var(--color-warning-darker); }
.pdd__link { justify-self: start; }
.pdd__pattern { display: grid; gap: var(--space-1); padding: var(--space-2) var(--space-3); border: 1px solid var(--el-color-warning-light-5); border-radius: var(--radius-md); background: var(--el-color-warning-light-9); }
.pdd__pattern p { margin: 0; }
.pdd__pattern-lead { font-size: var(--text-sm); font-weight: 600; color: var(--color-warning-darker); }
.pdd__pattern-text { font-size: var(--text-sm); color: var(--el-text-color-regular); }
.pdd__pattern-actions { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-3); }
.pdd__pattern-actions .el-button { margin-left: 0; }
.pdd__select { width: 100%; margin-bottom: var(--space-2); }
.pdd__candidates { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3); }
.pdd__candidates .el-button { margin-left: 0; }
.pdd__candidates-label { color: var(--el-text-color-secondary); font-size: var(--text-sm); }
.pdd__footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--space-2); }
</style>
