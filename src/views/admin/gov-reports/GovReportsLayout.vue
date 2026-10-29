<script setup lang="ts">
// 政府申報頁籤列（2026-10-29 後台 IA 重整 批次 2）：側欄「政府申報」單一入口的落點殼。
// 以巢狀路由套在五頁外面（比照 governance/GovernanceLayout），各頁元件、API 呼叫與測試都不動：
// 教育部四頁 /admin/gov-reports/{monthly,certificates,subsidies,iep} 與勞健保與稅務申報
// /gov-reports 的網址、權限規則一律不變，頁籤只是並排的導覽連結。
//
// 每個頁籤依該頁自己的 gate 用 v-if（見 govReportTabs.ts）；可見頁籤不足兩個時整列隱藏
// （例如只持 GOV_REPORTS_EXPORT 的人只有勞健保一頁，一個孤零零的頁籤沒有導覽意義）。
import { computed, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import type { TabPaneName } from 'element-plus'

import { hasPermission } from '@/utils/auth'
import { GOV_REPORT_TABS } from './govReportTabs'

const route = useRoute()
const router = useRouter()

const visibleTabs = computed(() => GOV_REPORT_TABS.filter((tab) => hasPermission(tab.permission)))
const showTabs = computed(() => visibleTabs.value.length >= 2)

const activeTab = ref(route.path)
watch(
  () => route.path,
  (path) => {
    activeTab.value = path
  },
)

const onTabChange = (name: TabPaneName) => {
  const target = String(name)
  if (target !== route.path) router.push(target)
}
</script>

<template>
  <div class="gov-reports-layout">
    <el-tabs
      v-if="showTabs"
      v-model="activeTab"
      class="gov-reports-layout__tabs"
      data-testid="gov-reports-tabs"
      @tab-change="onTabChange"
    >
      <el-tab-pane
        v-for="tab in visibleTabs"
        :key="tab.path"
        :label="tab.label"
        :name="tab.path"
      />
    </el-tabs>
    <RouterView />
  </div>
</template>

<style scoped>
.gov-reports-layout__tabs {
  margin-bottom: var(--space-3);
}
</style>
