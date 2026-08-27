<template>
  <div>
    <PageHeader :title="`${query.year} 年 ${query.month} 月結薪`" :subtitle="statusLabel">
      <template #actions>
        <el-select v-model="query.year" style="width: 100px" aria-label="年份" :disabled="calculating">
          <el-option v-for="y in yearOptions" :key="y" :value="y" :label="`${y} 年`" />
        </el-select>
        <el-select v-model="query.month" style="width: 90px" aria-label="月份" :disabled="calculating">
          <el-option v-for="m in 12" :key="m" :value="m" :label="`${m} 月`" />
        </el-select>
      </template>
    </PageHeader>

    <!-- 步驟列：可點擊跳轉，不強制線性（熟手可直跳）；計算進行中禁止手動切換，
         避免中途切步驟/切月製造孤兒輪詢（P1 #6） -->
    <el-steps :active="stepIndex" align-center class="settle-steps">
      <el-step
        v-for="(s, i) in STEPS"
        :key="s.key"
        :title="s.title"
        class="settle-step"
        :class="{ 'settle-step--disabled': calculating }"
        @click="goManual(i)"
      />
    </el-steps>

    <component :is="STEPS[stepIndex].comp" @next="go(stepIndex + 1)" />
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, toRef, provide, onMounted, watch, ref, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import StepPrecheck from './settle/StepPrecheck.vue'
import StepCalculate from './settle/StepCalculate.vue'
import StepReview from './settle/StepReview.vue'
import StepFinalize from './settle/StepFinalize.vue'
import StepExport from './settle/StepExport.vue'
import { useSalarySettlement, type SettlementStatus } from '@/composables/useSalarySettlement'

interface StepDef { key: string; title: string; comp: Component }
const STEPS: StepDef[] = [
    { key: 'precheck', title: '結算前檢查', comp: StepPrecheck },
    { key: 'calculate', title: '計算', comp: StepCalculate },
    { key: 'review', title: '覆核與調整', comp: StepReview },
    { key: 'finalize', title: '定案', comp: StepFinalize },
    { key: 'export', title: '匯出轉帳', comp: StepExport },
]

const route = useRoute()
const router = useRouter()
const now = new Date()
const routeNumber = (value: unknown): number => Number(Array.isArray(value) ? value[0] : value)
const query = reactive({
    year: routeNumber(route.query.year) || now.getFullYear(),
    month: routeNumber(route.query.month) || now.getMonth() + 1,
})
const yearOptions = computed(() => [query.year - 1, query.year, query.year + 1])

const stepIndex = computed(() => {
    const i = STEPS.findIndex((s) => s.key === route.query.step)
    return i >= 0 ? i : 0
})
const go = (i: number) => {
    if (i < 0 || i >= STEPS.length) return
    router.replace({
        query: { ...route.query, year: String(query.year), month: String(query.month), step: STEPS[i].key },
    })
}
// 計算進行中旗標：StepCalculate 寫入，此處用來 disable 年/月選擇器與步驟列（P1 #6）
const calculating = ref(false)
provide('settleCalculating', calculating)
// 使用者手動點步驟列跳轉：計算進行中一律擋下（P1 #6），避免中途離開製造孤兒輪詢。
// `go` 本身仍不擋——StepCalculate 計算成功時的 `@next` 走 go，讓自動前進不受此擋阻。
const goManual = (i: number) => {
    if (calculating.value) return
    go(i)
}
// 年/月切換時同步到 URL（深連結可分享、重整不掉狀態）
watch(() => [query.year, query.month], ([year, month]) => {
    if (routeNumber(route.query.year) === year && routeNumber(route.query.month) === month) return
    go(stepIndex.value)
})
// 同一路由只改 query 時 Vue Router 會重用元件；同步外部 deep-link／上一頁／下一頁，
// 否則 URL 已換月但結薪畫面與 composable 仍停在舊月份。
watch(() => [route.query.year, route.query.month], ([routeYear, routeMonth]) => {
    const year = routeNumber(routeYear)
    const month = routeNumber(routeMonth)
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return
    if (query.year !== year) query.year = year
    if (query.month !== month) query.month = month
})

const settlement = useSalarySettlement(toRef(query, 'year'), toRef(query, 'month'))
provide('settlement', settlement)
provide('settleQuery', query)
onMounted(settlement.refresh)

const STATUS_LABEL: Record<SettlementStatus, string> = {
    not_calculated: '未計算',
    needs_recalc: '需重算',
    reviewing: '覆核中',
    finalized: '已定案',
}
const statusLabel = computed(() => `狀態：${STATUS_LABEL[settlement.status.value]}`)
</script>

<style scoped>
.settle-steps {
  margin-bottom: var(--space-6);
}

.settle-step {
  cursor: pointer;
}

.settle-step :deep(.el-step__title) {
  font-size: var(--text-sm);
}

.settle-step--disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
