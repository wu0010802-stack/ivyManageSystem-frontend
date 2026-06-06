<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { hasPermission } from '@/utils/auth'

const AppraisalManagementView = defineAsyncComponent(() => import('./AppraisalManagementView.vue'))
const YearEndListView = defineAsyncComponent(() => import('./yearEnd/YearEndListView.vue'))
const AppraisalPayoutView = defineAsyncComponent(() => import('./yearEnd/AppraisalPayoutView.vue'))

type SectionKey = 'appraisal' | 'year-end' | 'payout'

interface SectionDef {
  key: SectionKey
  label: string
  can: () => boolean
}

const ALL_SECTIONS: SectionDef[] = [
  // 對齊內層 API：考核端點全要 APPRAISAL_READ（後端 api/appraisal）。原用
  // SETTINGS_READ/SALARY_READ 判可見，無 APPRAISAL_READ 者看得到分頁卻 API 403。
  { key: 'appraisal', label: '考核管理', can: () => hasPermission('APPRAISAL_READ') },
  { key: 'year-end', label: '年終獎金', can: () => hasPermission('YEAR_END_READ') },
  { key: 'payout', label: '考核年終', can: () => hasPermission('APPRAISAL_FINALIZE') },
]

const route = useRoute()
const router = useRouter()

const availableSections = computed(() => ALL_SECTIONS.filter((s) => s.can()))
const segmentedOptions = computed(() =>
  availableSections.value.map((s) => ({ label: s.label, value: s.key })),
)

const resolveSection = (raw: unknown): SectionKey | undefined => {
  const r = Array.isArray(raw) ? raw[0] : raw
  const available = availableSections.value
  return (available.find((s) => s.key === r) ?? available[0])?.key
}

const activeSection = ref<SectionKey | undefined>(resolveSection(route.query.section))

// 缺漏/無權限 section → 修正 URL 到第一個可用
if (activeSection.value && route.query.section !== activeSection.value) {
  router.replace({ query: { ...route.query, section: activeSection.value } })
}

watch(
  () => route.query.section,
  (next) => {
    const resolved = resolveSection(next)
    if (resolved && resolved !== activeSection.value) activeSection.value = resolved
  },
)

const onSectionChange = (val: string | number) => {
  const next = String(val) as SectionKey
  if (next === activeSection.value) return
  const query: LocationQueryRaw = { ...route.query, section: next }
  // tab 屬於 appraisal 內層 tab；切離 appraisal 時清除避免殘留
  if (next !== 'appraisal') delete (query as Record<string, unknown>).tab
  router.replace({ query })
}
</script>

<template>
  <div class="appraisal-year-end-view">
    <el-segmented
      v-if="segmentedOptions.length > 0"
      :model-value="activeSection"
      :options="segmentedOptions"
      size="large"
      class="section-switcher"
      @change="onSectionChange"
    />
    <div class="section-body">
      <AppraisalManagementView v-if="activeSection === 'appraisal'" />
      <YearEndListView v-else-if="activeSection === 'year-end'" />
      <AppraisalPayoutView v-else-if="activeSection === 'payout'" />
      <el-empty v-else description="無權限檢視此頁" />
    </div>
  </div>
</template>

<style scoped>
.appraisal-year-end-view {
  padding: var(--space-5);
}
.section-switcher {
  margin-bottom: var(--space-4);
}
</style>
