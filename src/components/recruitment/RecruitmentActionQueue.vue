<template>
  <el-card class="action-queue" shadow="never">
    <template #header>行動入口</template>

    <div class="action-grid">
      <button
        v-for="item in items"
        :key="item.code"
        type="button"
        class="action-item"
        @click="$emit('select', item)"
      >
        <div class="action-body">
          <div class="action-title">{{ item.title }}</div>
          <div class="action-description">{{ item.description }}</div>
        </div>
        <svg class="action-chevron" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
  </el-card>
</template>

<script setup lang="ts">
interface ActionItem { code?: string; title?: string; description?: string; [key: string]: unknown }

withDefaults(defineProps<{
  items?: ActionItem[]
}>(), {
  items: () => [],
})

defineEmits<{ 'select': [item: ActionItem] }>()
</script>

<style scoped>
.action-queue {
  margin-bottom: 16px;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: 12px;
}

.action-item {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--neutral-0);
  padding: 14px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.action-item:hover {
  border-color: var(--brand-primary);
}

.action-item:hover .action-chevron {
  color: var(--brand-primary);
}

.action-body {
  flex: 1;
  min-width: 0;
}

.action-chevron {
  flex-shrink: 0;
  color: var(--neutral-300);
  transition: color 0.2s ease;
}

.action-title {
  font-weight: 700;
  color: var(--neutral-900);
  margin-bottom: 6px;
}

.action-description {
  font-size: 0.88rem;
  color: var(--neutral-600);
  line-height: 1.5;
}
</style>
