<template>
  <div
    class="course-card"
    :class="{ selected }"
    @click="$emit('toggle')"
  >
    <div class="course-check">
      <el-icon v-if="selected"><Select /></el-icon>
      <div v-else class="empty-check" />
    </div>
    <div class="course-info">
      <div class="course-name">{{ supply.name }}</div>
    </div>
    <div class="course-right">
      <div class="course-price">${{ supply.price }}</div>
    </div>
  </div>
</template>

<script setup>
import { Select } from '@element-plus/icons-vue'

defineProps({
  supply: { type: Object, required: true },
  selected: { type: Boolean, default: false },
})
defineEmits(['toggle'])
</script>

<style scoped>
.course-card {
  padding: 14px;
  border: 2px solid #e2e8f0;
  border-radius: 10px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  display: flex;
  align-items: center;
  gap: 10px;
}
.course-card:last-child { margin-bottom: 0; }
.course-card.selected { border-color: #3f7d48; background: #f0faf1; }
.course-check {
  width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  color: #3f7d48; flex-shrink: 0;
}
.empty-check { width: 18px; height: 18px; border: 2px solid #ccc; border-radius: 4px; }
.course-info { flex: 1; min-width: 0; }
.course-name { font-size: 15px; font-weight: 500; color: #333; }
.course-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
.course-price { font-size: 15px; font-weight: 600; color: #3f7d48; }
</style>
