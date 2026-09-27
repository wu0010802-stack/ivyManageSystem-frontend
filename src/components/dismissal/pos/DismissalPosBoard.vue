<script setup lang="ts">
/**
 * 三欄 POS 整合容器（T-011）：組裝 T-005 左欄班級列、T-007 中欄學生 grid、
 * T-010 右欄佇列 panel，管理 selectedClassroomId 狀態（對齊 D6：只影響
 * 中欄，不影響右欄——右欄佇列完全由 useDismissalPosQueue 的 staging Map ＋
 * 外部傳入的 activeCalls 決定，不吃 selectedClassroomId）。
 *
 * 中欄卡片 quick-dispatch 只帶 { id, name }（見 DismissalPosStudentCardStudent），
 * 這裡補上 classroomId/classroomName（目前選中班級）再轉呼叫
 * useDismissalPosQueue 的 addToQueue（其 PosDispatchStudent 契約需要這兩個
 * 欄位），不是單純透傳。
 *
 * 請假／娃娃車（posbus01）：useDismissalPosDayStatus 取全園今日名單交給中欄算徽章；
 * 卡片 ⋮ 選單的補登／撤銷在這裡打 API，完成後 refresh 名單並 emit refresh-calls
 * 讓父層重抓接送通知（娃娃車補登是一筆 request_source=bus 的 completed call）。
 *
 * 範圍決策：左欄 count 徽章（T-005 選配欄位）本輪未串接——要正確算出「每班
 * unpicked 人數」需要對所有班級（非僅選中班級）各自跑一次 buildRoster +
 * useStudentPosStatus，屬於額外範圍，acceptance_criteria 未要求，先不做，
 * 如需要可另拆 task。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import DismissalPosClassroomRail from './DismissalPosClassroomRail.vue'
import DismissalPosStudentGrid from './DismissalPosStudentGrid.vue'
import DismissalPosQueuePanel from './DismissalPosQueuePanel.vue'
import type { DismissalPosStudentCardStudent, PosLeaveType } from './DismissalPosStudentCard.vue'
import type { RosterStudentInput, ClassroomInput } from '@/composables/useDismissalRoster'
import type { DismissalCallView } from '@/composables/useDismissalUrgency'
import { useDismissalPosQueue } from '@/composables/useDismissalPosQueue'
import { useDismissalReservationChime } from '@/composables/useDismissalReservationChime'
import { useDismissalPosDayStatus } from '@/composables/useDismissalPosDayStatus'
import { markPosBus, markPosLeave, unmarkPosBus, unmarkPosLeave } from '@/api/dismissalCalls'
import { friendlyError } from '@/utils/errorMessages'

const props = defineProps<{
  classrooms: ClassroomInput[]
  students: RosterStudentInput[]
  /** 今日 dismissal calls：同時供中欄 roster 分組與右欄 active 佇列使用（不重複打兩支 API）。 */
  calls: DismissalCallView[]
}>()

const emit = defineEmits<{
  /** 補登／撤銷娃娃車後通知父層重抓今日接送通知 */
  'refresh-calls': []
}>()

const selectedClassroomId = ref<number | null>(null)

// 掛載後（或 classrooms 才非同步到位時）若尚未選過班級，預設選第一筆——
// 對齊 acceptance_criteria「掛載後若 classrooms 非空，selectedId 自動等於
// 第一筆班級 id」；用 watch(immediate) 而非只在 onMounted 判斷一次，
// 也能處理 classrooms 是父層非同步 fetch 後才補上的情境。
watch(
  () => props.classrooms,
  list => {
    if (selectedClassroomId.value == null && list.length > 0) {
      selectedClassroomId.value = list[0].id
    }
  },
  { immediate: true },
)

const classroomRailItems = computed(() =>
  props.classrooms.map(c => ({ id: c.id, name: c.name })),
)

const activeCalls = computed(() => props.calls)
const { queue, addToQueue, cancel, confirmProxyPickup, confirmingIds } =
  useDismissalPosQueue(activeCalls)
// 右欄家長預約倒數 10 / 5 分鐘柔和提示（見 useDismissalReservationChime.ts）。
useDismissalReservationChime(activeCalls)

const { dayStatus, refresh: refreshDayStatus } = useDismissalPosDayStatus()
const busyIds = ref<Set<number>>(new Set())

/** 同一學生同時只允許一個補登／撤銷請求；完成後重抓名單與（視需要）接送通知。 */
async function runMark(
  studentId: number,
  action: () => Promise<unknown>,
  { success, failure, refreshCalls }: { success: string; failure: string; refreshCalls: boolean },
) {
  if (busyIds.value.has(studentId)) return
  busyIds.value = new Set(busyIds.value).add(studentId)
  try {
    await action()
    ElMessage.success(success)
  } catch (e) {
    ElMessage.error(friendlyError(failure, e))
  } finally {
    const next = new Set(busyIds.value)
    next.delete(studentId)
    busyIds.value = next
    void refreshDayStatus()
    if (refreshCalls) emit('refresh-calls')
  }
}

function handleMarkBus(student: DismissalPosStudentCardStudent) {
  void runMark(student.id, () => markPosBus({ student_id: student.id }), {
    success: `已標記 ${student.name} 被娃娃車接走`,
    failure: '標記娃娃車接走失敗',
    refreshCalls: true,
  })
}

function handleUnmarkBus(student: DismissalPosStudentCardStudent, callId: number) {
  void runMark(student.id, () => unmarkPosBus(callId), {
    success: `已撤銷 ${student.name} 的娃娃車接走標記`,
    failure: '撤銷娃娃車接走標記失敗',
    refreshCalls: true,
  })
}

function handleMarkLeave(student: DismissalPosStudentCardStudent, leaveType: PosLeaveType) {
  void runMark(student.id, () => markPosLeave({ student_id: student.id, leave_type: leaveType }), {
    success: `已標記 ${student.name} 今天${leaveType}`,
    failure: '標記請假失敗',
    refreshCalls: false,
  })
}

function handleUnmarkLeave(student: DismissalPosStudentCardStudent) {
  void runMark(student.id, () => unmarkPosLeave(student.id), {
    success: `已撤銷 ${student.name} 的請假標記`,
    failure: '撤銷請假標記失敗',
    refreshCalls: false,
  })
}

function handleQuickDispatch(student: DismissalPosStudentCardStudent) {
  if (selectedClassroomId.value == null) return
  const classroom = props.classrooms.find(c => c.id === selectedClassroomId.value)
  addToQueue({
    id: student.id,
    name: student.name,
    classroomId: selectedClassroomId.value,
    classroomName: classroom?.name ?? '',
  })
}
</script>

<template>
  <div class="pos-board">
    <DismissalPosClassroomRail
      class="pos-board__rail"
      :classrooms="classroomRailItems"
      :selected-id="selectedClassroomId"
      @update:selected-id="selectedClassroomId = $event"
    />
    <DismissalPosStudentGrid
      class="pos-board__grid"
      :selected-classroom-id="selectedClassroomId"
      :students="students"
      :classrooms="classrooms"
      :calls="calls"
      :day-status="dayStatus"
      :busy-ids="busyIds"
      @quick-dispatch="handleQuickDispatch"
      @mark-bus="handleMarkBus"
      @mark-leave="handleMarkLeave"
      @unmark-bus="handleUnmarkBus"
      @unmark-leave="handleUnmarkLeave"
    />
    <DismissalPosQueuePanel
      class="pos-board__queue"
      :items="queue"
      :confirming-ids="confirmingIds"
      @cancel="cancel"
      @confirm-pickup="confirmProxyPickup"
    />
  </div>
</template>

<style scoped>
.pos-board {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 200px 1fr 280px;
}

.pos-board__rail {
  border-right: 1px solid var(--border-color);
  background: var(--surface-color);
  overflow-y: auto;
  padding: var(--space-3, 12px);
}

.pos-board__grid {
  overflow-y: auto;
  padding: var(--space-5, 20px);
}

.pos-board__queue {
  border-left: 1px solid var(--border-color);
  background: var(--surface-color);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

@media (max-width: 1023.98px) {
  .pos-board {
    grid-template-columns: 160px 1fr 240px;
  }
}
</style>
