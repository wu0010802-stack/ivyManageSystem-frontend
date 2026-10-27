<template>
  <div>
    <PageHeader title="薪資設定" subtitle="獎金規則、節慶發放、才藝老師、銀行轉帳與計算規則說明" />
    <el-tabs v-model="tab" type="card" :before-leave="beforeTabLeave">
      <el-tab-pane v-if="canReadSettings" label="獎金設定" name="bonus">
        <BonusConfigPanel v-if="tab === 'bonus'" />
      </el-tab-pane>
      <el-tab-pane label="才藝老師薪資" name="art_teacher">
        <ArtTeacherPayrollPanel v-if="tab === 'art_teacher'" />
      </el-tab-pane>
      <el-tab-pane v-if="canReadSalary" label="節慶發放與未扣餘額" name="festival_payout">
        <FestivalPayoutPanel v-if="tab === 'festival_payout'" />
      </el-tab-pane>
      <el-tab-pane v-if="canViewFullSalary" label="下學期超額獎金" name="semester2_excess">
        <Semester2ExcessPanel v-if="tab === 'semester2_excess'" />
      </el-tab-pane>
      <el-tab-pane v-if="canViewFullSalary" label="下學期才藝獎勵金" name="semester2_activity">
        <Semester2ActivityPanel v-if="tab === 'semester2_activity'" />
      </el-tab-pane>
      <el-tab-pane label="銀行轉帳" name="system_settings">
        <SystemSettingsPanel v-if="tab === 'system_settings'" />
      </el-tab-pane>
      <el-tab-pane label="計算規則說明" name="logic">
        <SalaryLogicPanel v-if="tab === 'logic'" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import BonusConfigPanel from './BonusConfigPanel.vue'
import ArtTeacherPayrollPanel from './ArtTeacherPayrollPanel.vue'
import SystemSettingsPanel from './SystemSettingsPanel.vue'
import SalaryLogicPanel from './SalaryLogicPanel.vue'
import FestivalPayoutPanel from './FestivalPayoutPanel.vue'
import Semester2ExcessPanel from './Semester2ExcessPanel.vue'
import Semester2ActivityPanel from './Semester2ActivityPanel.vue'
import { hasFullSalaryView, hasPermission } from '@/utils/auth'
import { confirmDiscardChanges, useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'
import { provideSettingsDirty } from './settingsDirty'

const canReadSettings = computed(() => hasPermission('SETTINGS_READ'))
const canReadSalary = computed(() => hasPermission('SALARY_READ'))
const canViewFullSalary = computed(() => canReadSalary.value && hasFullSalaryView())
const route = useRoute()
const router = useRouter()

// 目前頁籤記在 ?tab=，重新整理、上一頁或從別處連進來都回到同一頁；無權限的頁籤不接受
const visibleTabs = computed(() => [
  ...(canReadSettings.value ? ['bonus'] : []),
  'art_teacher',
  ...(canReadSalary.value ? ['festival_payout'] : []),
  ...(canViewFullSalary.value ? ['semester2_excess', 'semester2_activity'] : []),
  'system_settings',
  'logic',
])
const queryTab = typeof route.query.tab === 'string' ? route.query.tab : ''
const tab = ref(visibleTabs.value.includes(queryTab) ? queryTab : visibleTabs.value[0])
watch(tab, (value) => {
  if (route.query.tab !== value) router.replace({ query: { ...route.query, tab: value } })
})

// 外層頁籤以 v-if 掛載面板，切走就卸載；有未儲存變更時先問，並說明是哪幾塊
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
