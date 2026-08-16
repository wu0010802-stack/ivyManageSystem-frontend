<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { hasPermission } from '@/utils/auth'
import { PAGE_TERMS } from '@/constants/moduleTerms'

interface SectionDef { key: string; label: string; to: string; can: () => boolean }

// 權限對齊 spec：規則設定「任一子頁可見即顯示」；總覽=任一模組權限
const SECTIONS: SectionDef[] = [
  { key: 'overview', label: '總覽', to: '/appraisal-year-end/overview',
    can: () => ['APPRAISAL_READ', 'YEAR_END_READ', 'SETTINGS_READ', 'SALARY_READ', 'APPRAISAL_FINALIZE'].some((p) => hasPermission(p)) },
  { key: 'appraisal', label: '考核', to: '/appraisal-year-end/appraisal/current', can: () => hasPermission('APPRAISAL_READ') },
  { key: 'year-end', label: '年終', to: '/appraisal-year-end/year-end',
    can: () => hasPermission('YEAR_END_READ') || hasPermission('APPRAISAL_FINALIZE') },
  { key: 'payout', label: '發放', to: '/appraisal-year-end/year-end/payout',
    can: () => hasPermission('APPRAISAL_FINALIZE') },
  { key: 'rules', label: '規則設定', to: '/appraisal-year-end/rules',
    can: () => hasPermission('APPRAISAL_READ') || hasPermission('SETTINGS_READ') },
  { key: 'exceptions', label: PAGE_TERMS.yearEndExceptions, to: '/appraisal-year-end/exceptions',
    can: () => hasPermission('APPRAISAL_READ') || hasPermission('YEAR_END_READ') },
]

const route = useRoute()
const router = useRouter()
const sections = computed(() => SECTIONS.filter((s) => s.can()))
// payout 路由 path 第 3 段是 'year-end'（/appraisal-year-end/year-end/payout），
// 若沿用純 split 邏輯會誤停「年終」；特判優先於既有規則。年終週期工作區
// （/year-end/cycles/:id）不受影響，仍落在 path[2]='year-end'。
const activeKey = computed(() => {
  if (route.path.startsWith('/appraisal-year-end/year-end/payout')) return 'payout'
  return route.path.split('/')[2] ?? 'overview'
})
const segmentedOptions = computed(() => sections.value.map((s) => ({ label: s.label, value: s.key })))
const onSectionChange = (val: string | number) => {
  const target = SECTIONS.find((s) => s.key === String(val))
  if (target && activeKey.value !== target.key) router.push(target.to)
}
</script>

<template>
  <div class="aye-layout">
    <el-segmented
      v-if="segmentedOptions.length > 0"
      class="aye-nav"
      :model-value="activeKey"
      :options="segmentedOptions"
      size="large"
      @change="onSectionChange"
    />
    <div class="aye-body">
      <router-view />
    </div>
    <el-empty v-if="segmentedOptions.length === 0" description="無權限檢視此頁" />
  </div>
</template>

<style scoped>
.aye-layout { padding: var(--space-5); }
.aye-nav { margin-bottom: var(--space-3); }
</style>
