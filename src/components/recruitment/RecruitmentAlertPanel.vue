<template>
  <el-card class="alert-panel" shadow="never">
    <template #header>異常警示</template>

    <div v-if="alerts.length" class="alert-list">
      <button
        v-for="alert in alerts"
        :key="alert.code"
        type="button"
        class="alert-item"
        @click="$emit('select', alert)"
      >
        <div class="alert-item-top">
          <el-tag size="small" :type="tagType(alert.level)">{{ levelLabel(alert.level) }}</el-tag>
          <span class="alert-code">{{ alert.code }}</span>
        </div>
        <div class="alert-title">{{ alert.title }}</div>
        <div class="alert-message">{{ alert.message }}</div>
      </button>
    </div>
    <el-empty v-else description="目前沒有明顯異常" :image-size="64" />
  </el-card>
</template>

<script setup>
defineProps({
  alerts: { type: Array, default: () => [] },
})

defineEmits(['select'])

const tagType = (level) => ({
  danger: 'danger',
  warning: 'warning',
  info: 'info',
}[level] || 'info')

const levelLabel = (level) => ({
  danger: '高',
  warning: '中',
  info: '低',
}[level] || '提示')
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
  border: 1px solid #dbe3ef;
  border-radius: 12px;
  background: #f8fafc;
  padding: 12px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.alert-item:hover {
  border-color: #93c5fd;
  transform: translateY(-1px);
}

.alert-item-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.alert-code {
  font-size: 0.78rem;
  color: #64748b;
}

.alert-title {
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 6px;
}

.alert-message {
  font-size: 0.88rem;
  color: #475569;
  line-height: 1.5;
}
</style>
