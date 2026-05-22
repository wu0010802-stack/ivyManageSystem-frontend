<template>
  <div class="funnel-column" :style="{ '--accent': accentColor }">
    <div class="funnel-column__header">
      <span class="funnel-column__title">{{ title }}</span>
      <el-badge :value="cards.length" :max="99" />
    </div>
    <draggable
      :model-value="cards"
      group="funnel"
      item-key="visit_id"
      :animation="200"
      ghost-class="funnel-card-ghost"
      drag-class="funnel-card-drag"
      class="funnel-column__body"
      @change="onDragChange"
    >
      <template #item="{ element }">
        <FunnelCard
          :card="element"
          :can-drag="canDragSet.has(element.visit_id)"
          :is-pending="pendingSet?.has(element.visit_id) ?? false"
          @click="$emit('card-click', element)"
        />
      </template>
    </draggable>
    <div v-if="cards.length === 0" class="funnel-column-empty">尚無此階段卡片</div>
  </div>
</template>

<script setup lang="ts">
import draggable from 'vuedraggable'
import { ElBadge } from 'element-plus'
import FunnelCard from './FunnelCard.vue'
import type { FunnelCardData, Stage } from '@/stores/recruitmentFunnel'

const props = defineProps<{
  stage: Stage
  cards: FunnelCardData[]
  title: string
  accentColor: string
  canDragSet: Set<number>
  pendingSet?: Set<number>
}>()

const emit = defineEmits<{
  (e: 'card-click', card: FunnelCardData): void
  (e: 'transition-attempt', payload: { visitId: number; fromStage: Stage; toStage: Stage }): void
}>()

interface DragChangeEvent {
  added?: { element: FunnelCardData; newIndex: number }
}

function onDragChange(evt: DragChangeEvent) {
  if (evt.added) {
    const fromStage = evt.added.element.current_stage
    if (fromStage !== props.stage) {
      emit('transition-attempt', {
        visitId: evt.added.element.visit_id,
        fromStage,
        toStage: props.stage,
      })
    }
  }
}
</script>

<style scoped>
.funnel-column {
  background: #f8f9fa;
  border-top: 3px solid var(--accent);
  border-radius: 4px;
  min-height: 400px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  flex: 1;
}
.funnel-column__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.funnel-column__title {
  font-weight: 600;
}
.funnel-column__body {
  flex: 1;
  min-height: 200px;
}
.funnel-column-empty {
  text-align: center;
  color: #ccc;
  padding: 32px 0;
}
.funnel-card-ghost {
  opacity: 0.3;
}
.funnel-card-drag {
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2);
}
</style>
