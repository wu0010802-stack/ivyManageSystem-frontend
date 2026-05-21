<script setup lang="ts">
import TodayTasksPanel from '@/components/student/workbench/TodayTasksPanel.vue'
import StudentListPanel from '@/components/student/workbench/StudentListPanel.vue'
</script>

<template>
  <div class="student-workbench-view">
    <TodayTasksPanel class="workbench-section workbench-section--tasks" />
    <div class="workbench-divider" aria-hidden="true" />
    <StudentListPanel class="workbench-section workbench-section--list" />
  </div>
</template>

<style scoped>
.student-workbench-view {
  padding: 16px 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.workbench-divider {
  height: 1px;
  background: var(--el-border-color-light, #e4e7ed);
}
</style>
