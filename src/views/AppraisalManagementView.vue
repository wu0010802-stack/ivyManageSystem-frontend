<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CycleListView from './appraisal/CycleListView.vue'
import AppraisalSettingsView from './appraisal/AppraisalSettingsView.vue'
import DisciplinaryPanel from './salary/DisciplinaryPanel.vue'

const route = useRoute()
const router = useRouter()

const VALID_TABS = ['cycles', 'settings', 'disciplinary']
const DEFAULT_TAB = 'cycles'

const resolveTab = (raw) => (VALID_TABS.includes(raw) ? raw : DEFAULT_TAB)

const activeTab = ref(resolveTab(route.query.tab))

watch(() => route.query.tab, (next) => {
  const resolved = resolveTab(next)
  if (resolved !== activeTab.value) activeTab.value = resolved
})

const onTabChange = (name) => {
  if (route.query.tab === name) return
  router.replace({ query: { ...route.query, tab: name } })
}
</script>

<template>
  <div class="appraisal-management-view">
    <el-tabs v-model="activeTab" type="card" @tab-change="onTabChange">
      <el-tab-pane label="考核週期" name="cycles">
        <CycleListView v-if="activeTab === 'cycles'" />
      </el-tab-pane>
      <el-tab-pane label="考核設定" name="settings">
        <AppraisalSettingsView v-if="activeTab === 'settings'" />
      </el-tab-pane>
      <el-tab-pane label="懲處記錄" name="disciplinary">
        <DisciplinaryPanel v-if="activeTab === 'disciplinary'" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.appraisal-management-view {
  padding: var(--space-5);
}
</style>
