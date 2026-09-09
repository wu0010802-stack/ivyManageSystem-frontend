<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { hasPermission } from '@/utils/auth'
import HealthGrowthTab from './HealthGrowthTab.vue'
import GrowthProfileTab from './GrowthProfileTab.vue'

// 需求 2（2026-09-09）：「健康／成長」與「成長檔案」原本是 StudentDetailPanel
// 的兩個一級 tab，合併成一個父 tab，內部用「健康類／成長類」視覺分組區隔。
// 刻意不改動 HealthGrowthTab.vue / GrowthProfileTab.vue 本身（含各自的權限
// 判斷與 GrowthProfileTab 既有的 ?sub= URL 同步邏輯），只在外層加一層分組
// 切換殼，降低回歸風險。
const props = withDefaults(defineProps<{
  studentId: number
  syncUrl?: boolean
  initialGroup?: 'health' | 'growth'
}>(), {
  syncUrl: true,
  initialGroup: 'health',
})

type Group = 'health' | 'growth'

// 原本 growth_profile 一級 tab 的顯示條件是 canPortfolioRead（見
// StudentDetailPanel.vue 合併前的 TAB_DEFS）；合併後父 tab 用
// canPortfolioRead || canHealthRead 放行，但「成長類」分組本身仍只對
// PORTFOLIO_READ 開放，否則健康-only 使用者會看到一個他們原本完全看不到
// 的成長類分組（前端可見性回退，即使後端仍會 403）。
const canPortfolioRead = computed(() => hasPermission('PORTFOLIO_READ'))

const route = useRoute()
const router = useRouter()

function resolveGroup(candidate: unknown): Group {
  // 'health' 一律安全（HealthGrowthTab 內部本就有 canPortfolio/canHealth
  // 兩種 sub-tab 各自的權限判斷，且父 tab 已保證至少一項為真）；'growth'
  // 只在具備 PORTFOLIO_READ 時採信。
  if (candidate === 'growth' && canPortfolioRead.value) return 'growth'
  return 'health'
}

const initialFromQuery = route.query.group === 'growth' || route.query.group === 'health'
  ? (route.query.group as Group)
  : null

const activeGroup = ref<Group>(resolveGroup(initialFromQuery ?? props.initialGroup))

// 模擬 el-tab-pane 的 lazy 語意：分組只在「第一次被開啟」時才掛載內層元件
// （避免兩組資料一次全打 API），之後用 v-show 保留已載入的狀態不重新 mount。
const openedGroups = ref<Set<Group>>(new Set([activeGroup.value]))
watch(activeGroup, (val) => openedGroups.value.add(val))

watch(activeGroup, (val) => {
  if (!props.syncUrl) return
  const currentQuery = route.query
  if (currentQuery.group === val) return
  router.replace({ query: { ...currentQuery, group: val } })
})

// 父層（StudentDetailPanel）處理舊書籤時可能在本元件已掛載後才補上
// ?group=，故也要反向監聽 route.query.group（比照 GrowthProfileTab 對
// ?sub= 的既有做法）。
watch(
  () => route.query.group,
  (val) => {
    if (val !== 'health' && val !== 'growth') return
    const resolved = resolveGroup(val)
    if (resolved !== activeGroup.value) activeGroup.value = resolved
  },
)
</script>

<template>
  <div class="health-and-growth-tab">
    <el-radio-group v-model="activeGroup" class="group-switch">
      <el-radio-button value="health">健康類</el-radio-button>
      <el-radio-button v-if="canPortfolioRead" value="growth">成長類</el-radio-button>
    </el-radio-group>
    <div class="group-body">
      <HealthGrowthTab
        v-if="openedGroups.has('health')"
        v-show="activeGroup === 'health'"
        :student-id="studentId"
      />
      <GrowthProfileTab
        v-if="openedGroups.has('growth')"
        v-show="activeGroup === 'growth'"
        :student-id="studentId"
        :sync-url="syncUrl"
      />
    </div>
  </div>
</template>

<style scoped>
.health-and-growth-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.group-switch {
  align-self: flex-start;
}
</style>
