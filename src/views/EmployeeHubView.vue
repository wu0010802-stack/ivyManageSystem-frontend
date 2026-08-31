<script setup lang="ts">
import { defineAsyncComponent, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { hasFullSalaryView } from '@/utils/auth'

const EmployeeListView = defineAsyncComponent(() => import('./EmployeeListView.vue'))
const OffboardingView = defineAsyncComponent(() => import('./admin/OffboardingView.vue'))

type SectionKey = 'employees' | 'offboarding'

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'employees', label: '員工管理' },
  { key: 'offboarding', label: '離職管理' },
]

const availableSections = hasFullSalaryView() ? SECTIONS : SECTIONS.slice(0, 1)
const segmentedOptions = availableSections.map((s) => ({ label: s.label, value: s.key }))

const route = useRoute()
const router = useRouter()

const resolveSection = (raw: unknown): SectionKey => {
  const r = Array.isArray(raw) ? raw[0] : raw
  return availableSections.find((s) => s.key === r)?.key ?? availableSections[0].key
}

const activeSection = ref<SectionKey>(resolveSection(route.query.section))

// 缺漏 / 不合法 section → 修正 URL 到第一個分頁（與 AppraisalYearEndView 一致）
if (route.query.section !== activeSection.value) {
  router.replace({ query: { ...route.query, section: activeSection.value } })
}

watch(
  () => route.query.section,
  (next) => {
    const resolved = resolveSection(next)
    if (resolved !== activeSection.value) activeSection.value = resolved
  },
)

const onSectionChange = (val: string | number) => {
  const next = String(val) as SectionKey
  if (!availableSections.some((section) => section.key === next)) return
  if (next === activeSection.value) return
  const query: LocationQueryRaw = { ...route.query, section: next }
  router.replace({ query })
}
</script>

<template>
  <div class="employee-hub-view crisp-surface">
    <el-segmented
      :model-value="activeSection"
      :options="segmentedOptions"
      size="large"
      class="section-switcher"
      @change="onSectionChange"
    />
    <div class="section-body">
      <EmployeeListView v-if="activeSection === 'employees'" />
      <OffboardingView v-else-if="activeSection === 'offboarding'" />
    </div>
  </div>
</template>

<style scoped>
.employee-hub-view {
  padding: var(--space-5);
}
.section-switcher {
  margin-bottom: var(--space-4);
}
</style>
