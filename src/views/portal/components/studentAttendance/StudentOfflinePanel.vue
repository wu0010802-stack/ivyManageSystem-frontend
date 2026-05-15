<script setup>
import OfflineQueueBadge from '@/components/portal/OfflineQueueBadge.vue'

defineProps({
  isOnline: { type: Boolean, required: true },
  pendingCount: { type: Number, default: 0 },
  syncing: { type: Boolean, default: false },
})

defineEmits(['sync-now'])
</script>

<template>
  <div
    v-if="!isOnline || pendingCount > 0"
    class="offline-panel"
    :class="{ 'is-offline': !isOnline }"
    data-test="offline-panel"
  >
    <div class="offline-panel__status">
      <span v-if="!isOnline" class="status-text status-text--offline">
        ⚠ 目前離線，操作將存入佇列
      </span>
      <OfflineQueueBadge
        v-else-if="pendingCount > 0"
        :count="pendingCount"
        status="pending"
      />
    </div>
    <div v-if="isOnline && pendingCount > 0" class="offline-panel__actions">
      <el-button
        size="small"
        type="primary"
        :loading="syncing"
        @click="$emit('sync-now')"
      >
        立即同步
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.offline-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--color-warning-soft);
  border: 1px solid #fde68a;
  border-radius: var(--radius-md);
  margin-bottom: var(--space-3);
}

.offline-panel.is-offline {
  background: var(--color-danger-soft);
  border-color: var(--color-danger-soft);
}

.status-text {
  font-size: var(--text-sm);
  color: var(--pt-text-strong);
}

.status-text--offline {
  color: var(--color-danger-darker);
  font-weight: 500;
}

.offline-panel__actions {
  display: flex;
  gap: var(--space-2);
}
</style>
