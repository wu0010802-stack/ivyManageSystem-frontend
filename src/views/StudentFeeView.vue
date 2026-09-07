<template>
  <div class="student-fee-view">
    <PageHeader title="學費管理" />

    <!-- 主導航：底線頁籤 -->
    <nav class="fee-main-nav" aria-label="學費管理工作區">
      <div class="fee-tabs" role="tablist" data-test="fee-main-nav">
        <button
          v-for="w in FEE_MAIN_WORKSPACES"
          :key="w.key"
          type="button"
          role="tab"
          class="fee-tab"
          :class="{ 'fee-tab--active': w.key === activeWs }"
          :aria-selected="w.key === activeWs"
          :aria-controls="`fee-ws-panel-${w.key}`"
          :id="`fee-ws-tab-${w.key}`"
          :tabindex="w.key === activeWs ? 0 : -1"
          :data-test="`fee-main-nav-${w.key}`"
          @click="onWorkspaceChange(w.key)"
          @keydown="onTabKeydown($event, w.key)"
        >
          {{ w.label }}
          <span
            v-if="todoCounts[w.key]"
            class="fee-tab__count"
            :aria-label="`${todoCounts[w.key]} 項待處理`"
            >{{ todoCounts[w.key] }}</span
          >
        </button>
      </div>
    </nav>

    <!-- 工作區內容：KeepAlive 保留各區篩選/時間脈絡；async import 延遲載入 -->
    <div
      role="tabpanel"
      :id="`fee-ws-panel-${activeWs}`"
      :aria-labelledby="`fee-ws-tab-${activeWs}`"
      tabindex="0"
    >
      <KeepAlive>
        <FeeWorkbench v-if="activeWs === 'workbench'" @navigate="navigateTo" />
        <FeeBillingWorkspace
          v-else-if="activeWs === 'billing'"
          :view="activeView ?? undefined"
          :source="activeSrc ?? undefined"
          :records-mode="activeMode ?? undefined"
          :imports-open="importsOpen"
          :student-search="studentSearch"
          @change-view="onViewChange"
          @change-source="onSourceChange"
          @change-mode="onModeChange"
          @update:imports-open="onImportsToggle"
          @navigate="navigateTo"
        />
        <FeeSettlementWorkspace
          v-else
          :view="activeView ?? undefined"
          @change-view="onViewChange"
          @navigate="navigateTo"
        />
      </KeepAlive>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 學費管理（任務導向 IA）。
 *
 * 本檔只做資訊架構殼層：PageHeader、主導航、query（?ws=&view=&src=&imports=）
 * 同步與工作區掛載；業務內容全部在 components/fees/ 與 workspace/ 子元件。
 *
 * 2026-09-02 簡化改版：
 * - 主導航由四項（工作台/帳單/對帳/結算）收成三項（工作台/收款/結算），
 *   「帳單」與「對帳」合併為「收款」。
 * - 主導航樣式由 el-segmented（與次層同款 pill，三層看起來一樣）改為底線頁籤，
 *   並顯示各工作區的待辦數（來源與工作台佇列同一份 useFeeOverview 載入）。
 * - SPEC-019：費用設定（範本／銷帳碼）已全數退場，主導航不再有第四項入口。
 *
 * 舊網址（?tab= 系列與 2026-08-25 的 ?ws=recon 系列）由 resolveFeesLocation
 * 相容映射，於此以 router.replace 正規化。
 */
import { computed, defineAsyncComponent, onMounted, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import {
  FEE_MAIN_WORKSPACES,
  FEE_WORKSPACE_VIEWS,
  recallFeeView,
  rememberFeeView,
  resolveFeesLocation,
  type FeeNavTarget,
  type FeeWorkspaceKey,
} from '@/components/fees/workspace/feesNavigation'
import { useFeeOverview } from '@/components/fees/workspace/useFeeOverview'

const FeeWorkbench = defineAsyncComponent(
  () => import('@/components/fees/workspace/FeeWorkbench.vue'),
)
const FeeBillingWorkspace = defineAsyncComponent(
  () => import('@/components/fees/workspace/FeeBillingWorkspace.vue'),
)
const FeeSettlementWorkspace = defineAsyncComponent(
  () => import('@/components/fees/workspace/FeeSettlementWorkspace.vue'),
)

const route = useRoute()
const router = useRouter()

const { todoCounts, ensureLoaded } = useFeeOverview()

const resolved = computed(() => resolveFeesLocation(route.query))
const activeWs = computed(() => resolved.value.ws)
const activeView = computed(() => resolved.value.view)
const activeSrc = computed(() => resolved.value.src)
const activeMode = computed(() => resolved.value.mode)
const importsOpen = computed(() => resolved.value.imports)
const studentSearch = computed(() => {
  const raw = route.query.search
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' ? value : ''
})


// 頁籤待辦數需要工作台那批唯讀統計；即使初次落在別的工作區也要載
onMounted(() => {
  ensureLoaded()
})

// 舊 tab 深連結 / 非法值 → replace 正規化（不留歷史紀錄）
watch(
  resolved,
  (loc) => {
    if (loc.needsNormalize) {
      router.replace({ query: loc.normalizedQuery })
      return
    }
    rememberFeeView(loc.ws, loc.view)
  },
  { immediate: true },
)

function queryFor(target: FeeNavTarget): LocationQueryRaw {
  const query: LocationQueryRaw = { ...route.query, ws: target.ws }
  delete query.tab
  delete query.view
  delete query.src
  delete query.imports
  delete query.mode

  const views = FEE_WORKSPACE_VIEWS[target.ws]
  let view: string | undefined
  if (views.length > 0) {
    const candidate = target.view ?? recallFeeView(target.ws) ?? views[0].key
    view = views.some((v) => v.key === candidate) ? candidate : views[0].key
    query.view = view
  }
  if (target.src && target.ws === 'billing' && view === 'matching' && target.src !== 'collection') {
    query.src = target.src
  }
  if (target.imports && target.ws === 'billing') query.imports = '1'
  if (target.mode && target.ws === 'billing' && view === 'receivable' && target.mode !== 'statement') {
    query.mode = target.mode
  }

  // ?search= 是全域搜尋帶進來的一次性上下文（GlobalSearch 帶學生姓名直達
  // 應收帳款）。原本用 {...route.query} 起手卻沒清，於是它永久黏在網址上，
  // 使用者切走再切回收款時清單仍被那個姓名篩住（實測 170 列剩 11 列）。
  // 只有「停在應收帳款」才保留。
  const staysOnReceivable = target.ws === 'billing' && view === 'receivable'
  if (!staysOnReceivable) delete query.search

  return query
}

function onWorkspaceChange(next: FeeWorkspaceKey) {
  if (next === activeWs.value) return
  router.push({ query: queryFor({ ws: next }) })
}

function onViewChange(view: string) {
  if (view === activeView.value) return
  router.push({ query: queryFor({ ws: activeWs.value, view }) })
}

function onSourceChange(src: string) {
  if (src === activeSrc.value) return
  router.push({ query: queryFor({ ws: 'billing', view: 'matching', src }) })
}

/**
 * 匯入紀錄抽屜。
 *
 * 開啟 push（上一頁＝關閉抽屜），關閉 replace（不再往 history 多塞一筆）。
 * 原本開關都 push，關掉後按上一頁會把抽屜重新打開，要多按好幾次才離得開
 * /fees（staging 實測確實會重開）。
 */
function onImportsToggle(open: boolean) {
  if (open === importsOpen.value) return
  const query = queryFor({
    ws: 'billing',
    view: activeView.value ?? undefined,
    mode: activeMode.value ?? undefined,
    imports: open,
  })
  if (open) router.push({ query })
  else router.replace({ query })
}

function onModeChange(mode: string) {
  if (mode === activeMode.value) return
  router.push({
    query: queryFor({ ws: 'billing', view: 'receivable', mode }),
  })
}

/** WAI-ARIA tabs pattern：左右鍵在工作區間移動、Home/End 跳頭尾 */
function onTabKeydown(event: KeyboardEvent, key: FeeWorkspaceKey) {
  const keys = FEE_MAIN_WORKSPACES.map((w) => w.key)
  const current = keys.indexOf(key)
  let next: number | null = null
  if (event.key === 'ArrowRight') next = (current + 1) % keys.length
  else if (event.key === 'ArrowLeft') next = (current - 1 + keys.length) % keys.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = keys.length - 1
  if (next === null) return
  event.preventDefault()
  onWorkspaceChange(keys[next])
}

function navigateTo(target: FeeNavTarget) {
  router.push({ query: queryFor(target) })
}
</script>

<style scoped>
.student-fee-view {
  padding: var(--space-4);
  min-width: 0;
}

.fee-main-nav {
  margin-bottom: var(--space-4);
  /* 1024px 下主導航不得撐出整頁水平捲動：允許自身內部捲動兜底 */
  overflow-x: auto;
}

.fee-tabs {
  display: flex;
  align-items: flex-end;
  gap: var(--space-1);
  border-bottom: 1px solid var(--border-color);
  min-width: max-content;
}

.fee-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--touch-target-min);
  padding: var(--space-2) var(--space-4);
  border: none;
  background: none;
  font: inherit;
  font-size: var(--text-lg);
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition: color var(--transition-fast);
}

.fee-tab:hover {
  color: var(--text-primary);
}

.fee-tab--active {
  color: var(--el-color-primary);
  font-weight: 600;
}

.fee-tab--active::after {
  content: '';
  position: absolute;
  left: var(--space-3);
  right: var(--space-3);
  bottom: -1px;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--el-color-primary);
}

.fee-tab__count {
  min-width: 18px;
  padding: 0 var(--space-1);
  border-radius: var(--radius-full);
  background: var(--color-danger-soft);
  color: var(--color-danger-darker);
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1.5;
  text-align: center;
}
.student-fee-view :deep(.page-header) { margin-bottom: var(--space-3); }
</style>
