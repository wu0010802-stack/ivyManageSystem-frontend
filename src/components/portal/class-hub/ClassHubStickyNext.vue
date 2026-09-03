<template>
  <div
    v-if="next"
    class="sticky-next sticky-next--active"
    @click="$emit('jump', next.deep_link)"
    role="button"
    tabindex="0"
    @keyup.enter="$emit('jump', next.deep_link)"
  >
    <el-icon class="sticky-next__icon" aria-hidden="true"><Timer /></el-icon>
    <span class="sticky-next__detail">
      下一件：<strong>{{ formatTime(next.due_at) }}</strong>
      <span v-if="next.student_name" class="sticky-next__student">
        {{ next.student_name }}
      </span>
      <span class="sticky-next__text">{{ next.detail }}</span>
    </span>
    <span class="sticky-next__arrow">處理<el-icon aria-hidden="true"><ArrowRight /></el-icon></span>
  </div>
  <div v-else class="sticky-next sticky-next--empty">
    <el-icon class="sticky-next__icon" aria-hidden="true"><CircleCheck /></el-icon>
    今日任務都完成
  </div>
</template>

<script setup lang="ts">
import { Timer, ArrowRight, CircleCheck } from '@element-plus/icons-vue'
interface NextTask {
  kind?: string
  student_name?: string
  detail?: string
  due_at?: string | null
  deep_link?: string
}

withDefaults(defineProps<{
  next?: NextTask | null
}>(), {
  next: null,
})
defineEmits<{ 'jump': [deepLink: string | undefined] }>()

function formatTime(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}
</script>

<style scoped>
.sticky-next {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px 16px;
  margin-bottom: 12px;
  border-radius: 6px;
}
.sticky-next--active {
  background: var(--el-color-primary-light-9);
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.sticky-next--active:hover {
  background: var(--el-color-primary-light-8);
}
.sticky-next--empty {
  background: var(--el-color-success-light-9);
  cursor: default;
  justify-content: center;
  color: var(--el-color-success);
}
.sticky-next__icon {
  font-size: 18px;
  flex-shrink: 0;
}
.sticky-next__detail {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sticky-next__student {
  margin: 0 6px;
  color: var(--el-text-color-regular);
}
.sticky-next__text {
  color: var(--el-text-color-regular);
}
.sticky-next__arrow {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--el-color-primary);
  font-size: 13px;
  font-weight: 500;
}
.sticky-next--empty .sticky-next__icon {
  margin-right: 6px;
}
</style>
