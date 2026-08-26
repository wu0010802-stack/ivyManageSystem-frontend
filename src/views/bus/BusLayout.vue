<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useRoute, useRouter, RouterView } from 'vue-router'
import type { TabPaneName } from 'element-plus'

import { hasPermission } from '@/utils/auth'

const route = useRoute()
const router = useRouter()

// 監看／今日調度／歷史＝BUS_READ、路線管理／設定＝BUS_WRITE（與後端
// api/bus/admin_routes.py 守衛及 ROUTE_PERMISSION_RULES 對齊）；只持單一碼者由
// /bus 的 redirect 落到可見分頁。
//
// 今日調度掛 canRead 而非 canManageRoutes：該頁進頁即讀當日名單，發車後的編輯
// 另由頁內 BUS_IN_PROGRESS_WRITE 控制，分頁層再收一次會讓唯讀行政看不到名單。
const canRead = computed(() => hasPermission('BUS_READ'))
const canManageRoutes = computed(() => hasPermission('BUS_WRITE'))

// 尾段對照而非 endsWith 串接：分頁多了以後串接式三元運算子的落點會越來越難讀，
// 且未知子路徑（例如未來的 detail 頁）不該被靜默算成 monitor。
const TAB_BY_SEGMENT: Record<string, string> = {
  monitor: 'monitor',
  dispatch: 'dispatch',
  history: 'history',
  routes: 'routes',
  settings: 'settings',
}

const tabFromPath = (path: string): string =>
  TAB_BY_SEGMENT[path.split('/').pop() ?? ''] ?? 'monitor'

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
      <el-tab-pane v-if="canRead" label="今日調度" name="dispatch" />
      <el-tab-pane v-if="canRead" label="乘車歷史" name="history" />
      <el-tab-pane v-if="canManageRoutes" label="路線管理" name="routes" />
      <el-tab-pane v-if="canManageRoutes" label="設定" name="settings" />
    </el-tabs>
    <RouterView />
  </div>
</template>

<style scoped>
.bus-layout {
  padding: 12px 0;
}
</style>
