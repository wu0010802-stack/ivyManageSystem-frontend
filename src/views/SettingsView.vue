<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { useShiftStore } from '@/stores/shift'
import SettingsShiftTab from '@/components/settings/SettingsShiftTab.vue'
import SettingsLineTab from '@/components/settings/SettingsLineTab.vue'
import SettingsObservabilityTab from '@/components/settings/SettingsObservabilityTab.vue'
import DsrRequestsView from '@/views/DsrRequestsView.vue'
import PolicyVersionsView from '@/views/PolicyVersionsView.vue'
import { hasPermission } from '@/utils/auth'
import PageHeader from '@/components/common/PageHeader.vue'

const route = useRoute()
const router = useRouter()

const BASE_TABS = ['shifts', 'line', 'observability']

const availableTabs = (): string[] =>
  hasPermission('DSR_MANAGE') ? [...BASE_TABS, 'dsr-requests', 'policy-versions'] : [...BASE_TABS]

const resolveTab = (raw: unknown): string => {
  const r = String(Array.isArray(raw) ? raw[0] : (raw ?? ''))
  return availableTabs().includes(r) ? r : 'shifts'
}

const activeTab = ref(resolveTab(route.query.tab))

const rawTab = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab
if (rawTab === 'accounts') {
  // 舊深連結 ?tab=accounts → 新帳號設定頁（保留 ?view= 受眾分流參數）
  const next: LocationQueryRaw = {}
  if (route.query.view) next.view = route.query.view
  router.replace({ path: '/settings/accounts', query: next })
} else if (route.query.tab !== activeTab.value) {
  // 缺漏 / 不合法 tab → 修正 URL（與 EmployeeHubView 一致）
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
  router.replace({ query: { ...route.query, tab: String(name) } })
}

const shiftStore = useShiftStore()

onMounted(() => {
  shiftStore.fetchShiftTypes()
})
</script>

<template>
  <div class="settings-page">
    <PageHeader title="系統設定" subtitle="輪班別、通知、排程觀測與個資治理設定" />
    <el-tabs v-model="activeTab" type="card" @tab-change="onTabChange">
      <el-tab-pane label="輪班別管理" name="shifts">
        <SettingsShiftTab v-if="activeTab === 'shifts'" />
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
