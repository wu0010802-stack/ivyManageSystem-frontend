<script setup>
import { computed } from 'vue'

/**
 * 離線佇列徽章 — 顯示「N 筆待同步」狀態。
 *
 * 狀態：
 *  - pending: 待同步（橘）
 *  - failed: 同步失敗（紅）
 *
 * Phase 6 會由 useOfflineQueue 注入 count + status。
 */
const props = defineProps({
  count: { type: Number, required: true },
  status: {
    type: String,
    default: 'pending',
    validator: (v) => ['pending', 'failed'].includes(v),
  },
})

defineEmits(['click'])

const display = computed(() => (props.count > 99 ? '99+' : String(props.count)))
const visible = computed(() => props.count > 0)
</script>

<template>
  <button
    v-if="visible"
    type="button"
    :class="['badge', `badge--${status}`]"
    data-test="badge-root"
    @click="$emit('click')"
  >
    <span class="badge__icon" aria-hidden="true">
      {{ status === 'failed' ? '⚠' : '⏳' }}
    </span>
    <span class="badge__text">{{ display }} 筆待同步</span>
  </button>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--color-warning-soft);
  color: #c2410c;
  border: 1px solid #fed7aa;
  border-radius: 999px;
  font-size: var(--text-xs);
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition-base);
  -webkit-tap-highlight-color: transparent;
}

.badge:hover {
  background: #ffedd5;
}

.badge--failed {
  background: var(--color-danger-soft);
  color: var(--color-danger-darker);
  border-color: var(--color-danger-soft);
}

.badge--failed:hover {
  background: var(--color-danger-soft);
}

.badge__icon {
  font-size: 12px;
}
</style>
