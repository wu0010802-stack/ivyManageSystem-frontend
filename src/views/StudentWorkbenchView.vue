<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { LocationQueryRaw } from 'vue-router'
import TodayTasksPanel from '@/components/student/workbench/TodayTasksPanel.vue'
import StudentListPanel from '@/components/student/workbench/StudentListPanel.vue'

const route = useRoute()
const router = useRouter()
// 深連結優先序：?tab= → ?action=（新增 / 轉班，落在「學生名冊」）→ 預設學生儀表板
const VALID_TABS = ['tasks', 'roster']
const initialTab = () => {
  const tab = route.query.tab
  if (typeof tab === 'string' && VALID_TABS.includes(tab)) return tab
  return route.query.action ? 'roster' : 'tasks'
}
const activeTab = computed({
  get: initialTab,
  set: (tab: string) => {
    if (!VALID_TABS.includes(tab)) return
    const query: LocationQueryRaw = { ...route.query, tab }
    // 名冊搜尋留在元件記憶體，不隨分頁導覽寫入 URL。
    delete query.q
    void router.push({ query })
  },
})
</script>

<template>
  <div class="student-workbench-view">
    <el-tabs v-model="activeTab" class="workbench-tabs">
      <el-tab-pane label="學生儀表板" name="tasks">
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
  padding: var(--space-2) 0;
}

.workbench-tabs :deep(.el-tabs__header) {
  margin-bottom: var(--space-4);
}
</style>
