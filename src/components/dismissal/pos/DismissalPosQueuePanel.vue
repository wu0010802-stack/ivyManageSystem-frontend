<script setup lang="ts">
/**
 * 右欄容器（T-010）：吃 T-003 useDismissalPosQueue 輸出的合併排序清單，
 * 渲染 DismissalPosQueueCard 列表，swipe cancel 事件原樣轉呼叫端。
 *
 * 進場/離場動畫沿用既有 .dcall-list-* class 命名慣例（src/views/portal/PortalDismissalCallsView.vue
 * 既有的 TransitionGroup name="dcall-list"，數值逐字一致）——Vue scoped style 不跨元件套用，
 * 這裡照同一份規則在本檔重新定義，維持視覺與命名一致，不是重新發明一套动画。
 *
 * 「現在時間」重用既有 useDismissalUrgency.useNowClock（每 30 秒前進一次），
 * 不自己另開 setInterval，供子卡片的 ETA 相對文案（reservation 未抵達）活著跳。
 */
import { useNowClock } from '@/composables/useDismissalUrgency'
import type { PosQueueItem } from '@/types/dismissalPos'
import DismissalPosQueueCard from './DismissalPosQueueCard.vue'

defineProps<{
  items: PosQueueItem[]
}>()

const emit = defineEmits<{
  cancel: [item: PosQueueItem]
}>()

const { now } = useNowClock()
</script>

<template>
  <div class="pos-queue-panel">
    <div v-if="items.length === 0" class="pos-queue-panel__empty">
      目前沒有進行中的接送<br />
      點選中間學生卡片即可開始
    </div>
    <TransitionGroup v-else tag="div" name="dcall-list" class="pos-queue-panel__list">
      <DismissalPosQueueCard
        v-for="item in items"
        :key="item.id"
        :item="item"
        :now="now"
        @cancel="emit('cancel', $event)"
      />
    </TransitionGroup>
  </div>
</template>

<style scoped>
.pos-queue-panel {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.pos-queue-panel__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  padding: var(--space-3, 12px);
}

.pos-queue-panel__empty {
  padding: var(--space-6, 32px) var(--space-4, 16px);
  text-align: center;
  color: var(--text-tertiary);
  font-size: var(--text-sm, 13px);
}

/* 卡片進場 / 移除 / 重排序動畫（沿用 src/views/portal/PortalDismissalCallsView.vue 既有 dcall-list-* 命名慣例） */
.dcall-list-enter-active {
  transition:
    opacity 0.24s cubic-bezier(0.25, 1, 0.5, 1),
    transform 0.24s cubic-bezier(0.25, 1, 0.5, 1);
}
.dcall-list-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}
.dcall-list-move {
  transition: transform 0.24s cubic-bezier(0.25, 1, 0.5, 1);
}
.dcall-list-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.dcall-list-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .dcall-list-enter-active,
  .dcall-list-leave-active,
  .dcall-list-move {
    transition: opacity 0.15s linear;
  }
  .dcall-list-enter-from,
  .dcall-list-leave-to {
    transform: none;
  }
}
</style>
