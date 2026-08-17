<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { listAppraisalCycles } from '@/api/appraisal'
import { listYearEndCycles } from '@/api/yearEnd'
import { apiError } from '@/utils/error'
import { CYCLE_STATUS_LABEL, CYCLE_STATUS_TAG } from '@/constants/appraisalYearEnd'

interface Row { key: string; label: string; status: string; to: string }

const loading = ref(false)
const errorMsg = ref('')
const rows = ref<Row[]>([])

function semesterLabel(s: string) { return s === 'FIRST' ? '上' : '下' }

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    const [aRes, yRes] = await Promise.all([listAppraisalCycles(), listYearEndCycles()])
    const appraisalRows: Row[] = aRes.data.map((c) => ({
      key: `appraisal-${c.id}`,
      label: `考核 ${c.academic_year} 學年${semesterLabel(c.semester)}學期`,
      status: c.status,
      to: `/appraisal-year-end/appraisal?cycle=${c.id}&stage=sign`,
    }))
    const yearEndRows: Row[] = yRes.data.map((c) => ({
      key: `year-end-${c.id}`,
      label: `年終 ${c.academic_year} 學年度`,
      status: c.status,
      to: `/appraisal-year-end/year-end/cycles/${c.id}`,
    }))
    rows.value = [...appraisalRows, ...yearEndRows]
  } catch (e) {
    errorMsg.value = apiError(e, '載入失敗')
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>

<template>
  <el-card shadow="never" class="wb-side-card" data-test="wb-cycles-sidebar">
    <template #header><span class="wb-side-card__title">進行中的週期</span></template>
    <el-skeleton v-if="loading" :rows="3" animated />
    <div v-else-if="errorMsg" class="wb-side-card__error">
      載入失敗 <el-button size="small" text type="primary" @click="load">重試</el-button>
    </div>
    <el-empty v-else-if="rows.length === 0" description="尚無週期" :image-size="48" />
    <ul v-else class="wb-side-card__list">
      <li v-for="row in rows" :key="row.key" class="wb-side-card__row">
        <router-link :to="row.to">{{ row.label }}</router-link>
        <el-tag size="small" :type="CYCLE_STATUS_TAG[row.status] ?? 'info'">
          {{ CYCLE_STATUS_LABEL[row.status] ?? row.status }}
        </el-tag>
      </li>
    </ul>
  </el-card>
</template>

<style scoped>
.wb-side-card__title { font-weight: 600; }
.wb-side-card__error { display: flex; align-items: center; gap: var(--space-2); color: var(--el-color-danger); font-size: var(--text-sm); }
.wb-side-card__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.wb-side-card__row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); font-size: var(--text-sm); }
</style>
