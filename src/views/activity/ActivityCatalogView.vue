<template>
  <div class="activity-catalog">
    <el-tabs
      v-model="activeTab"
      class="catalog-tabs"
      @tab-change="handleTabChange"
    >
      <el-tab-pane label="課程管理" name="courses">
        <ActivityCourseView v-if="activeTab === 'courses'" />
      </el-tab-pane>
      <el-tab-pane label="用品管理" name="supplies">
        <ActivitySupplyView v-if="activeTab === 'supplies'" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ActivityCourseView from './ActivityCourseView.vue'
import ActivitySupplyView from './ActivitySupplyView.vue'

const route = useRoute()
const router = useRouter()

const VALID_TABS = ['courses', 'supplies']
const initialTab = VALID_TABS.includes(route.query.tab) ? route.query.tab : 'courses'
const activeTab = ref(initialTab)

function handleTabChange(tab) {
  const nextQuery = { ...route.query }
  if (tab === 'courses') {
    delete nextQuery.tab
  } else {
    nextQuery.tab = tab
  }
  router.replace({ query: nextQuery })
}

watch(
  () => route.query.tab,
  (next) => {
    if (VALID_TABS.includes(next) && next !== activeTab.value) {
      activeTab.value = next
    } else if (!next && activeTab.value !== 'courses') {
      activeTab.value = 'courses'
    }
  }
)
</script>

<style scoped>
.activity-catalog {
  padding: 16px;
}
.catalog-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}
.catalog-tabs :deep(.el-tabs__item) {
  font-size: 15px;
  font-weight: 600;
}
.catalog-tabs :deep(.el-tab-pane) {
  padding-top: 8px;
}
</style>
