<template>
  <div class="fee-seg" role="group" :aria-label="label" :data-test="testId">
    <button
      v-for="opt in options"
      :key="opt.key"
      type="button"
      class="fee-seg__btn"
      :class="{ 'fee-seg__btn--active': opt.key === modelValue }"
      :aria-pressed="opt.key === modelValue"
      :data-test="`${testId}-${opt.key}`"
      @click="onPick(opt.key)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * 檢視內的「看哪一塊」切換（月表／逐筆、代收／存摺）。
 *
 * 刻意不用 el-segmented：改版前主導航、次層檢視、檢視模式三層都是同款
 * el-segmented pill，看起來一樣重，使用者分不出層級。此元件是最輕的一層
 * （外框線 + 淺色作用態），與主導航的底線頁籤、次層的深色頁籤明確分層。
 */
import type { FeeWorkspaceViewDef } from './feesNavigation'

defineProps<{
  options: FeeWorkspaceViewDef[]
  modelValue: string
  label: string
  testId: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

function onPick(key: string) {
  emit('update:modelValue', key)
}
</script>

<style scoped>
.fee-seg {
  display: inline-flex;
  border: 1px solid var(--el-border-color);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--surface-color);
}

.fee-seg__btn {
  min-height: 30px;
  padding: 0 var(--space-3);
  border: none;
  background: none;
  font: inherit;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.fee-seg__btn + .fee-seg__btn {
  border-left: 1px solid var(--el-border-color);
}

.fee-seg__btn:hover {
  color: var(--text-primary);
}

.fee-seg__btn--active,
.fee-seg__btn--active:hover {
  background: var(--bg-color-soft);
  color: var(--text-primary);
  font-weight: 600;
}
</style>
