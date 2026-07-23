<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import TodayTasksPanel from '@/components/student/workbench/TodayTasksPanel.vue'
import StudentListPanel from '@/components/student/workbench/StudentListPanel.vue'

const route = useRoute()
// 深連結優先序：?tab= → ?action=（新增 / 轉班，落在「學生名冊」）→ 預設今日任務
const VALID_TABS = ['tasks', 'roster']
const initialTab = () => {
  const tab = route.query.tab
  if (typeof tab === 'string' && VALID_TABS.includes(tab)) return tab
  return route.query.action ? 'roster' : 'tasks'
}
const activeTab = ref(initialTab())
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
