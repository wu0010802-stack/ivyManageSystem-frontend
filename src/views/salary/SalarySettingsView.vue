<template>
  <div>
    <PageHeader title="薪資設定" subtitle="獎金規則、才藝老師、銀行轉帳、計算規則開關與計算規則說明" />
    <el-tabs v-model="tab" type="card" :before-leave="beforeTabLeave">
      <el-tab-pane v-if="canReadSettings" label="獎金設定" name="bonus">
        <BonusConfigPanel v-if="tab === 'bonus'" />
      </el-tab-pane>
      <el-tab-pane label="才藝老師薪資" name="art_teacher">
        <ArtTeacherPayrollPanel v-if="tab === 'art_teacher'" />
      </el-tab-pane>
      <el-tab-pane label="銀行轉帳" name="system_settings">
        <SystemSettingsPanel v-if="tab === 'system_settings'" />
      </el-tab-pane>
      <!-- 2026-10-29 S5：自「系統設定 › 分校設定」移入的薪資／請假／加班／年終／節慶口徑開關。
           元件本身讀寫 GET/PUT /system-configs/{key}：讀要 SETTINGS_READ（所以頁籤依此顯示），
           寫入權限（SETTINGS_WRITE＋金流簽核／超級管理員）逐 key 在元件內鎖定，與後端一致。 -->
      <el-tab-pane v-if="canReadSettings" label="計算規則開關" name="rule_switches">
        <SettingsTenantConfigTab v-if="tab === 'rule_switches'" placement="salary" />
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
import SettingsTenantConfigTab from '@/components/settings/SettingsTenantConfigTab.vue'
import { hasPermission } from '@/utils/auth'
import { confirmDiscardChanges, useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'
import { provideSettingsDirty } from './settingsDirty'

const canReadSettings = computed(() => hasPermission('SETTINGS_READ'))
const route = useRoute()
const router = useRouter()

// 目前頁籤記在 ?tab=，重新整理、上一頁或從別處連進來都回到同一頁；無權限的頁籤不接受。
// 節慶發放／停課登記／下學期超額／才藝獎勵金四個頁籤已於 2026-10-29（S2）移到 /salary/batches，
// 舊網址 ?tab=<這四個> 由 router 的 beforeEnter 導過去（見 router/index.ts）。
const visibleTabs = computed(() => [
  ...(canReadSettings.value ? ['bonus'] : []),
  'art_teacher',
  'system_settings',
  ...(canReadSettings.value ? ['rule_switches'] : []),
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
