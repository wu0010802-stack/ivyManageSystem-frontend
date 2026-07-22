<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { hasPermission } from '@/utils/auth'
import { provideOpenCycleHint } from '@/views/appraisal/composables/useOpenCycleHint'

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

// Task B5：規則變更影響提示。layout 為 5 個規則子路由面板的共同祖先
// （vue-router 的 <router-view> 渲染出的子路由元件仍在此元件樹之下），在此
// 建立唯一 useOpenCycleHint 實例並 provide，讓各面板 inject 復用同一份
// openCycle 狀態（避免各面板各自重複打 /appraisal/cycles）。
const { openCycle, refresh } = provideOpenCycleHint()
onMounted(refresh)
</script>

<template>
  <el-alert
    v-if="openCycle"
    type="info"
    :closable="false"
    show-icon
    class="rules-open-cycle-alert"
    data-test="open-cycle-alert"
  >
    <template #title>
      目前有進行中考核週期（ID {{ openCycle.id }}），規則變更於下次試算/重算生效。
      <router-link to="/appraisal-year-end/appraisal/current" class="rules-open-cycle-alert__link">
        前往重算
      </router-link>
    </template>
  </el-alert>
  <el-tabs :model-value="activeTab" type="card" @tab-change="onTabChange">
    <el-tab-pane v-for="t in visibleTabs" :key="t.name" :label="t.label" :name="t.name" />
  </el-tabs>
  <router-view />
</template>

<style scoped>
.rules-open-cycle-alert {
  margin-bottom: var(--space-3);
}
.rules-open-cycle-alert__link {
  margin-left: var(--space-2);
  font-weight: 600;
  color: var(--el-color-primary);
}
</style>
