<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { provideOpenCycleHint } from '@/views/appraisalYearEnd/shared/useOpenCycleHint'
import ReadonlyBadge from '@/components/common/ReadonlyBadge.vue'
import { RULE_TABS, ruleTabSide, visibleRuleTabs, type AyeSide } from './ruleTabs'

const SIDE_LABELS: Record<AyeSide, string> = { appraisal: '考核', 'year-end': '年終' }

// 頁籤定義（含各頁籤的讀／寫權限 gate 與所屬邊）集中在 ./ruleTabs.ts。
// 2026-10-29 後台 IA 重整 批次 3（S1）：側欄「考核與年終」拆成「考核」「年終」兩個選單項後，
// 本 layout 只列「目前所在那一邊」的規則頁籤——考核側 scoring／bonus-rates／catalog／enrollment-targets，
// 年終側 festival-headcount／year-end-rules（歸邊依各頁籤的權限碼，見 ./ruleTabs.ts）。路徑與各頁籤權限不變。
// 兩邊都有可見頁籤的人，頁籤列上方多一個「考核／年終」切換：側欄的「年終」入口不一定看得到
//（例如只持考核＋設定讀取權限、沒有 YEAR_END_READ 的人），不能只靠側欄切邊，否則會有頁籤進不去。
const route = useRoute()
const router = useRouter()
const pathTab = computed(() => route.path.split('/')[3])
// 目前所在邊：由路徑上的頁籤名決定；停在 bare /rules（尚未 redirect）時取使用者可見的第一個頁籤的邊，
// 沒有任何可見頁籤時退回考核側（visibleTabs 為空，不渲染任何頁籤）。
const currentSide = computed<AyeSide>(() => {
  const fromPath = ruleTabSide(pathTab.value)
  if (fromPath) return fromPath
  return RULE_TABS.find((t) => t.can())?.side ?? 'appraisal'
})
const visibleTabs = computed(() => visibleRuleTabs(currentSide.value))
// 兩邊都有可見頁籤才需要切換
const sideOptions = computed(() =>
  (['appraisal', 'year-end'] as const)
    .filter((side) => visibleRuleTabs(side).length > 0)
    .map((side) => ({ label: SIDE_LABELS[side], value: side })),
)
const onSideChange = (side: string | number | boolean) => {
  if (side === currentSide.value) return
  const first = visibleRuleTabs(side as AyeSide)[0]
  if (first) router.push(`/appraisal-year-end/rules/${first.name}`)
}
// fallback 落在使用者實際看得到的第一個分頁，而非寫死 'scoring'（該頁需 APPRAISAL_READ）——
// 否則只持 SETTINGS_READ 的使用者若因故落在此 fallback 分支，el-tabs 會指向他看不到的分頁。
const activeTab = computed(() => pathTab.value ?? visibleTabs.value[0]?.name ?? 'scoring')
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
      <router-link to="/appraisal-year-end/appraisal" class="rules-open-cycle-alert__link">
        前往重算
      </router-link>
    </template>
  </el-alert>
  <el-segmented
    v-if="sideOptions.length > 1"
    class="rules-side-switch"
    data-test="rules-side-switch"
    size="small"
    :model-value="currentSide"
    :options="sideOptions"
    @change="onSideChange"
  />
  <el-tabs :model-value="activeTab" type="card" @tab-change="onTabChange">
    <el-tab-pane v-for="t in visibleTabs" :key="t.name" :name="t.name">
      <template #label>
        <span class="rules-tab-label" :data-test="`tab-label-${t.name}`">
          {{ t.label }}
          <ReadonlyBadge :permission-label="t.permLabel" :show="!t.canWrite()" />
        </span>
      </template>
    </el-tab-pane>
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
.rules-side-switch {
  margin-bottom: var(--space-3);
}
.rules-tab-label {
  display: inline-flex;
  align-items: center;
}
</style>
