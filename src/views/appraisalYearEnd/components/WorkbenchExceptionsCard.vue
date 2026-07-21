<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { getAppraisalCycleExceptions } from '@/api/appraisal'
import { getYearEndCycleExceptions } from '@/api/yearEnd'
import { apiError } from '@/utils/error'

type Severity = 'blocking' | 'warning' | 'info'

// 對齊 ExceptionCenterView.vue 既有配色（severity 實際值為 blocking/warning/info，
// 非 brief 描述的 error/warning，見 schema.d.ts ExceptionItemOut.severity）
const SEVERITY_TAG_TYPE: Record<Severity, 'danger' | 'warning' | 'info'> = {
  blocking: 'danger',
  warning: 'warning',
  info: 'info',
}
const SEVERITY_LABEL: Record<Severity, string> = {
  blocking: '阻斷',
  warning: '警告',
  info: '提示',
}

const props = defineProps<{
  appraisalCycle: { id: number; label: string; status: string } | null
  yearEndCycle: { id: number; label: string; status: string } | null
}>()
const emit = defineEmits<{ stats: [n: number]; 'stats-error': [] }>()

const loading = ref(false)
const error = ref('')
const appraisalCount = ref(0)
const yearEndCount = ref(0)
const severityCounts = ref<Partial<Record<Severity, number>>>({})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [aRes, yRes] = await Promise.all([
      props.appraisalCycle ? getAppraisalCycleExceptions(props.appraisalCycle.id) : Promise.resolve(null),
      props.yearEndCycle ? getYearEndCycleExceptions(props.yearEndCycle.id) : Promise.resolve(null),
    ])
    const aItems = aRes?.data.items ?? []
    const yItems = yRes?.data.items ?? []
    appraisalCount.value = aItems.length
    yearEndCount.value = yItems.length
    const sev: Partial<Record<Severity, number>> = {}
    for (const it of [...aItems, ...yItems]) {
      const key = it.severity as Severity
      sev[key] = (sev[key] ?? 0) + 1
    }
    severityCounts.value = sev
    emit('stats', sev.blocking ?? 0)
  } catch (e) {
    error.value = apiError(e, '載入失敗')
    emit('stats-error')
  } finally {
    loading.value = false
  }
}
// 兩個 cycle 把手皆非同步取得，watch＋immediate 取代 onMounted（見 WorkbenchAppraisalCard 同註解）
watch(() => [props.appraisalCycle?.id, props.yearEndCycle?.id], load, { immediate: true })

const total = computed(() => appraisalCount.value + yearEndCount.value)
</script>

<template>
  <el-card shadow="never" data-test="exceptions-card" class="wb-card">
    <template #header>
      <div class="wb-card__head">
        <span class="wb-card__title">例外待辦</span>
      </div>
      <p class="wb-card__subtitle">試算與簽核前需要處理的資料缺口</p>
    </template>
    <el-skeleton v-if="loading" :rows="2" animated />
    <div v-else-if="error" class="wb-card__error">
      載入失敗 <el-button size="small" text type="primary" @click="load">重試</el-button>
    </div>
    <template v-else>
      <p v-if="total === 0" class="wb-card__success">✓ 沒有待處理事項</p>
      <template v-else>
        <p class="wb-card__counts">考核 {{ appraisalCount }} 筆 / 年終 {{ yearEndCount }} 筆</p>
        <div class="wb-card__severity">
          <el-tag
            v-for="(n, sev) in severityCounts"
            :key="sev"
            size="small"
            :type="SEVERITY_TAG_TYPE[sev as Severity] ?? 'info'"
          >
            {{ SEVERITY_LABEL[sev as Severity] ?? sev }} {{ n }}
          </el-tag>
        </div>
      </template>
      <router-link class="wb-card__cta" to="/appraisal-year-end/exceptions">前往處理 →</router-link>
    </template>
  </el-card>
</template>

<style scoped>
.wb-card__head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.wb-card__title { font-weight: 600; }
.wb-card__subtitle { font-size: var(--text-xs); color: var(--text-secondary); margin: 2px 0 0; }
.wb-card__error { display: flex; align-items: center; gap: var(--space-2); color: var(--el-color-danger); font-size: var(--text-sm); }
.wb-card__success { color: var(--el-color-success); font-size: var(--text-sm); }
.wb-card__counts { font-size: var(--text-sm); color: var(--text-secondary); margin: 0 0 var(--space-2); }
.wb-card__severity { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.wb-card__cta { display: inline-block; margin-top: var(--space-3); font-size: var(--text-sm); color: var(--el-color-primary); text-decoration: none; }
.wb-card__cta:hover { text-decoration: underline; }
</style>
