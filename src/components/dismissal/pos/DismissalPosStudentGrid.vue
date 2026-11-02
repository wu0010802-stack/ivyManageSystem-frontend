<script setup lang="ts">
/**
 * 中欄容器（T-007）：吃 selectedClassroomId + 學生清單 + 今日 calls，重用既有
 * src/composables/useDismissalRoster.ts 的 buildRoster 取得『該班在籍學生』
 * 分組（不重寫分班/去重邏輯），再用 T-002 useStudentPosStatus 算出每位學生的
 * status/sortWeight 排序後渲染 DismissalPosStudentCard grid（auto-fill 卡片最小寬度
 * 148px，2026-08-22 密度調整比照 docs/mockups/2026-08-22-dismissal-pos-card-density.html
 * 縮小，同寬度下可多排一欄）。
 *
 * 2026-11-02：
 * - 「通知中」視覺：notifyingIds（右欄倒數中＋已送出的學生）傳給卡片，原本 T-007 註記的
 *   「等待老師確認期間卡片仍顯示可點擊、沒有專屬通知中視覺」補上。
 * - 跨班搜尋：searchQuery 非空時改列全園姓名符合的學生（只列有已知班級者，建立通知需要
 *   classroom_id），卡片帶班級名。家長到櫃台報孩子名字時不用先猜是哪一班。
 * - 欄首顯示目前班級（或搜尋字）與待接送／已離園／請假人數。
 */
import { computed } from 'vue'
import DismissalPosStudentCard, {
  type DismissalPosStudentCardStudent,
  type PosLeaveType,
} from './DismissalPosStudentCard.vue'
import {
  buildRoster,
  type RosterStudentInput,
  type RosterCallInput,
  type ClassroomInput,
} from '@/composables/useDismissalRoster'
import { useStudentPosStatus, type PosStudentCallInput } from '@/composables/useStudentPosStatus'
import type { PosDayStatus, PosStudentStatus, PosStudentStatusDetail } from '@/types/dismissalPos'

const props = defineProps<{
  selectedClassroomId: number | null
  students: RosterStudentInput[]
  classrooms: ClassroomInput[]
  calls: RosterCallInput[]
  /** 全園今日請假／已上放學車（posbus01）；未傳＝只看接送通知 */
  dayStatus?: PosDayStatus
  /** 補登／撤銷請求進行中的學生 id */
  busyIds?: ReadonlySet<number>
  /** 右欄佇列中（倒數中或已通知、尚未放學）的學生 id */
  notifyingIds?: ReadonlySet<number>
  /** 跨班姓名搜尋；空字串＝只看選中班級 */
  searchQuery?: string
}>()

const emit = defineEmits<{
  'quick-dispatch': [student: DismissalPosStudentCardStudent]
  'mark-bus': [student: DismissalPosStudentCardStudent]
  'mark-leave': [student: DismissalPosStudentCardStudent, leaveType: PosLeaveType]
  'unmark-bus': [student: DismissalPosStudentCardStudent, callId: number]
  'unmark-leave': [student: DismissalPosStudentCardStudent]
}>()

interface GridCard {
  student: DismissalPosStudentCardStudent
  status: PosStudentStatus
  sortWeight: number
  detail: PosStudentStatusDetail
  classroomLabel: string
}

const query = computed(() => (props.searchQuery ?? '').trim())
const isSearching = computed(() => query.value.length > 0)

/** 直接重用既有 buildRoster 做分班/去重/姓名比對，不重新實作。 */
const roster = computed(() => buildRoster(props.students, props.classrooms, props.calls, query.value))

const toCard = (s: { id: number; name: string }, classroomLabel: string): GridCard => {
  const { status, sortWeight, detail } = useStudentPosStatus(
    { id: s.id },
    props.calls as PosStudentCallInput[],
    props.dayStatus,
  )
  return { student: { id: s.id, name: s.name }, status, sortWeight, detail, classroomLabel }
}

/** 一般模式只取選中班級；搜尋模式列出全園符合者。皆依 T-002 sortWeight 排序（unpicked 在前）。 */
const cards = computed<GridCard[]>(() => {
  if (isSearching.value) {
    return roster.value
      .filter(g => g.kind === 'classroom')
      .flatMap(g => g.students.map(s => toCard(s, g.classroomName)))
      .sort((a, b) => a.sortWeight - b.sortWeight)
  }
  if (props.selectedClassroomId == null) return []
  const group = roster.value.find(g => g.classroomId === props.selectedClassroomId)
  if (!group) return []
  return group.students
    .map(s => toCard(s, ''))
    .sort((a, b) => a.sortWeight - b.sortWeight)
})

const heading = computed(() => {
  if (isSearching.value) return `搜尋「${query.value}」`
  return props.classrooms.find(c => c.id === props.selectedClassroomId)?.name ?? ''
})

const counts = computed(() => {
  const c = { waiting: 0, notifying: 0, left: 0, leave: 0 }
  for (const card of cards.value) {
    if (card.status === 'unpicked') {
      c.waiting += 1
      if (props.notifyingIds?.has(card.student.id)) c.notifying += 1
    } else if (card.status === 'on_leave') c.leave += 1
    else c.left += 1
  }
  return c
})

const emptyText = computed(() =>
  isSearching.value ? `找不到姓名含「${query.value}」的在籍學生` : '這個班級目前沒有在籍學生',
)

function handleQuickDispatch(student: DismissalPosStudentCardStudent) {
  emit('quick-dispatch', student)
}
</script>

<template>
  <div class="pos-student-grid-wrap">
    <div v-if="heading && cards.length" class="pos-student-grid__head">
      <h2 class="pos-student-grid__title">{{ heading }}</h2>
      <p class="pos-student-grid__counts" aria-live="polite">
        待接送 <strong>{{ counts.waiting }}</strong><template v-if="counts.notifying">（通知中 {{ counts.notifying }}）</template>
        <span aria-hidden="true">·</span> 已離園 <strong>{{ counts.left }}</strong>
        <span aria-hidden="true">·</span> 請假 <strong>{{ counts.leave }}</strong>
      </p>
    </div>
    <div class="pos-student-grid">
      <p v-if="cards.length === 0" class="pos-student-grid__empty">{{ emptyText }}</p>
      <DismissalPosStudentCard
        v-for="card in cards"
        :key="card.student.id"
        :student="card.student"
        :status="card.status"
        :detail="card.detail"
        :busy="busyIds?.has(card.student.id) ?? false"
        :notifying="notifyingIds?.has(card.student.id) ?? false"
        :classroom-label="card.classroomLabel"
        @quick-dispatch="handleQuickDispatch"
        @mark-bus="emit('mark-bus', $event)"
        @mark-leave="(student, leaveType) => emit('mark-leave', student, leaveType)"
        @unmark-bus="(student, callId) => emit('unmark-bus', student, callId)"
        @unmark-leave="emit('unmark-leave', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.pos-student-grid__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-1) var(--space-4);
  margin-bottom: var(--space-3);
}

.pos-student-grid__title {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.pos-student-grid__counts {
  margin: 0;
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-1) var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.pos-student-grid__counts strong {
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.pos-student-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  align-items: start;
  gap: var(--space-3, 12px);
}

.pos-student-grid__empty {
  grid-column: 1 / -1;
  padding: var(--space-6, 24px) var(--space-4, 16px);
  text-align: center;
  color: var(--text-tertiary);
  font-size: var(--text-sm, 13px);
}
</style>
