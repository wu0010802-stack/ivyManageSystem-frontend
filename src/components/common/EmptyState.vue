<template>
  <div class="empty-state">
    <el-icon class="empty-state__icon" :size="48">
      <component :is="icon" />
    </el-icon>
    <p class="empty-state__title">{{ title }}</p>
    <p v-if="description" class="empty-state__desc">{{ description }}</p>
    <div v-if="$slots.action" class="empty-state__action">
      <slot name="action" />
    </div>
  </div>
</template>

<script setup>
import { FolderOpened } from '@element-plus/icons-vue'

defineProps({
  icon: { type: [String, Object], default: () => FolderOpened },
  title: { type: String, default: '暫無資料' },
  description: { type: String, default: '' }
})
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-8) var(--space-4);
  text-align: center;
}

.empty-state__icon {
  color: var(--text-tertiary);
  margin-bottom: var(--space-4);
}

.empty-state__title {
  margin: 0 0 var(--space-2);
  font-size: var(--text-lg);
  font-weight: 500;
  color: var(--text-secondary);
}

.empty-state__desc {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  max-width: 300px;
}

.empty-state__action {
  margin-top: var(--space-4);
}
</style>
