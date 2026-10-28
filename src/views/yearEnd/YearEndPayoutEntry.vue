<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listYearEndCycles } from '@/api/yearEnd'
import EmptyState from '@/components/common/EmptyState.vue'
import { payoutYearToSourceAcademicYear } from '@/utils/academic'

// 純解析器：獨立發放路由退場後的落點。舊路由只認「發放年度」（AD year），
// 工作區以 year_end_cycles.id 為主鍵，兩者換算與 AppraisalPayoutView.vue 的
// sourceAcademicYear 同一條：目標週期學年 = payoutYearToSourceAcademicYear(發放年度)
// （= 發放年度 − 1913，見 @/utils/academic）。
interface YearEndCycle { id: number; academic_year: number }

const route = useRoute()
const router = useRouter()
const notFound = ref(false)
const loadError = ref(false)

async function resolve() {
  notFound.value = false
  loadError.value = false
  const year = Number(route.query.year) || new Date().getFullYear()
  const targetAcademicYear = payoutYearToSourceAcademicYear(year)
  try {
    const res = await listYearEndCycles()
    const cycles = res.data as YearEndCycle[]
    const match = cycles.find((c) => c.academic_year === targetAcademicYear)
    if (match) {
      router.replace({
        path: `/appraisal-year-end/year-end/cycles/${match.id}`,
        query: { step: 'payout', year: String(year) },
      })
    } else {
      notFound.value = true
    }
  } catch {
    loadError.value = true
  }
}
onMounted(resolve)
</script>

<template>
  <div class="ye-payout-entry">
    <EmptyState
      v-if="notFound"
      title="找不到對應的年終週期"
      description="此年度尚未建立對應的年終結算週期，請先於年終清單建立，或切換其他年度。"
    >
      <template #action>
        <router-link to="/appraisal-year-end/year-end">
          <el-button type="primary" plain>前往年終清單</el-button>
        </router-link>
      </template>
    </EmptyState>
    <div v-else-if="loadError" class="ye-payout-entry__error">
      載入失敗
      <el-button data-test="payout-entry-retry" size="small" text type="primary" @click="resolve">重試</el-button>
    </div>
  </div>
</template>

<style scoped>
.ye-payout-entry { padding: var(--space-4); }
.ye-payout-entry__error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--el-color-danger);
  font-size: var(--text-sm);
}
</style>
