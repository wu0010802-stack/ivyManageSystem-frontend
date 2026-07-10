<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { hasPermission } from '@/utils/auth'

// 子頁權限對齊實際呼叫的 API：前四頁走 appraisal API（APPRAISAL_READ）、年終規則走 SETTINGS_READ
const TABS = [
  { name: 'scoring', label: '考核扣分規則', can: () => hasPermission('APPRAISAL_READ') },
  { name: 'bonus-rates', label: '年終獎金率', can: () => hasPermission('APPRAISAL_READ') },
  { name: 'catalog', label: '扣分項目目錄', can: () => hasPermission('APPRAISAL_READ') },
  { name: 'enrollment-targets', label: '學年目標人數', can: () => hasPermission('APPRAISAL_READ') },
  { name: 'year-end-rules', label: '年終規則', can: () => hasPermission('SETTINGS_READ') },
]

const route = useRoute()
const router = useRouter()
const visibleTabs = computed(() => TABS.filter((t) => t.can()))
// fallback 落在使用者實際看得到的第一個分頁，而非寫死 'scoring'（該頁需 APPRAISAL_READ）——
// 否則只持 SETTINGS_READ 的使用者若因故落在此 fallback 分支，el-tabs 會指向他看不到的分頁。
const activeTab = computed(() => route.path.split('/')[3] ?? visibleTabs.value[0]?.name ?? 'scoring')
const onTabChange = (name: string | number) => {
  if (String(name) !== activeTab.value) router.push(`/appraisal-year-end/rules/${name}`)
}
</script>

<template>
  <el-tabs :model-value="activeTab" type="card" @tab-change="onTabChange">
    <el-tab-pane v-for="t in visibleTabs" :key="t.name" :label="t.label" :name="t.name" />
  </el-tabs>
  <router-view />
</template>
