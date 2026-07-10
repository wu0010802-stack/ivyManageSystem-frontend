<script setup lang="ts">
import { ref, watch } from 'vue'
import { getYearEndGrid } from '@/api/yearEnd'
import { apiError } from '@/utils/error'
import { CYCLE_STATUS_LABEL, CYCLE_STATUS_TAG } from '@/constants/appraisalYearEnd'
import SignProgressBar from './SignProgressBar.vue'

const props = defineProps<{ cycle: { id: number; label: string; status: string } | null }>()
const loading = ref(false)
const error = ref('')
const counts = ref<Record<string, number>>({})
const pendingCount = ref(0)

// getYearEndGrid 回傳裸陣列 GridRowOut[]（非 { rows: [...] }，見 schema.d.ts grid_endpoint_...）
async function load() {
  if (!props.cycle) return
  loading.value = true
  error.value = ''
  try {
    const rows = (await getYearEndGrid(props.cycle.id)).data
    const acc: Record<string, number> = {}
    for (const r of rows) acc[r.status] = (acc[r.status] ?? 0) + 1
    counts.value = acc
    pendingCount.value = rows.filter((r) => r.status !== 'FINALIZED').length
  } catch (e) {
    error.value = apiError(e, '載入失敗')
  } finally {
    loading.value = false
  }
}
// 父層 cycle 把手為非同步取得，watch＋immediate 取代 onMounted（見 WorkbenchAppraisalCard 同註解）
watch(() => props.cycle?.id, load, { immediate: true })
</script>

<template>
  <el-card shadow="never" data-test="year-end-card" class="wb-card">
    <template #header>
      <div class="wb-card__head">
        <span class="wb-card__title">年終獎金</span>
        <el-tag v-if="cycle" size="small" :type="CYCLE_STATUS_TAG[cycle.status] ?? 'info'">
          {{ cycle.label }}（{{ CYCLE_STATUS_LABEL[cycle.status] ?? cycle.status }}）
        </el-tag>
      </div>
    </template>
    <el-skeleton v-if="loading" :rows="2" animated />
    <div v-else-if="error" class="wb-card__error">
      載入失敗 <el-button size="small" text type="primary" @click="load">重試</el-button>
    </div>
    <el-empty v-else-if="!cycle" description="尚未建立年終週期" :image-size="48">
      <router-link class="wb-card__cta" to="/appraisal-year-end/year-end">前往建立 →</router-link>
    </el-empty>
    <template v-else>
      <SignProgressBar :counts="counts" />
      <p class="wb-card__pending">待簽核 {{ pendingCount }}</p>
      <div class="wb-card__cta-group">
        <router-link class="wb-card__cta" :to="`/appraisal-year-end/year-end/cycles/${cycle.id}/grid`">前往總表 →</router-link>
        <router-link class="wb-card__cta" :to="`/appraisal-year-end/year-end/cycles/${cycle.id}`">結算明細</router-link>
      </div>
    </template>
  </el-card>
</template>

<style scoped>
.wb-card__head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.wb-card__title { font-weight: 600; }
.wb-card__error { display: flex; align-items: center; gap: var(--space-2); color: var(--el-color-danger); font-size: var(--text-sm); }
.wb-card__pending { margin: var(--space-2) 0 0; font-size: var(--text-sm); color: var(--text-secondary); }
.wb-card__cta-group { display: flex; gap: var(--space-4); margin-top: var(--space-3); }
.wb-card__cta { display: inline-block; font-size: var(--text-sm); color: var(--el-color-primary); text-decoration: none; }
.wb-card__cta:hover { text-decoration: underline; }
</style>
