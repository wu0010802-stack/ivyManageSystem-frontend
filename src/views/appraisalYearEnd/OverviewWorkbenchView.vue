<script setup lang="ts">
// 總覽工作台：四張卡（考核 / 年終 / 例外 / 發放）。父層只抓兩個「週期把手」
// （當期考核週期、最新年終週期），以 props 傳卡片；各卡自抓明細、各自 skeleton/錯誤重試。
import { ref, computed, onMounted } from 'vue'
import { getAppraisalCurrentCycle } from '@/api/appraisal'
import { listYearEndCycles } from '@/api/yearEnd'
import type { Schema } from '@/api/_generated/typed'
import { hasPermission } from '@/utils/auth'
import WorkbenchAppraisalCard from './components/WorkbenchAppraisalCard.vue'
import WorkbenchYearEndCard from './components/WorkbenchYearEndCard.vue'
import WorkbenchExceptionsCard from './components/WorkbenchExceptionsCard.vue'
import WorkbenchPayoutCard from './components/WorkbenchPayoutCard.vue'

interface CycleHandle { id: number; label: string; status: string }

const appraisalCycle = ref<CycleHandle | null>(null)
const yearEndCycle = ref<CycleHandle | null>(null)
const payoutYear = new Date().getFullYear()

// CycleOut.semester 是字串 enum 'FIRST'|'SECOND'（見 schema.d.ts Semester；非數字 1/2，
// 與 termStore.semester 是不同欄位，不要混淆）
const semesterLabel = (s: string) => (s === 'FIRST' ? '上' : '下')

onMounted(async () => {
  const [appraisalRes, yearEndRes] = await Promise.allSettled([getAppraisalCurrentCycle(), listYearEndCycles()])

  if (appraisalRes.status === 'fulfilled' && appraisalRes.value.data) {
    const c = appraisalRes.value.data
    appraisalCycle.value = { id: c.id, label: `${c.academic_year} 學年${semesterLabel(c.semester)}學期`, status: c.status }
  }

  if (yearEndRes.status === 'fulfilled' && yearEndRes.value.data.length > 0) {
    // listYearEndCycles() 未帶 AxiosResp<> 型別標註（既有缺口，超出本 task 範圍不動 api/yearEnd.ts），
    // 本地明確標型別以避免 reduce callback 落入 implicit any
    const cycles = yearEndRes.value.data as Schema<'YearEndCycleOut'>[]
    const latest = cycles.reduce((a, b) => (b.academic_year > a.academic_year ? b : a))
    yearEndCycle.value = { id: latest.id, label: `${latest.academic_year} 學年度`, status: latest.status }
  }
})

// 年終週期為 OPEN 時（結算進行中）優先排年終卡；否則考核卡優先（平時考核簽核較常用）
const cardOrder = computed(() =>
  yearEndCycle.value?.status === 'OPEN'
    ? (['year-end', 'appraisal', 'exceptions', 'payout'] as const)
    : (['appraisal', 'year-end', 'exceptions', 'payout'] as const),
)

const canAppraisal = computed(() => hasPermission('APPRAISAL_READ'))
const canYearEnd = computed(() => hasPermission('YEAR_END_READ'))
const canExceptions = computed(() => hasPermission('APPRAISAL_READ') || hasPermission('YEAR_END_READ'))
const canPayout = computed(() => hasPermission('APPRAISAL_FINALIZE'))
</script>

<template>
  <div class="wb-grid">
    <template v-for="key in cardOrder" :key="key">
      <WorkbenchAppraisalCard v-if="key === 'appraisal' && canAppraisal" :cycle="appraisalCycle" />
      <WorkbenchYearEndCard v-else-if="key === 'year-end' && canYearEnd" :cycle="yearEndCycle" />
      <WorkbenchExceptionsCard
        v-else-if="key === 'exceptions' && canExceptions"
        :appraisal-cycle="appraisalCycle"
        :year-end-cycle="yearEndCycle"
      />
      <WorkbenchPayoutCard v-else-if="key === 'payout' && canPayout" :year="payoutYear" />
    </template>
  </div>
</template>

<style scoped>
.wb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--space-4);
}
</style>
