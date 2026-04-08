<template>
  <div
    class="course-card"
    :class="{ selected, disabled }"
    @click="$emit('toggle')"
  >
    <div class="course-check">
      <el-icon v-if="selected"><Select /></el-icon>
      <div v-else class="empty-check" />
    </div>
    <div class="course-info">
      <div class="course-name">{{ course.name }}</div>
      <div v-if="course.sessions" class="course-sessions">{{ course.sessions }}</div>
    </div>
    <div class="course-right">
      <div class="course-price">${{ course.price }}</div>
      <a
        v-if="videoUrl"
        :href="videoUrl"
        target="_blank"
        class="course-video-link"
        @click.stop
      >▶ 課程介紹</a>
      <el-tag v-if="availability > 0" type="success" size="small">剩 {{ availability }} 名</el-tag>
      <el-tag v-else-if="availability === 0" type="warning" size="small">可候補</el-tag>
      <el-tag v-else-if="availability < 0" type="danger" size="small">已額滿</el-tag>
      <el-tag v-else type="info" size="small">查詢中</el-tag>
    </div>
  </div>
</template>

<script setup>
import { Select } from '@element-plus/icons-vue'

defineProps({
  course: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  availability: { type: Number, default: undefined },
  videoUrl: { type: String, default: null },
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
.course-card.disabled { opacity: 0.5; cursor: not-allowed; }
.course-check {
  width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  color: #3f7d48; flex-shrink: 0;
}
.empty-check { width: 18px; height: 18px; border: 2px solid #ccc; border-radius: 4px; }
.course-info { flex: 1; min-width: 0; }
.course-name { font-size: 15px; font-weight: 500; color: #333; }
.course-sessions { font-size: 12px; color: #888; margin-top: 2px; }
.course-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
.course-price { font-size: 15px; font-weight: 600; color: #3f7d48; }
.course-video-link { font-size: 12px; color: #3f7d48; text-decoration: none; white-space: nowrap; }
.course-video-link:hover { text-decoration: underline; }
</style>
