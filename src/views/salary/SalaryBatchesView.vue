<template>
  <div>
    <PageHeader title="獎金批次作業" subtitle="節慶發放與未扣餘額、節慶停課登記、下學期超額獎金與才藝獎勵金" />
    <el-tabs v-model="tab" type="card" :before-leave="beforeTabLeave">
      <el-tab-pane v-if="canReadSalary" label="節慶發放與未扣餘額" name="festival_payout">
        <FestivalPayoutPanel v-if="tab === 'festival_payout'" />
      </el-tab-pane>
      <el-tab-pane v-if="canReadSalary" label="節慶停課登記" name="festival_suspension">
        <FestivalSuspensionPanel v-if="tab === 'festival_suspension'" />
      </el-tab-pane>
      <el-tab-pane v-if="canViewFullSalary" label="下學期超額獎金" name="semester2_excess">
        <Semester2ExcessPanel v-if="tab === 'semester2_excess'" />
      </el-tab-pane>
      <el-tab-pane v-if="canViewFullSalary" label="下學期才藝獎勵金" name="semester2_activity">
        <Semester2ActivityPanel v-if="tab === 'semester2_activity'" />
      </el-tab-pane>
    </el-tabs>
    <el-empty v-if="visibleTabs.length === 0" description="目前帳號沒有可用的獎金批次作業" />
  </div>
</template>

<script setup lang="ts">
// 自 SalarySettingsView 搬出的四個頁籤，面板與頁籤 v-if gate 原樣照搬：
// 節慶發放／停課登記 = SALARY_READ；下學期超額／才藝獎勵金 = SALARY_READ 且全員薪資視野。
// 路由 /salary/batches 由 manifest 的 /salary prefix（SALARY_READ）涵蓋，不新增權限規則。
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import FestivalPayoutPanel from './FestivalPayoutPanel.vue'
import FestivalSuspensionPanel from './FestivalSuspensionPanel.vue'
import Semester2ExcessPanel from './Semester2ExcessPanel.vue'
import Semester2ActivityPanel from './Semester2ActivityPanel.vue'
import { hasFullSalaryView, hasPermission } from '@/utils/auth'
import { confirmDiscardChanges, useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'
import { provideSettingsDirty } from './settingsDirty'

const canReadSalary = computed(() => hasPermission('SALARY_READ'))
const canViewFullSalary = computed(() => canReadSalary.value && hasFullSalaryView())
const route = useRoute()
const router = useRouter()

// 目前頁籤記在 ?tab=，重新整理、上一頁或從別處連進來都回到同一頁；無權限的頁籤不接受
const visibleTabs = computed<string[]>(() => [
  ...(canReadSalary.value ? ['festival_payout', 'festival_suspension'] : []),
  ...(canViewFullSalary.value ? ['semester2_excess', 'semester2_activity'] : []),
])
const queryTab = typeof route.query.tab === 'string' ? route.query.tab : ''
const tab = ref(visibleTabs.value.includes(queryTab) ? queryTab : (visibleTabs.value[0] ?? ''))
watch(tab, (value) => {
  if (value && route.query.tab !== value) router.replace({ query: { ...route.query, tab: value } })
})

// 面板以 v-if 掛載，切走就卸載；節慶發放面板有「生效年月」草稿，有未儲存變更時先問
const { dirtyLabels } = provideSettingsDirty()
useUnsavedChangesGuard(() => dirtyLabels().length > 0)

async function beforeTabLeave(): Promise<boolean> {
  const dirty = dirtyLabels()
  if (dirty.length === 0) return true
  return confirmDiscardChanges({
    message: `「${dirty.join('」、「')}」有未儲存的變更，切換分頁後會遺失。確定切換？`,
    cancelText: '留在此分頁',
  })
}
</script>
