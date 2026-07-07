<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import CurrentSemesterOverview from './appraisal/CurrentSemesterOverview.vue'
import CycleListView from './appraisal/CycleListView.vue'
import AppraisalSettingsView from './appraisal/AppraisalSettingsView.vue'
import DisciplinaryPanel from './salary/DisciplinaryPanel.vue'
import InstitutionEventPanel from './appraisal/components/InstitutionEventPanel.vue'

const route = useRoute()
const router = useRouter()

const VALID_TABS = ['current', 'history', 'institution_events', 'settings', 'disciplinary']
const DEFAULT_TAB = 'current'
const LEGACY_TAB_MAP: Record<string, string> = { cycles: 'history' }

const resolveTab = (raw: string | string[] | null | undefined): string => {
  const r = Array.isArray(raw) ? raw[0] : raw
  if (r && LEGACY_TAB_MAP[r]) return LEGACY_TAB_MAP[r]
  return r && VALID_TABS.includes(r) ? r : DEFAULT_TAB
}

const activeTab = ref(resolveTab(route.query.tab as string))

watch(() => route.query.tab, (next) => {
  const resolved = resolveTab(next as string | null)
  if (resolved !== activeTab.value) activeTab.value = resolved
  // 一次性 redirect legacy tab 名稱到新名稱（保留 query 內其他欄位）
  const nextStr = Array.isArray(next) ? next[0] : next
  if (nextStr && LEGACY_TAB_MAP[nextStr]) {
    router.replace({ query: { ...route.query, tab: resolved } })
  }
})

const onTabChange = (name: string | number) => {
  if (route.query.tab === name) return
  const query: LocationQueryRaw = { ...route.query, tab: String(name) }
  // cycle/view 屬於 history tab 的內嵌明細；切離時清除避免殘留
  if (String(name) !== 'history') {
    delete (query as Record<string, unknown>).cycle
    delete (query as Record<string, unknown>).view
  }
  router.replace({ query })
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
      <el-tab-pane label="活動出席" name="institution_events">
        <InstitutionEventPanel v-if="activeTab === 'institution_events'" />
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
