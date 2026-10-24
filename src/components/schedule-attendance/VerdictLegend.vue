<template>
  <ul class="verdict-legend" aria-label="圖例" data-test="verdict-legend">
    <li v-for="kind in VERDICT_KINDS" :key="kind" class="verdict-legend__item" :data-test="`verdict-legend-${kind}`">
      <i class="verdict-shape" :class="`verdict-shape--${kind}`" aria-hidden="true" />{{ VERDICT_KIND_LABELS[kind] }}
    </li>
    <li v-if="showLeave" class="verdict-legend__item" data-test="verdict-legend-leave">
      <i class="verdict-shape verdict-shape--leave" aria-hidden="true" />請假
    </li>
    <li v-if="showLeftover" class="verdict-legend__item" data-test="verdict-legend-leftover">
      <i class="verdict-shape verdict-shape--leftover" aria-hidden="true" />{{ LEFTOVER_DOT_LABEL }}
    </li>
  </ul>
</template>

<script setup lang="ts">
/**
 * 排班與出勤格子的狀態圖例：形狀＋文字，順序同 VERDICT_KINDS。
 * 形狀 class（.verdict-shape--*）是全域的（assets/main.css），週格子與月格子用同一組，圖例才不會和格子分叉。
 * `showLeave`：月格子另外畫「請假」點，圖例要多一項。
 * `showLeftover`：月格子有封存時沒處理的格子（中性灰三角）時，圖例多一項說明。
 */
import { LEFTOVER_DOT_LABEL, VERDICT_KIND_LABELS, VERDICT_KINDS } from '@/utils/scheduleAttendanceGrid'

defineProps<{ showLeave?: boolean; showLeftover?: boolean }>()
</script>

<style scoped>
.verdict-legend { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-3); margin: 0; padding: 0; list-style: none; font-size: var(--text-xs); color: var(--el-text-color-secondary); }
.verdict-legend__item { display: inline-flex; align-items: center; gap: var(--space-1); white-space: nowrap; }
</style>
