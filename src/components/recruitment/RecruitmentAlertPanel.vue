<template>
  <el-card class="alert-panel" shadow="never">
    <template #header>異常警示</template>

    <div v-if="alerts.length" class="alert-list">
      <!-- 原始警示代碼（如 FUNNEL_DROP）屬開發者語彙，僅留在 title 供除錯，不對使用者顯示 -->
      <button
        v-for="alert in alerts"
        :key="alert.code"
        type="button"
        class="alert-item"
        :title="String(alert.code || '')"
        @click="$emit('select', alert)"
      >
        <div class="alert-item-top">
          <el-tag size="small" :type="(tagType(alert.level) as 'primary' | 'success' | 'warning' | 'info' | 'danger')">{{ levelLabel(alert.level) }}</el-tag>
          <span class="alert-title">{{ alert.title }}</span>
        </div>
        <div class="alert-message">{{ alert.message }}</div>
      </button>
    </div>
    <el-empty v-else description="目前沒有明顯異常" :image-size="64" />
  </el-card>
</template>

<script setup lang="ts">
interface AlertItem { code?: string; level?: string; title?: string; message?: string; [key: string]: unknown }

withDefaults(defineProps<{
  alerts?: AlertItem[]
}>(), {
  alerts: () => [],
})

defineEmits<{ 'select': [alert: AlertItem] }>()

const TAG_TYPE_MAP: Record<string, string> = { danger: 'danger', warning: 'warning', info: 'info' }
const LEVEL_LABEL_MAP: Record<string, string> = { danger: '高', warning: '中', info: '低' }

const tagType = (level: unknown) => TAG_TYPE_MAP[String(level || '')] || 'info'
const levelLabel = (level: unknown) => LEVEL_LABEL_MAP[String(level || '')] || '提示'
</script>

<style scoped>
.alert-panel {
  margin-bottom: 16px;
}

.alert-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  gap: 12px;
}

.alert-item {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-color);
  padding: 12px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.alert-item:hover {
  border-color: var(--color-info);
}

.alert-item-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.alert-title {
  font-weight: 700;
  color: var(--neutral-900);
}

.alert-message {
  font-size: 0.88rem;
  color: var(--neutral-600);
  line-height: 1.5;
}
</style>
