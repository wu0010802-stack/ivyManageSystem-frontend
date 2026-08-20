<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useRoute, useRouter, RouterView } from 'vue-router'
import type { TabPaneName } from 'element-plus'

import { useHighRiskAuditCount } from '@/composables/useHighRiskAuditCount'
import { hasPermission } from '@/utils/auth'

const route = useRoute()
const router = useRouter()

const { unackCount } = useHighRiskAuditCount()

// 三個分頁各自一碼，彼此不互相授權（看得到操作紀錄 ≠ 看得到高風險事件）。
// 路由守衛那一半在 navigation/manifest.ts 的 governance extraRoutes。
const canSeeHighRisk = computed(() => hasPermission('HIGH_RISK_READ'))
const canSeeAuditLogs = computed(() => hasPermission('AUDIT_LOGS'))
const canSeeDataQuality = computed(() => hasPermission('DATA_QUALITY_READ'))

const tabFromPath = (path: string): string => path.split('/')[2] ?? ''

const activeTab = ref(tabFromPath(route.path))

const onTabChange = (name: TabPaneName) => {
  router.push(`/governance/${name}`)
}

watch(() => route.path, (p) => {
  activeTab.value = tabFromPath(p)
})
</script>

<template>
  <div class="governance-layout">
    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <el-tab-pane v-if="canSeeHighRisk" name="high-risk">
        <template #label>
          <span>高風險事件</span>
          <el-badge v-if="unackCount > 0" :value="unackCount" class="ml-1" />
        </template>
      </el-tab-pane>
      <el-tab-pane v-if="canSeeAuditLogs" label="操作紀錄" name="audit-logs" />
      <el-tab-pane v-if="canSeeDataQuality" label="資料異常待辦" name="data-quality" />
    </el-tabs>
    <RouterView />
  </div>
</template>

<style scoped>
.governance-layout {
  padding: 12px 0;
}
</style>
