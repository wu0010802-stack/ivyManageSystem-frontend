<script setup lang="ts">
import { defineAsyncComponent, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

// 兩個分頁都含較多表格與圖表，只在切到時才載入。
const EnrollmentPanel = defineAsyncComponent(
  () => import('@/components/student/workbench/EnrollmentPanel.vue'),
)
const ClassroomView = defineAsyncComponent(() => import('@/views/ClassroomView.vue'))

const route = useRoute()
const activeTab = ref(route.query.tab === 'classrooms' ? 'classrooms' : 'enrollment')

watch(() => route.query.tab, (tab) => {
  activeTab.value = tab === 'classrooms' ? 'classrooms' : 'enrollment'
})
</script>

<template>
  <div class="classroom-workbench-view">
    <el-tabs v-model="activeTab" class="workbench-tabs">
      <el-tab-pane label="在籍統計" name="enrollment" lazy>
        <EnrollmentPanel />
      </el-tab-pane>
      <el-tab-pane label="班級學生管理" name="classrooms" lazy>
        <ClassroomView />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.classroom-workbench-view {
  padding: 8px 0;
}

.workbench-tabs :deep(.el-tabs__header) {
  margin-bottom: var(--space-4, 16px);
}
</style>
