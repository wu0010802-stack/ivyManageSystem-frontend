<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { useShiftStore } from '@/stores/shift'
import SettingsShiftTab from '@/components/settings/SettingsShiftTab.vue'
import SettingsAccountsTab from '@/components/settings/SettingsAccountsTab.vue'
import SettingsApprovalTab from '@/components/settings/SettingsApprovalTab.vue'
import SettingsLineTab from '@/components/settings/SettingsLineTab.vue'
import SettingsObservabilityTab from '@/components/settings/SettingsObservabilityTab.vue'
import DsrRequestsView from '@/views/DsrRequestsView.vue'
import PolicyVersionsView from '@/views/PolicyVersionsView.vue'
import { hasPermission } from '@/utils/auth'

const route = useRoute()
const router = useRouter()

const BASE_TABS = ['shifts', 'approval', 'accounts', 'line', 'observability']

const availableTabs = (): string[] =>
  hasPermission('DSR_MANAGE') ? [...BASE_TABS, 'dsr-requests', 'policy-versions'] : [...BASE_TABS]

const resolveTab = (raw: unknown): string => {
  const r = String(Array.isArray(raw) ? raw[0] : (raw ?? ''))
  return availableTabs().includes(r) ? r : 'shifts'
}

const activeTab = ref(resolveTab(route.query.tab))

// 缺漏 / 不合法 tab → 修正 URL（與 EmployeeHubView 一致）
if (route.query.tab !== activeTab.value) {
  router.replace({ query: { ...route.query, tab: activeTab.value } })
}

watch(
  () => route.query.tab,
  (next) => {
    const resolved = resolveTab(next)
    if (resolved !== activeTab.value) activeTab.value = resolved
  },
)

const onTabChange = (name: string | number) => {
  const next: LocationQueryRaw = { ...route.query, tab: String(name) }
  if (String(name) !== 'accounts') delete next.view
  router.replace({ query: next })
}

const shiftStore = useShiftStore()

onMounted(() => {
  shiftStore.fetchShiftTypes()
})
</script>

<template>
  <div class="settings-page">
    <h2>系統設定</h2>
    <el-tabs v-model="activeTab" type="card" @tab-change="onTabChange">
      <el-tab-pane label="輪班別管理" name="shifts">
        <SettingsShiftTab v-if="activeTab === 'shifts'" />
      </el-tab-pane>
      <el-tab-pane label="審核流程設定" name="approval">
        <SettingsApprovalTab v-if="activeTab === 'approval'" />
      </el-tab-pane>
      <el-tab-pane label="帳號與權限" name="accounts">
        <SettingsAccountsTab v-if="activeTab === 'accounts'" />
      </el-tab-pane>
      <el-tab-pane name="line">
        <template #label>LINE 通知設定 <el-tag type="warning" size="small" style="margin-left:4px;">Beta</el-tag></template>
        <SettingsLineTab v-if="activeTab === 'line'" />
      </el-tab-pane>
      <el-tab-pane label="排程觀測" name="observability" lazy>
        <SettingsObservabilityTab v-if="activeTab === 'observability'" />
      </el-tab-pane>
      <el-tab-pane
        v-if="hasPermission('DSR_MANAGE')"
        label="個資權利請求"
        name="dsr-requests"
      >
        <DsrRequestsView v-if="activeTab === 'dsr-requests'" />
      </el-tab-pane>
      <el-tab-pane
        v-if="hasPermission('DSR_MANAGE')"
        label="隱私政策版本"
        name="policy-versions"
      >
        <PolicyVersionsView v-if="activeTab === 'policy-versions'" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.settings-page {
  padding: 24px;
}
</style>
