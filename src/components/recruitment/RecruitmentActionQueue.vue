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
        <div class="action-title">{{ item.title }}</div>
        <div class="action-description">{{ item.description }}</div>
      </button>
    </div>
  </el-card>
</template>

<script setup>
defineProps({
  items: { type: Array, default: () => [] },
})

defineEmits(['select'])
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
  border: 1px solid #dbe3ef;
  border-radius: 12px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  padding: 14px;
  text-align: left;
  cursor: pointer;
}

.action-title {
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 6px;
}

.action-description {
  font-size: 0.88rem;
  color: #475569;
  line-height: 1.5;
}
</style>
