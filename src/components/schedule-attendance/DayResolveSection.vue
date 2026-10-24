<template>
  <section class="pdd-resolve" data-test="pdd-resolve">
    <h3>{{ mode === 'side-by-side' ? '補登上下班' : '處理打卡' }}</h3>
    <p v-if="handledNote" class="pdd-resolve__note">{{ handledNote }}</p>
    <p v-if="loadState === 'loading'" class="pdd-resolve__note" role="status">正在讀取這天的異常…</p>
    <p v-else-if="loadState === 'error'" class="pdd-resolve__note" role="alert">讀取異常資料失敗，可按「看他整月」到逐人檢視處理。</p>
    <ResolveCard
      v-else-if="displayCard"
      ref="cardRef"
      :item="displayCard"
      :index="0"
      :total="1"
      :context="context"
      :busy="resolving || locked"
      :show-nav="false"
      :actions="actions"
      :primary-action="mode === 'resolve-first'"
      :accept-warning="acceptWarning"
      @resolve="onResolve"
    />
  </section>
</template>

<script setup lang="ts">
/**
 * 排班與出勤抽屜的就地處理打卡（SPEC-027 §3 第 8 點；B 期裁定 R3 於 2026-10-13 由使用者推翻）。
 *
 * 沿用出勤明細的 ResolveCard 與送出邏輯（useResolveAnomaly）：
 * - resolve-first（缺卡、出勤異常）：抓該人該天的異常日卡，補打卡是主要動作
 * - confirm-first（疑似換班）：確認當日班別是主要動作，這裡只給接受扣款／豁免（兩側都有打卡，不必補卡）
 * - side-by-side（疑似缺勤）：整天沒打卡，只能補登上下班，與「改這天」並列、都不是主要按鈕；不抓異常清單
 * 成功後 emit changed 讓格子重抓；格子版本或處理結果變了就重抓異常卡。
 */
import { computed, ref, watch } from 'vue'
import ResolveCard from '@/components/attendance/ResolveCard.vue'
import { getAnomalyList } from '@/api/attendance'
import { groupAnomalies, type AnomalyDayCard } from '@/composables/useAttendanceWorkspace'
import { useResolveAnomaly, type ResolveAction, type ResolvePayload } from '@/composables/useResolveAnomaly'
import { confirmedActionLabel, type GridCell } from '@/utils/scheduleAttendanceGrid'

export type DayResolveMode = 'resolve-first' | 'confirm-first' | 'side-by-side'

const props = defineProps<{
  cell: GridCell
  mode: DayResolveMode
  employeeName: string
  employeeNumber: string
  /** 「一」…「日」 */
  weekday: string
  /** 抽屜剛自動跳到這格：短暫鎖住動作（連點不會落到這一筆） */
  locked?: boolean
  /** 這格符合整月固定型態（多半是設定問題）：按「接受扣款」前先提醒（見 ResolveCard） */
  acceptWarning?: string | null
  /**
   * 處理成功（父層以 @changed 綁定）。刻意用函式 prop 而不是 emit：送出途中抽屜換到另一格、本元件換位置被卸載時，
   * Vue 會丟掉已卸載元件的 emit，格子就不會重抓；函式 prop 仍會被呼叫。
   */
  onChanged?: () => void
}>()

const card = ref<AnomalyDayCard | null>(null)
const loadState = ref<'idle' | 'loading' | 'error'>('idle')
let seq = 0

const needsCard = computed(() => props.mode !== 'side-by-side' && props.cell.actual?.attendance_id != null)

async function load(): Promise<void> {
  const current = ++seq
  card.value = null
  if (!needsCard.value) {
    loadState.value = 'idle'
    return
  }
  loadState.value = 'loading'
  const [y, m] = props.cell.date.split('-').map(Number)
  try {
    const res = await getAnomalyList({ year: y, month: m, employee_id: props.cell.employee_id, on_date: props.cell.date, status: 'all' })
    if (current !== seq) return
    // 防呆：後端若還不認得 employee_id／on_date（前端先上線時）會回整月全員，只取該人該天，絕不顯示別人的卡
    const mine = res.data.items.filter((row) => row.date === props.cell.date && row.employee_number === props.employeeNumber)
    card.value = groupAnomalies(mine)[0] ?? null
    loadState.value = 'idle'
  } catch {
    if (current === seq) loadState.value = 'error'
  }
}
watch(
  [() => props.cell.employee_id, () => props.cell.date, () => props.cell.actual?.version, () => props.cell.actual?.confirmed_action, () => props.mode],
  () => { void load() },
  { immediate: true },
)

/** 沒有異常日卡時（疑似缺勤、或異常清單查無）用格子資料組一張空卡，只承載補卡 */
const displayCard = computed<AnomalyDayCard | null>(() => {
  if (card.value) return card.value
  if (loadState.value !== 'idle') return null
  return {
    id: props.cell.actual?.attendance_id ?? 0,
    employee_name: props.employeeName,
    employee_number: props.employeeNumber,
    date: props.cell.date,
    weekday: props.weekday,
    confirmed_action: props.cell.actual?.confirmed_action ?? null,
    items: [],
  }
})

const hhmm = (iso: string | null | undefined): string | null => (iso ? iso.slice(11, 16) : null)
const context = computed(() => {
  const actual = props.cell.actual
  return {
    punch_in: hhmm(actual?.punch_in),
    punch_out: hhmm(actual?.punch_out),
    has_leave: props.cell.leaves.some((leave) => leave.status === 'approved' && leave.is_full_day),
    estimated_deduction: (card.value?.items ?? []).reduce((sum, item) => sum + (item.estimated_deduction ?? 0), 0),
  }
})

const actions = computed<ResolveAction[]>(() => {
  if (props.mode === 'side-by-side') return ['punch']
  const both = !!props.cell.actual?.punch_in && !!props.cell.actual?.punch_out
  return both ? ['admin_accept', 'admin_waive'] : ['punch', 'admin_accept', 'admin_waive']
})

const handledNote = computed(() => {
  const actual = props.cell.actual
  return actual?.confirmed_action ? `${confirmedActionLabel(actual)}，需要的話可以改成另一個動作。` : ''
})

const cardRef = ref<InstanceType<typeof ResolveCard> | null>(null)
/** 補卡時間填了還沒送出（抽屜關閉、換筆前問） */
defineExpose({ isDirty: (): boolean => cardRef.value?.isDirty() ?? false })

const { resolving, resolve } = useResolveAnomaly(() => props.onChanged?.(), 'DayResolveSection.resolve')
function onResolve(payload: ResolvePayload): void {
  const id = props.cell.actual?.attendance_id ?? null
  void resolve({ employeeId: props.cell.employee_id, date: props.cell.date, attendanceId: id }, payload)
}
</script>

<style scoped>
.pdd-resolve h3 { margin: 0 0 var(--space-2); font-size: var(--text-sm); color: var(--el-text-color-secondary); }
.pdd-resolve__note { margin: 0 0 var(--space-2); color: var(--el-text-color-secondary); font-size: var(--text-sm); }
.pdd-resolve :deep(.resolve-card) { padding: 0; }
</style>
