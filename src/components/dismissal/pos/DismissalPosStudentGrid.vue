<script setup lang="ts">
/**
 * 中欄容器（T-007）：吃 selectedClassroomId + 學生清單 + 今日 calls，重用既有
 * src/composables/useDismissalRoster.ts 的 buildRoster 取得『該班在籍學生』
 * 分組（不重寫分班/去重邏輯），再用 T-002 useStudentPosStatus 算出每位學生的
 * status/sortWeight 排序後渲染 DismissalPosStudentCard grid（auto-fill 卡片最小寬度
 * 148px，2026-08-22 密度調整比照 docs/mockups/2026-08-22-dismissal-pos-card-density.html
 * 縮小，同寬度下可多排一欄）。
 *
 * 範圍註記：buildRoster 同時算得出「進行中通知」(notifying)，但這裡沒有拿來讓
 * 卡片額外降階顯示——T-002 的 4 值 status 本身就把 pending/acknowledged 歸在
 * unpicked（T-002 acceptance_criteria 明定），T-006 卡片契約也只吃這 4 值，
 * 硬塞一個新視覺狀態會擴大 T-006 的既定範圍。實際的重複發起防線在 T-003
 * useDismissalPosQueue.addToQueue（已重用同一份 activeCallStudentIds 擋掉），
 * 所以功能上不會真的送出重複通知，只是卡片本身在等待老師確認期間仍顯示可點擊、
 * 沒有專屬「通知中」視覺。如需要可另開 task 補上。
 */
import { computed } from 'vue'
import DismissalPosStudentCard, {
  type DismissalPosStudentCardStudent,
} from './DismissalPosStudentCard.vue'
import {
  buildRoster,
  type RosterStudentInput,
  type RosterCallInput,
  type ClassroomInput,
} from '@/composables/useDismissalRoster'
import { useStudentPosStatus, type PosStudentCallInput } from '@/composables/useStudentPosStatus'
import type { PosStudentStatus } from '@/types/dismissalPos'

const props = defineProps<{
  selectedClassroomId: number | null
  students: RosterStudentInput[]
  classrooms: ClassroomInput[]
  calls: RosterCallInput[]
}>()

const emit = defineEmits<{
  'quick-dispatch': [student: DismissalPosStudentCardStudent]
}>()

interface GridCard {
  student: DismissalPosStudentCardStudent
  status: PosStudentStatus
  sortWeight: number
}

/** 直接重用既有 buildRoster 做分班/去重，不重新實作。 */
const roster = computed(() => buildRoster(props.students, props.classrooms, props.calls))

/** 只取目前選中班級那一組，依 T-002 sortWeight 排序（unpicked 在前）。 */
const cards = computed<GridCard[]>(() => {
  if (props.selectedClassroomId == null) return []
  const group = roster.value.find(g => g.classroomId === props.selectedClassroomId)
  if (!group) return []
  return group.students
    .map((s) => {
      const { status, sortWeight } = useStudentPosStatus(
        { id: s.id },
        props.calls as PosStudentCallInput[],
      )
      return { student: { id: s.id, name: s.name }, status, sortWeight }
    })
    .sort((a, b) => a.sortWeight - b.sortWeight)
})

function handleQuickDispatch(student: DismissalPosStudentCardStudent) {
  emit('quick-dispatch', student)
}
</script>

<template>
  <div class="pos-student-grid">
    <p v-if="cards.length === 0" class="pos-student-grid__empty">這個班級目前沒有在籍學生</p>
    <DismissalPosStudentCard
      v-for="card in cards"
      :key="card.student.id"
      :student="card.student"
      :status="card.status"
      @quick-dispatch="handleQuickDispatch"
    />
  </div>
</template>

<style scoped>
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
