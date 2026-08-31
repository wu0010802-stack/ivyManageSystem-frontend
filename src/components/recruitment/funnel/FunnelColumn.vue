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
    <div v-if="cards.length === 0" class="funnel-column-empty">{{ emptyHint }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
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

/* 四欄原本共用「尚無此階段卡片」一句，說了「沒有」卻沒說「然後呢」——而全空正是
 * 新使用者第一次打開這頁看到的畫面。改為逐階段說明怎麼讓卡片出現在這一欄。 */
const EMPTY_HINTS: Record<Stage, string> = {
  visited: '還沒有訪視紀錄，用右上角的「新增訪視」建立第一筆。',
  deposited: '家長完成預繳後，把「已訪視」的卡片拖到這一欄。',
  enrolled: '家長完成註冊後，把「已預繳」的卡片拖到這一欄。',
  withdrawn: '退預繳或退註冊的紀錄會落在這一欄。',
}

const emptyHint = computed(() => EMPTY_HINTS[props.stage] ?? '此階段目前沒有卡片。')

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
  background: var(--bg-color-soft);
  border-top: 3px solid var(--accent);
  border-radius: 4px;
  min-height: 400px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  flex: 1;
  position: relative;
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
/* 空狀態蓋在拖曳區（flex:1 的 __body）上垂直置中；原本作為 body 的兄弟節點
 * 被推到欄底。pointer-events:none 讓拖入空欄不被擋。 */
.funnel-column-empty {
  position: absolute;
  inset: 52px 12px 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--text-tertiary);
  pointer-events: none;
}
.funnel-card-ghost {
  opacity: 0.3;
}
.funnel-card-drag {
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2);
}
</style>
