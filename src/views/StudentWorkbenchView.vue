<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import TodayTasksPanel from '@/components/student/workbench/TodayTasksPanel.vue'
import StudentListPanel from '@/components/student/workbench/StudentListPanel.vue'

const route = useRoute()
// 從別頁帶 action（新增 / 轉班）深連結進來時，直接落在「學生名冊」分頁
const activeTab = ref(route.query.action ? 'roster' : 'tasks')
</script>

<template>
  <div class="student-workbench-view">
    <el-tabs v-model="activeTab" class="workbench-tabs">
      <el-tab-pane label="今日任務" name="tasks">
        <TodayTasksPanel />
      </el-tab-pane>
      <el-tab-pane label="學生名冊" name="roster">
        <StudentListPanel />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.student-workbench-view {
  padding: 8px 0;
}

.workbench-tabs :deep(.el-tabs__header) {
  margin-bottom: var(--space-4, 16px);
}
</style>
