<script setup lang="ts">
// 待辦頁：hero 卡＋統一待辦清單（左欄）＋進行中的週期／資料新鮮度側欄（右欄）。
// Batch 15：4 張各自獨立主題卡（舊版）已退場，4 個 composable（Batch 14）+
// deriveTodoList（Batch 14）在此接線消費。
import { ref, computed } from 'vue'
import { getAppraisalCurrentCycle } from '@/api/appraisal'
import { listYearEndCycles } from '@/api/yearEnd'
import type { Schema } from '@/api/_generated/typed'
import { hasPermission } from '@/utils/auth'
import { deriveTodoList, deriveNextStep } from './nextStep'
import {
  useAppraisalWorkbenchStats,
  useYearEndWorkbenchStats,
  useExceptionsWorkbenchStats,
  usePayoutWorkbenchStats,
} from './useWorkbenchStats'
import WorkbenchNextStepCard from './components/WorkbenchNextStepCard.vue'
import WorkbenchTodoList from './components/WorkbenchTodoList.vue'
import WorkbenchCyclesSidebar from './components/WorkbenchCyclesSidebar.vue'
import WorkbenchFreshnessSidebar from './components/WorkbenchFreshnessSidebar.vue'

interface CycleHandle { id: number; label: string; status: string }

const appraisalCycle = ref<CycleHandle | null>(null)
const yearEndCycle = ref<CycleHandle | null>(null)
const payoutYear = new Date().getFullYear()

// 根把手 fetch 失敗顯式化：rejected 不可靜默吞掉，否則會誤讓 composable 判定
// 「查無週期」而非「載入失敗」（沿用既有 appraisalRootError/yearEndRootError
// 既有作法，語意不變，只是不再驅動卡片級錯誤 UI，改驅動 partialError 彙總）。
const appraisalRootError = ref(false)
const yearEndRootError = ref(false)

const semesterLabel = (s: string) => (s === 'FIRST' ? '上' : '下')

async function loadHandles() {
  appraisalRootError.value = false
  yearEndRootError.value = false
  const [appraisalRes, yearEndRes] = await Promise.allSettled([getAppraisalCurrentCycle(), listYearEndCycles()])

  if (appraisalRes.status === 'fulfilled') {
    const c = appraisalRes.value.data
    appraisalCycle.value = c
      ? { id: c.id, label: `${c.academic_year} 學年${semesterLabel(c.semester)}學期`, status: c.status }
      : null
  } else {
    appraisalRootError.value = true
  }

  if (yearEndRes.status === 'fulfilled') {
    const cycles = yearEndRes.value.data as Schema<'YearEndCycleOut'>[]
    if (cycles.length > 0) {
      const latest = cycles.reduce((a, b) => (b.academic_year > a.academic_year ? b : a))
      yearEndCycle.value = { id: latest.id, label: `${latest.academic_year} 學年度`, status: latest.status }
    } else {
      yearEndCycle.value = null
    }
  } else {
    yearEndRootError.value = true
  }
}

const canAppraisal = computed(() => hasPermission('APPRAISAL_READ'))
const canYearEnd = computed(() => hasPermission('YEAR_END_READ'))
const canExceptions = computed(() => hasPermission('APPRAISAL_READ') || hasPermission('YEAR_END_READ'))
const canPayout = computed(() => hasPermission('APPRAISAL_FINALIZE'))

// 權限閘門直接內建在傳給 composable 的 getter：無權限時 getter 恆回 null，
// composable 內部既有的「無 cycle 不查」路徑（stat 直接設 0）自然生效，不需要
// 額外的 onMounted 補丁（比照舊版 OverviewWorkbenchView.vue 需要一段
// onMounted 手動幫沒 render 的卡片把 stat 補 0 的作法，這裡結構性地不會有
// 這個問題）。
const appraisalStats = useAppraisalWorkbenchStats(() => (canAppraisal.value ? appraisalCycle.value : null))
const yearEndStats = useYearEndWorkbenchStats(() => (canYearEnd.value ? yearEndCycle.value : null))
const exceptionsStats = useExceptionsWorkbenchStats(
  () => (canExceptions.value ? appraisalCycle.value : null),
  () => (canExceptions.value ? yearEndCycle.value : null),
)
const payoutStats = usePayoutWorkbenchStats(() => (canPayout.value ? payoutYear : null))

const cardStats = computed(() => ({
  appraisal: appraisalRootError.value ? 0 : appraisalStats.stat.value,
  yearEnd: yearEndRootError.value ? 0 : yearEndStats.stat.value,
  exceptions: exceptionsStats.stat.value,
  payout: payoutStats.stat.value,
}))

const partialError = computed(
  () =>
    appraisalRootError.value ||
    yearEndRootError.value ||
    !!appraisalStats.errorMsg.value ||
    !!yearEndStats.errorMsg.value ||
    !!exceptionsStats.errorMsg.value ||
    (!!payoutStats.errorMsg.value && !payoutStats.notReady.value),
)

const nextStep = computed(() =>
  deriveNextStep({
    appraisalCycle: appraisalCycle.value,
    yearEndCycle: yearEndCycle.value,
    blockingExceptions: cardStats.value.exceptions,
    yearEndPendingSign: cardStats.value.yearEnd,
    appraisalPendingSign: cardStats.value.appraisal,
    payoutReadyCount: cardStats.value.payout,
    canAppraisal: canAppraisal.value,
    canYearEnd: canYearEnd.value,
    payoutYear,
  }),
)
const todoItems = computed(() =>
  deriveTodoList({
    appraisalCycle: appraisalCycle.value,
    yearEndCycle: yearEndCycle.value,
    blockingExceptions: cardStats.value.exceptions,
    yearEndPendingSign: cardStats.value.yearEnd,
    appraisalPendingSign: cardStats.value.appraisal,
    payoutReadyCount: cardStats.value.payout,
    canAppraisal: canAppraisal.value,
    canYearEnd: canYearEnd.value,
    payoutYear,
  }),
)

async function retryAll() {
  await loadHandles()
  await Promise.all([appraisalStats.load(), yearEndStats.load(), exceptionsStats.load(), payoutStats.load()])
}

loadHandles()
</script>

<template>
  <div class="wb-grid">
    <WorkbenchNextStepCard
      :step="nextStep"
      :partial-error="partialError"
      class="wb-next-slot"
      @retry="retryAll"
    />
    <div class="wb-main">
      <WorkbenchTodoList :items="todoItems" />
    </div>
    <div class="wb-side">
      <WorkbenchCyclesSidebar />
      <WorkbenchFreshnessSidebar />
    </div>
  </div>
</template>

<style scoped>
.wb-grid {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: var(--space-4);
}
.wb-next-slot { grid-column: 1 / -1; }
.wb-main { min-width: 0; }
.wb-side { display: flex; flex-direction: column; gap: var(--space-4); }
@media (max-width: 900px) {
  .wb-grid { grid-template-columns: 1fr; }
}
</style>
