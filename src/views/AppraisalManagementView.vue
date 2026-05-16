<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CurrentSemesterOverview from './appraisal/CurrentSemesterOverview.vue'
import CycleListView from './appraisal/CycleListView.vue'
import AppraisalSettingsView from './appraisal/AppraisalSettingsView.vue'
import DisciplinaryPanel from './salary/DisciplinaryPanel.vue'

const route = useRoute()
const router = useRouter()

const VALID_TABS = ['current', 'history', 'settings', 'disciplinary']
const DEFAULT_TAB = 'current'
const LEGACY_TAB_MAP = { cycles: 'history' }

const resolveTab = (raw) => {
  if (raw && LEGACY_TAB_MAP[raw]) return LEGACY_TAB_MAP[raw]
  return VALID_TABS.includes(raw) ? raw : DEFAULT_TAB
}

const activeTab = ref(resolveTab(route.query.tab))

watch(() => route.query.tab, (next) => {
  const resolved = resolveTab(next)
  if (resolved !== activeTab.value) activeTab.value = resolved
  // 一次性 redirect legacy tab 名稱到新名稱（保留 query 內其他欄位）
  if (next && LEGACY_TAB_MAP[next]) {
    router.replace({ query: { ...route.query, tab: resolved } })
  }
})

const onTabChange = (name) => {
  if (route.query.tab === name) return
  router.replace({ query: { ...route.query, tab: name } })
}
</script>

<template>
  <div class="appraisal-management-view">
    <el-tabs v-model="activeTab" type="card" @tab-change="onTabChange">
      <el-tab-pane label="當期總覽" name="current">
        <CurrentSemesterOverview v-if="activeTab === 'current'" />
      </el-tab-pane>
      <el-tab-pane label="歷史週期" name="history">
        <CycleListView v-if="activeTab === 'history'" />
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
