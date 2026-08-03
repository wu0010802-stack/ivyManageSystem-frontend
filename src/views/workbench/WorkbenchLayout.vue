<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useRoute, useRouter, RouterView } from 'vue-router'
import type { TabPaneName } from 'element-plus'

import { useHighRiskAuditCount } from '@/composables/useHighRiskAuditCount'
import { hasPermission } from '@/utils/auth'

const route = useRoute()
const router = useRouter()

const { unackCount } = useHighRiskAuditCount()

// 兩分頁各自一碼（2026-08-03 細分）：高風險事件原本共用 AUDIT_LOGS，等於要連
// 「報表 › 操作紀錄」一起授出去才看得到。
const canSeeApprovals = computed(() => hasPermission('APPROVALS'))
const canSeeHighRisk = computed(() => hasPermission('HIGH_RISK_READ'))

const activeTab = ref(route.path.endsWith('/high-risk') ? 'high-risk' : 'approvals')

const onTabChange = (name: TabPaneName) => {
  router.push(`/workbench/${name}`)
}

watch(() => route.path, (p) => {
  activeTab.value = p.endsWith('/high-risk') ? 'high-risk' : 'approvals'
})
</script>

<template>
  <div class="workbench-layout">
    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <el-tab-pane v-if="canSeeApprovals" label="待簽核" name="approvals" />
      <el-tab-pane v-if="canSeeHighRisk" name="high-risk">
        <template #label>
          <span>高風險事件</span>
          <el-badge v-if="unackCount > 0" :value="unackCount" class="ml-1" />
        </template>
      </el-tab-pane>
    </el-tabs>
    <RouterView />
  </div>
</template>

<style scoped>
.workbench-layout {
  padding: 12px 0;
}
</style>
