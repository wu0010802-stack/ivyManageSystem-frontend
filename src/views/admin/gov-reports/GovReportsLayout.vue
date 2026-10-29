<script setup lang="ts">
// 政府申報頁籤列（2026-10-29 後台 IA 重整 批次 2）：側欄「政府申報」單一入口的落點殼。
// 以巢狀路由套在五頁外面（比照 governance/GovernanceLayout），各頁元件、API 呼叫與測試都不動：
// 教育部四頁 /admin/gov-reports/{monthly,certificates,subsidies,iep} 與勞健保與稅務申報
// /gov-reports 的網址、權限規則一律不變，頁籤只是並排的導覽連結。
//
// 每個頁籤依該頁自己的 gate 用 v-if（見 govReportTabs.ts）；可見頁籤不足兩個時整列隱藏
// （例如只持 GOV_REPORTS_EXPORT 的人只有勞健保一頁，一個孤零零的頁籤沒有導覽意義）。
//
// 頁籤列右側的「申報單位設定」（2026-10-29 S5）：勞保／健保／勞退三組單位編號（gov.* system_configs）
// 自「系統設定 › 分校設定」搬到這裡，申報時就在手邊。後端以這三組值為申報檔的機構識別權威
// （api/gov_reports.py）。入口與內容的 GET 需要 SETTINGS_READ，所以沒有就不顯示；寫入需 SETTINGS_WRITE，
// 由 dialog 內的元件逐 key 鎖定（唯讀者看得到值但改不了）。入口不受頁籤數量影響（只持一頁的人也要能維護）。
import { computed, ref, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import type { TabPaneName } from 'element-plus'
import { Setting } from '@element-plus/icons-vue'

import { hasPermission } from '@/utils/auth'
import SystemConfigDialog from '@/components/settings/SystemConfigDialog.vue'
import { GOV_REPORT_TABS } from './govReportTabs'

const route = useRoute()
const router = useRouter()

const visibleTabs = computed(() => GOV_REPORT_TABS.filter((tab) => hasPermission(tab.permission)))
const showTabs = computed(() => visibleTabs.value.length >= 2)
const canOpenUnitSettings = computed(() => hasPermission('SETTINGS_READ'))
const unitSettingsOpen = ref(false)

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
    <div v-if="showTabs || canOpenUnitSettings" class="gov-reports-layout__bar">
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
      <el-button
        v-if="canOpenUnitSettings"
        link
        :icon="Setting"
        class="gov-reports-layout__unit-settings"
        data-testid="gov-unit-settings"
        @click="unitSettingsOpen = true"
      >申報單位設定</el-button>
    </div>
    <SystemConfigDialog
      v-if="canOpenUnitSettings"
      v-model="unitSettingsOpen"
      title="申報單位設定"
      placement="gov"
    />
    <RouterView />
  </div>
</template>

<style scoped>
.gov-reports-layout__bar {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.gov-reports-layout__tabs {
  flex: 1 1 auto;
  min-width: 0;
}
/* 與頁籤同高（el-tabs 導覽列 40px），貼右 */
.gov-reports-layout__unit-settings {
  flex: none;
  height: 40px;
  margin-left: auto;
}
</style>
