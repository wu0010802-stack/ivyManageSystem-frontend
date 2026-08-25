<template>
  <div class="student-fee-view">
    <PageHeader title="學費管理" :subtitle="headerSubtitle">
      <template #actions>
        <el-button
          v-if="activeWs !== 'settings'"
          aria-label="開啟費用設定（費用範本與銷帳碼）"
          data-test="open-fee-settings"
          @click="goToSettings"
        >
          <el-icon aria-hidden="true"><Setting /></el-icon>
          <span>費用設定</span>
        </el-button>
      </template>
    </PageHeader>

    <!-- 主導航：四個任務導向工作區；費用設定不佔主導航 -->
    <nav
      v-if="activeWs !== 'settings'"
      class="fee-main-nav"
      aria-label="學費管理工作區"
    >
      <el-segmented
        :model-value="activeWs"
        :options="mainNavOptions"
        size="large"
        aria-label="切換學費管理工作區"
        data-test="fee-main-nav"
        @change="onWorkspaceChange"
      />
    </nav>
    <div v-else class="settings-bar">
      <el-button
        text
        aria-label="返回學費管理工作區"
        data-test="exit-fee-settings"
        @click="exitSettings"
      >
        <el-icon aria-hidden="true"><ArrowLeft /></el-icon>
        <span>返回</span>
      </el-button>
      <span class="settings-bar__title">費用設定</span>
    </div>

    <!-- 工作區內容：KeepAlive 保留各區篩選/時間脈絡；async import 延遲載入 -->
    <KeepAlive>
      <FeeWorkbench v-if="activeWs === 'workbench'" @navigate="navigateTo" />
      <FeeBillingWorkspace
        v-else-if="activeWs === 'billing'"
        :view="activeView ?? undefined"
        :student-search="studentSearch"
        @change-view="onViewChange"
      />
      <BankReconTab v-else-if="activeWs === 'recon'" />
      <FeeSettlementWorkspace
        v-else-if="activeWs === 'settlement'"
        :view="activeView ?? undefined"
        @change-view="onViewChange"
        @navigate="navigateTo"
      />
      <FeeSettingsWorkspace
        v-else
        :view="activeView ?? undefined"
        @change-view="onViewChange"
      />
    </KeepAlive>
  </div>
</template>

<script setup lang="ts">
/**
 * 學費管理（任務導向 IA，2026-08-25 改版）。
 *
 * 本檔只做資訊架構殼層：PageHeader、主導航、query（?ws=&view=）同步與
 * 工作區掛載；業務內容全部在 components/fees/ 與 workspace/ 子元件。
 * 舊版 8 個同層 tab 的 ?tab= 深連結由 resolveFeesLocation 相容映射。
 */
import { computed, defineAsyncComponent, reactive, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { ArrowLeft, Setting } from '@element-plus/icons-vue'
import PageHeader from '@/components/common/PageHeader.vue'
import {
  FEE_MAIN_WORKSPACES,
  FEE_WORKSPACE_VIEWS,
  resolveFeesLocation,
  type FeeWorkspaceKey,
} from '@/components/fees/workspace/feesNavigation'

const FeeWorkbench = defineAsyncComponent(
  () => import('@/components/fees/workspace/FeeWorkbench.vue'),
)
const FeeBillingWorkspace = defineAsyncComponent(
  () => import('@/components/fees/workspace/FeeBillingWorkspace.vue'),
)
const BankReconTab = defineAsyncComponent(
  () => import('@/components/fees/BankReconTab.vue'),
)
const FeeSettlementWorkspace = defineAsyncComponent(
  () => import('@/components/fees/workspace/FeeSettlementWorkspace.vue'),
)
const FeeSettingsWorkspace = defineAsyncComponent(
  () => import('@/components/fees/workspace/FeeSettingsWorkspace.vue'),
)

const route = useRoute()
const router = useRouter()

const mainNavOptions = FEE_MAIN_WORKSPACES.map((w) => ({
  label: w.label,
  value: w.key,
}))

const resolved = computed(() => resolveFeesLocation(route.query))
const activeWs = computed(() => resolved.value.ws)
const activeView = computed(() => resolved.value.view)
const studentSearch = computed(() => {
  const raw = route.query.search
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' ? value : ''
})

const headerSubtitle = computed(() =>
  activeWs.value === 'settings'
    ? '費用範本與銷帳末四碼等低頻設定'
    : '收款、對帳與結算的日常工作區',
)

// 各工作區最後停留的檢視（session 內記憶；重新整理由 query 還原）
const lastViews = reactive<Partial<Record<FeeWorkspaceKey, string>>>({})

// 舊 tab 深連結 / 非法值 → replace 正規化（不留歷史紀錄）
watch(
  resolved,
  (loc) => {
    if (loc.needsNormalize) {
      router.replace({ query: loc.normalizedQuery })
      return
    }
    if (loc.view) lastViews[loc.ws] = loc.view
  },
  { immediate: true },
)

function queryFor(ws: FeeWorkspaceKey, view?: string): LocationQueryRaw {
  const query: LocationQueryRaw = { ...route.query, ws }
  delete query.tab
  delete query.view
  const views = FEE_WORKSPACE_VIEWS[ws]
  if (views.length > 0) {
    const candidate = view ?? lastViews[ws] ?? views[0].key
    query.view = views.some((v) => v.key === candidate) ? candidate : views[0].key
  }
  return query
}

function onWorkspaceChange(val: string | number) {
  const next = String(val) as FeeWorkspaceKey
  if (next === activeWs.value) return
  router.push({ query: queryFor(next) })
}

function onViewChange(view: string) {
  if (view === activeView.value) return
  router.push({ query: queryFor(activeWs.value, view) })
}

function navigateTo(target: { ws: FeeWorkspaceKey; view?: string }) {
  router.push({ query: queryFor(target.ws, target.view) })
}

function goToSettings() {
  router.push({ query: queryFor('settings') })
}

function exitSettings() {
  // 返回鍵回到工作台（設定屬支線；瀏覽器上一頁仍可回到原工作區）
  router.push({ query: queryFor('workbench') })
}
</script>

<style scoped>
.student-fee-view {
  padding: var(--space-5);
}

.fee-main-nav {
  margin-bottom: var(--space-4);
  /* 1024px 下主導航不得撐出整頁水平捲動：允許自身內部捲動兜底 */
  overflow-x: auto;
}

.settings-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.settings-bar__title {
  font-weight: 600;
  font-size: var(--text-base);
  color: var(--el-text-color-primary);
}
</style>
