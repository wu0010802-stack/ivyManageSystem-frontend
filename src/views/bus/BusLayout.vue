<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useRoute, useRouter, RouterView } from 'vue-router'
import type { TabPaneName } from 'element-plus'

import { hasPermission } from '@/utils/auth'

const route = useRoute()
const router = useRouter()

// 監看／歷史＝BUS_READ、路線管理＝BUS_WRITE（與後端 api/bus/admin_routes.py 守衛
// 及 ROUTE_PERMISSION_RULES 對齊）；只持單一碼者由 /bus 的 redirect 落到可見分頁。
const canRead = computed(() => hasPermission('BUS_READ'))
const canManageRoutes = computed(() => hasPermission('BUS_WRITE'))

const tabFromPath = (path: string): string =>
  path.endsWith('/history') ? 'history' : path.endsWith('/routes') ? 'routes' : 'monitor'

const activeTab = ref(tabFromPath(route.path))

const onTabChange = (name: TabPaneName) => {
  router.push(`/bus/${name}`)
}

watch(() => route.path, (path) => {
  activeTab.value = tabFromPath(path)
})
</script>

<template>
  <div class="bus-layout">
    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <el-tab-pane v-if="canRead" label="即時監看" name="monitor" />
      <el-tab-pane v-if="canRead" label="乘車歷史" name="history" />
      <el-tab-pane v-if="canManageRoutes" label="路線管理" name="routes" />
    </el-tabs>
    <RouterView />
  </div>
</template>

<style scoped>
.bus-layout {
  padding: 12px 0;
}
</style>
