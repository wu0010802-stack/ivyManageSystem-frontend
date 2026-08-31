<script setup lang="ts">
import type { NextStep } from '../nextStep'

defineProps<{ items: NextStep[] }>()

const TAG_META: Record<string, { label: string; type: 'danger' | 'warning' | 'info' }> = {
  exceptions: { label: '例外', type: 'danger' },
  'year-end-sign': { label: '年終', type: 'info' },
  'appraisal-sign': { label: '考核', type: 'info' },
  payout: { label: '發放', type: 'info' },
  'create-appraisal': { label: '考核', type: 'warning' },
  'create-year-end': { label: '年終', type: 'warning' },
}
function tagMeta(key: string) {
  return TAG_META[key] ?? { label: '待辦', type: 'info' as const }
}
</script>

<template>
  <div class="wb-todo-list" data-test="wb-todo-list">
    <ul v-if="items.length > 0" class="wb-todo-list__ul">
      <li
        v-for="item in items"
        :key="item.key"
        class="wb-todo-list__item"
        :data-test="`wb-todo-item-${item.key}`"
      >
        <el-tag size="small" :type="tagMeta(item.key).type">{{ tagMeta(item.key).label }}</el-tag>
        <div class="wb-todo-list__text">
          <p class="wb-todo-list__title">{{ item.title }}</p>
          <p class="wb-todo-list__reason">{{ item.reason }}</p>
        </div>
        <router-link v-if="item.to" :to="item.to">
          <el-button size="small">{{ item.ctaLabel }}</el-button>
        </router-link>
      </li>
    </ul>
    <p v-else class="wb-todo-list__empty" data-test="wb-todo-list-empty">✓ 沒有待處理事項</p>
  </div>
</template>

<style scoped>
.wb-todo-list__ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.wb-todo-list__item { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) 0; border-bottom: 1px solid var(--el-border-color-lighter); }
.wb-todo-list__item:last-child { border-bottom: none; }
.wb-todo-list__text { flex: 1; min-width: 0; }
.wb-todo-list__title { margin: 0; font-weight: 600; font-size: var(--text-sm); }
.wb-todo-list__reason { margin: 2px 0 0; font-size: var(--text-xs); color: var(--text-secondary); }
.wb-todo-list__empty { color: var(--el-color-success); font-size: var(--text-sm); margin: 0; padding: var(--space-3) 0; }
</style>
