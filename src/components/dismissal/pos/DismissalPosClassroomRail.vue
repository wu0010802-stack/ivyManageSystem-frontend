<script setup lang="ts">
/**
 * 左欄班級列表（T-005）：純展示＋選取，不決定「預設選哪一班」——那是
 * 父層 DismissalPosBoard 的責任（見 T-011 acceptance_criteria），本元件
 * 只如實反映 selectedId，避免元件內外兩份「目前選了誰」的狀態源。
 */

export interface DismissalPosClassroomRailItem {
  id: number
  name: string
  /** 待接送人數徽章；未提供則不顯示徽章（由父層決定要不要算/顯示）。 */
  count?: number
}

const props = defineProps<{
  classrooms: DismissalPosClassroomRailItem[]
  selectedId: number | null
}>()

const emit = defineEmits<{
  'update:selectedId': [id: number]
}>()

function selectClassroom(id: number) {
  emit('update:selectedId', id)
}
</script>

<template>
  <nav class="pos-classroom-rail" aria-label="班級列表">
    <button
      v-for="c in props.classrooms"
      :key="c.id"
      type="button"
      class="pos-classroom-rail__item"
      :class="{ 'is-active': c.id === props.selectedId }"
      :aria-pressed="c.id === props.selectedId"
      @click="selectClassroom(c.id)"
    >
      <span class="pos-classroom-rail__name">{{ c.name }}</span>
      <span
        v-if="c.count !== undefined"
        class="pos-classroom-rail__badge"
        :class="{ 'is-zero': c.count === 0 }"
      >
        {{ c.count }}
      </span>
    </button>
  </nav>
</template>

<style scoped>
.pos-classroom-rail {
  display: flex;
  flex-direction: column;
  gap: var(--space-1, 4px);
}

.pos-classroom-rail__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2, 8px);
  width: 100%;
  min-height: var(--touch-target-min, 44px);
  padding: var(--space-3, 12px);
  border: none;
  border-radius: var(--radius-md, 8px);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--text-lg, 16px);
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition:
    background-color var(--transition-fast, 0.15s ease),
    color var(--transition-fast, 0.15s ease);
}

.pos-classroom-rail__item:hover {
  background: var(--bg-color-soft);
  color: var(--text-primary);
}

.pos-classroom-rail__item.is-active {
  background: var(--brand-primary);
  color: #fff;
}

.pos-classroom-rail__badge {
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  border-radius: var(--radius-full, 9999px);
  background: var(--neutral-200);
  color: var(--text-secondary);
  font-size: var(--text-sm, 13px);
  font-weight: 700;
  display: grid;
  place-items: center;
  font-variant-numeric: tabular-nums;
}

.pos-classroom-rail__item.is-active .pos-classroom-rail__badge {
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
}

.pos-classroom-rail__badge.is-zero {
  opacity: 0.5;
}
</style>
