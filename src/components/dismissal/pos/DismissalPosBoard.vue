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
 * 2026-11-02：
 * - 左欄 count 徽章接上：每班「還在園內等接送」（useStudentPosStatus＝unpicked）人數，
 *   櫃台一眼看出哪幾班還有孩子沒走。
 * - 中欄上方加跨班姓名搜尋；搜尋結果可能不在選中班級，所以 quick-dispatch 改用學生自己
 *   的 classroom_id 建立通知（不再假設＝選中班級）。
 * - notifyingIds（右欄倒數中＋已送出）傳給中欄卡片顯示「通知中」。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import DismissalPosClassroomRail from './DismissalPosClassroomRail.vue'
import DismissalPosStudentGrid from './DismissalPosStudentGrid.vue'
import DismissalPosQueuePanel from './DismissalPosQueuePanel.vue'
import type { DismissalPosStudentCardStudent, PosLeaveType } from './DismissalPosStudentCard.vue'
import { buildRoster, type RosterStudentInput, type ClassroomInput } from '@/composables/useDismissalRoster'
import { useStudentPosStatus, type PosStudentCallInput } from '@/composables/useStudentPosStatus'
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

const searchQuery = ref('')

const activeCalls = computed(() => props.calls)
const { queue, addToQueue, cancel, confirmProxyPickup, confirmingIds } =
  useDismissalPosQueue(activeCalls)
// 右欄家長預約倒數 10 / 5 分鐘柔和提示（見 useDismissalReservationChime.ts）。
useDismissalReservationChime(activeCalls)

const { dayStatus, refresh: refreshDayStatus } = useDismissalPosDayStatus()

/** 右欄還沒結束的學生（倒數中＋已送出未放學）：中欄卡片顯示「通知中」並停用再點。 */
const notifyingIds = computed(
  () => new Set(queue.value.filter(item => item.phase !== 'done').map(item => item.studentId)),
)

/** 每班還在園內等接送的人數（請假、娃娃車、已被接走都不算）。 */
const waitingCountByClassroom = computed(() => {
  const counts = new Map<number, number>()
  for (const group of buildRoster(props.students, props.classrooms, props.calls)) {
    if (group.kind !== 'classroom' || group.classroomId == null) continue
    let n = 0
    for (const s of group.students) {
      const { status } = useStudentPosStatus(
        { id: s.id },
        props.calls as PosStudentCallInput[],
        dayStatus.value,
      )
      if (status === 'unpicked') n += 1
    }
    counts.set(group.classroomId, n)
  }
  return counts
})

const classroomRailItems = computed(() =>
  props.classrooms.map(c => ({ id: c.id, name: c.name, count: waitingCountByClassroom.value.get(c.id) ?? 0 })),
)

function selectClassroom(id: number) {
  selectedClassroomId.value = id
  searchQuery.value = ''
}
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
    void refreshDayStatus({ force: true })
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
  // 搜尋結果可能不在選中班級：一律用學生自己的班級建立通知。
  const classroomId = props.students.find(s => s.id === student.id)?.classroom_id ?? selectedClassroomId.value
  if (classroomId == null) return
  const classroom = props.classrooms.find(c => c.id === classroomId)
  addToQueue({
    id: student.id,
    name: student.name,
    classroomId,
    classroomName: classroom?.name ?? '',
  })
}
</script>

<template>
  <div class="pos-board">
    <DismissalPosClassroomRail
      class="pos-board__rail"
      :classrooms="classroomRailItems"
      :selected-id="searchQuery.trim() ? null : selectedClassroomId"
      @update:selected-id="selectClassroom"
    />
    <section class="pos-board__grid" aria-label="學生">
      <el-input
        v-model="searchQuery"
        class="pos-board__search"
        placeholder="搜尋學生姓名（全園）"
        aria-label="搜尋學生姓名"
        :prefix-icon="Search"
        clearable
      />
      <DismissalPosStudentGrid
        :selected-classroom-id="selectedClassroomId"
        :students="students"
        :classrooms="classrooms"
        :calls="calls"
        :day-status="dayStatus"
        :busy-ids="busyIds"
        :notifying-ids="notifyingIds"
        :search-query="searchQuery"
        @quick-dispatch="handleQuickDispatch"
        @mark-bus="handleMarkBus"
        @mark-leave="handleMarkLeave"
        @unmark-bus="handleUnmarkBus"
        @unmark-leave="handleUnmarkLeave"
      />
    </section>
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

.pos-board__search {
  max-width: 22rem;
  margin-bottom: var(--space-4);
}

.pos-board__queue {
  border-left: 1px solid var(--border-color);
  background: var(--surface-color);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 版面依「看板實際可用寬度」切換，不看視窗寬（2026-11-02）：810 平板直式＋展開的
   後台側欄只剩約 550px，舊的視窗斷點仍給三欄，中欄被擠到 45px、班名直排。
   容器由 DismissalQueueView 的 .pos-board-host 提供（container-type 只掛在那層，
   掛在整頁會把頁內未 teleport 的對話框困住，同 main.css 容器卡註解的道理）。 */
@container dismissal-board (max-width: 1000px) {
  .pos-board {
    grid-template-columns: 150px 1fr 230px;
  }
}

/* 窄：三欄塞不下，改單欄堆疊：班級列變橫向捲動的 chip 列；接送佇列提到學生卡片之上——
   點學生後有 5 秒撤銷倒數，佇列若排在一長串學生卡片後面就看不到也來不及按。 */
@container dismissal-board (max-width: 700px) {
  .pos-board {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .pos-board > .pos-board__rail {
    order: 0;
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0 0 var(--space-2);
    border-right: none;
    background: transparent;
    -webkit-overflow-scrolling: touch;
  }

  .pos-board__rail :deep(.pos-classroom-rail__item) {
    flex: 0 0 auto;
    width: auto;
    white-space: nowrap;
    font-size: var(--text-base);
  }

  .pos-board > .pos-board__queue {
    order: 1;
    max-height: 45vh;
    max-height: 45dvh;
    border-left: none;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
  }

  .pos-board > .pos-board__grid {
    order: 2;
    overflow: visible;
    padding: 0;
  }

  .pos-board__search {
    max-width: none;
  }
}
</style>
