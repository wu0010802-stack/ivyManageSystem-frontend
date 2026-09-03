<script setup lang="ts">
import { computed } from 'vue'
import { WarningFilled, Loading } from '@element-plus/icons-vue'

/**
 * 離線佇列徽章 — 顯示「N 筆待同步」狀態。
 *
 * 狀態：
 *  - pending: 待同步（橘）
 *  - failed: 同步失敗（紅）
 *
 * Phase 6 會由 useOfflineQueue 注入 count + status。
 */
const props = withDefaults(defineProps<{
  count: number
  status?: 'pending' | 'failed'
}>(), {
  status: 'pending',
})

defineEmits<{ 'click': [] }>()

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
    <el-icon
      :class="['badge__icon', { 'is-loading': status !== 'failed' }]"
      aria-hidden="true"
    >
      <component :is="status === 'failed' ? WarningFilled : Loading" />
    </el-icon>
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
.badge__icon.is-loading {
  animation: offline-queue-badge-spin 1.2s linear infinite;
}
@keyframes offline-queue-badge-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
