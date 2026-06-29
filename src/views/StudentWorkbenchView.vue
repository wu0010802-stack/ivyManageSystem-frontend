<script setup lang="ts">
import { ref, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import TodayTasksPanel from '@/components/student/workbench/TodayTasksPanel.vue'
import StudentListPanel from '@/components/student/workbench/StudentListPanel.vue'

// 在籍統計含 chart.js 與在籍記錄表，懶載以維持學生頁原本的載入重量（僅點該分頁才載入）
const EnrollmentPanel = defineAsyncComponent(
  () => import('@/components/student/workbench/EnrollmentPanel.vue'),
)

const route = useRoute()
// 深連結優先序：?tab=（含在籍統計）→ ?action=（新增 / 轉班，落在「學生名冊」）→ 預設今日任務
const VALID_TABS = ['tasks', 'roster', 'enrollment']
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
      <el-tab-pane label="在籍統計" name="enrollment" lazy>
        <EnrollmentPanel />
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
