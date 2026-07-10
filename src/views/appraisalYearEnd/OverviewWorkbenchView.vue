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

// 根把手 fetch 失敗顯式化：rejected 不可靜默吞掉，否則卡片會誤顯
// 「尚未建立考核週期／年終週期」空狀態，使用者會誤判系統真的沒有週期
const appraisalRootError = ref(false)
const yearEndRootError = ref(false)

// CycleOut.semester 是字串 enum 'FIRST'|'SECOND'（見 schema.d.ts Semester；非數字 1/2，
// 與 termStore.semester 是不同欄位，不要混淆）
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
    // listYearEndCycles() 未帶 AxiosResp<> 型別標註（既有缺口，超出本 task 範圍不動 api/yearEnd.ts），
    // 本地明確標型別以避免 reduce callback 落入 implicit any
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
onMounted(loadHandles)

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
      <template v-if="key === 'appraisal' && canAppraisal">
        <!-- 根把手失敗 → 顯式錯誤卡（重試重跑父層 loadHandles），不得落入子卡的「尚未建立」空狀態 -->
        <el-card v-if="appraisalRootError" shadow="never" data-test="appraisal-card" class="wb-card">
          <template #header>
            <div class="wb-card__head"><span class="wb-card__title">當期考核</span></div>
          </template>
          <div class="wb-card__error">
            載入失敗 <el-button size="small" text type="primary" @click="loadHandles">重試</el-button>
          </div>
        </el-card>
        <WorkbenchAppraisalCard v-else :cycle="appraisalCycle" />
      </template>
      <template v-else-if="key === 'year-end' && canYearEnd">
        <el-card v-if="yearEndRootError" shadow="never" data-test="year-end-card" class="wb-card">
          <template #header>
            <div class="wb-card__head"><span class="wb-card__title">年終獎金</span></div>
          </template>
          <div class="wb-card__error">
            載入失敗 <el-button size="small" text type="primary" @click="loadHandles">重試</el-button>
          </div>
        </el-card>
        <WorkbenchYearEndCard v-else :cycle="yearEndCycle" />
      </template>
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
/* 根把手錯誤卡：與子卡同視覺（子卡 scoped style 不外溢，父層需自備同名樣式） */
.wb-card__head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.wb-card__title { font-weight: 600; }
.wb-card__error { display: flex; align-items: center; gap: var(--space-2); color: var(--el-color-danger); font-size: var(--text-sm); }
</style>
