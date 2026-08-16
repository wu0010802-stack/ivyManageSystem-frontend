<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listAppraisalCycles, getAppraisalCurrentCycle } from '@/api/appraisal'
import { CYCLE_STATUS_LABEL, cycleStatusLabel } from '@/constants/appraisalYearEnd'
import EmptyState from '@/components/common/EmptyState.vue'
import CurrentSemesterOverview from './CurrentSemesterOverview.vue'
import CycleDetailPanel from './CycleDetailPanel.vue'
import AppraisalCycleExceptionsSummary from './components/AppraisalCycleExceptionsSummary.vue'
import { APPRAISAL_WORKSPACE_STEPS, normalizeAppraisalStep, type AppraisalStepKey } from './workspaceSteps'

interface CycleOption { id: number; academic_year: number; semester: string; status: string }

const route = useRoute()
const router = useRouter()

const cycles = ref<CycleOption[]>([])
const currentCycleId = ref<number | null>(null)
const selectedCycleId = ref<number | null>(null)
const loading = ref(true)
const loadError = ref(false)

const stage = computed<AppraisalStepKey>(() => normalizeAppraisalStep(route.query.stage))

const selectedCycle = computed(() => cycles.value.find((c) => c.id === selectedCycleId.value) ?? null)
const isLiveCurrentCycle = computed(() => selectedCycleId.value != null && selectedCycleId.value === currentCycleId.value)
const cycleLabel = (c: CycleOption) => `${c.academic_year} 學年${c.semester === 'FIRST' ? '上' : '下'}學期`

const cycleOptions = computed(() => cycles.value.map((c) => ({
  value: c.id,
  label: `${cycleLabel(c)}${c.id === currentCycleId.value ? '（進行中）' : ''}`,
})))

function selectCycle(id: number) {
  selectedCycleId.value = id
  router.replace({ query: { ...route.query, cycle: String(id) } })
}
function selectStage(key: AppraisalStepKey) {
  router.replace({ query: { ...route.query, stage: key } })
}

async function load() {
  loading.value = true
  loadError.value = false
  try {
    const [listRes, currentRes] = await Promise.all([listAppraisalCycles(), getAppraisalCurrentCycle()])
    cycles.value = (listRes.data as CycleOption[]) ?? []
    currentCycleId.value = (currentRes.data as CycleOption | null)?.id ?? null

    const queryCycle = Number(route.query.cycle)
    if (!Number.isNaN(queryCycle) && cycles.value.some((c) => c.id === queryCycle)) {
      selectedCycleId.value = queryCycle
    } else if (currentCycleId.value != null) {
      selectedCycleId.value = currentCycleId.value
    } else if (cycles.value.length > 0) {
      selectedCycleId.value = cycles.value.reduce((a, b) => (b.academic_year > a.academic_year ? b : a)).id
    } else {
      selectedCycleId.value = null
    }
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}
onMounted(load)

defineExpose({ selectedCycleId, stage, cycles, currentCycleId, loadError, selectCycle, selectStage, load })
</script>

<template>
  <div class="ap-workspace">
    <div class="ap-workspace__source-links">
      <router-link to="/appraisal-year-end/appraisal/institution-events">活動出席</router-link>
      <router-link to="/appraisal-year-end/appraisal/disciplinary">懲處紀錄</router-link>
      <router-link to="/appraisal-year-end/appraisal/calibration">等第校準</router-link>
    </div>
    <div v-if="loadError" class="ap-workspace__error">
      載入失敗
      <el-button data-test="workspace-retry" size="small" text type="primary" @click="load">重試</el-button>
    </div>
    <EmptyState v-else-if="!loading && cycles.length === 0" title="尚無考核週期" description="請先建立本學期考核週期。" />
    <template v-else>
      <div class="ap-workspace__head">
        <el-select
          v-if="selectedCycleId != null"
          :model-value="selectedCycleId"
          class="ap-workspace__cycle-select"
          @change="selectCycle"
        >
          <el-option v-for="opt in cycleOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
        <el-tag v-if="selectedCycle" :type="selectedCycle.status === 'OPEN' ? 'success' : 'info'" size="small">
          {{ cycleStatusLabel(selectedCycle.status) }}
        </el-tag>
      </div>

      <div v-if="selectedCycle && selectedCycle.status !== 'OPEN'" class="ap-workspace__readonly">
        此週期已完成（{{ CYCLE_STATUS_LABEL[selectedCycle.status] ?? selectedCycle.status }}），內容為唯讀。
      </div>

      <el-radio-group
        v-if="selectedCycleId != null"
        :model-value="stage"
        class="ap-workspace__stages"
        @change="(v: string | number | boolean | undefined) => selectStage(v as AppraisalStepKey)"
      >
        <el-radio-button v-for="s in APPRAISAL_WORKSPACE_STEPS" :key="s.key" :value="s.key">{{ s.label }}</el-radio-button>
      </el-radio-group>

      <div v-if="selectedCycleId != null" class="ap-workspace__body">
        <template v-if="stage === 'prepare'">
          <CurrentSemesterOverview v-if="isLiveCurrentCycle" />
          <EmptyState v-else title="此週期無需準備資料" description="準備資料僅適用於目前進行中的學期；歷史週期請直接查看簽核完成頁。" />
        </template>
        <AppraisalCycleExceptionsSummary v-else-if="stage === 'exceptions'" :key="selectedCycleId" :cycle-id="selectedCycleId" />
        <CycleDetailPanel v-else :key="selectedCycleId" :cycle-id="selectedCycleId" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.ap-workspace__source-links { display: flex; gap: var(--space-3); margin-bottom: var(--space-3); font-size: var(--text-sm); }
.ap-workspace__error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--el-color-danger);
  font-size: var(--text-sm);
  margin-bottom: var(--space-3);
}
.ap-workspace__head { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); }
.ap-workspace__cycle-select { width: 220px; }
.ap-workspace__readonly {
  background: var(--el-color-info-light-9);
  color: var(--el-text-color-secondary);
  border-radius: var(--radius-md, 8px);
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  margin-bottom: var(--space-3);
}
.ap-workspace__stages { margin-bottom: var(--space-4); }
</style>
