<script setup lang="ts">
import type { LifecycleGradeStep } from '@/api/studentLifecycle'

defineProps<{
  grades: LifecycleGradeStep[]
}>()
</script>

<template>
  <div class="inner-grade-stepper" data-testid="inner-grade-stepper">
    <template v-for="(g, idx) in grades" :key="g.grade_id">
      <div
        class="grade-dot"
        :class="`status-${g.status}`"
        :data-testid="`grade-${g.grade_id}`"
      >
        <span class="grade-name">{{ g.name }}</span>
        <span v-if="g.entered_at" class="grade-entered">{{ g.entered_at }}</span>
      </div>
      <span
        v-if="idx < grades.length - 1"
        class="grade-sep"
        :class="`sep-${g.status}`"
        :data-testid="`sep-${g.grade_id}`"
      ></span>
    </template>
  </div>
</template>

<style scoped>
.inner-grade-stepper {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 12px 16px;
  flex-wrap: wrap;
}
.grade-dot {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 56px;
}
.grade-name {
  font-size: 13px;
  padding: 4px 12px;
  border-radius: 12px;
  font-weight: 500;
}
.grade-entered {
  font-size: 11px;
  color: var(--el-color-info);
  margin-top: 2px;
}
.grade-sep {
  width: 16px;
  height: 2px;
}
.status-done .grade-name {
  background: var(--el-color-primary-light-7);
  color: var(--el-color-primary);
}
.status-current .grade-name {
  background: var(--el-color-primary);
  color: white;
  animation: pulse 2s infinite;
}
.status-future .grade-name {
  background: var(--el-color-info-light-9);
  color: var(--el-color-info);
}
.status-skipped .grade-name {
  background: transparent;
  color: var(--el-color-info-light-3);
  border: 1px dashed var(--el-color-info-light-5);
}
.sep-done,
.sep-current {
  background: var(--el-color-primary);
}
.sep-future {
  background: var(--el-color-info-light-7);
}
.sep-skipped {
  background: transparent;
  border-top: 1px dashed var(--el-color-info-light-5);
  height: 0;
}

@keyframes pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 var(--el-color-primary-light-5);
  }
  50% {
    box-shadow: 0 0 0 6px transparent;
  }
}
</style>
