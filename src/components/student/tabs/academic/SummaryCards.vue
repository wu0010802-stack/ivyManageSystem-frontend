<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getAcademicSummary } from '@/api/studentRecords'
import { apiError } from '@/utils/error'

const props = withDefaults(defineProps<{
  studentId: number
  active?: boolean
}>(), {
  active: true,
})

const emit = defineEmits<{
  'jump-tab': [tab: string]
  'jump-section': [section: string]
}>()

const summary = ref<Record<string, unknown> | null>(null)
const loading = ref(false)

async function fetchSummary() {
  if (!props.studentId) return
  loading.value = true
  try {
    const { data } = await getAcademicSummary(props.studentId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    summary.value = (data as any) || null
  } catch (e) {
    summary.value = null
    ElMessage.error(apiError(e, '讀取教務摘要失敗'))
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.active, props.studentId],
  ([active]) => {
    if (active && props.studentId) fetchSummary()
  },
  { immediate: true },
)

const ratePercent = computed(() => {
  if (!summary.value) return '-'
  const r = (summary.value.attendance_rate as number) ?? 0
  return `${Math.round(r * 1000) / 10}%`
})

const periodLabel = computed(() => {
  if (!summary.value) return ''
  const period = summary.value.period as { from: string; to: string }
  return `${period.from} ~ ${period.to}`
})

defineExpose({ refresh: fetchSummary })
</script>

<template>
  <div v-loading="loading" class="summary-cards">
    <div class="cards">
      <button type="button" class="card card-attendance" @click="emit('jump-tab', 'attendance')">
        <div class="card-label">本學期出席率</div>
        <div class="card-value">{{ ratePercent }}</div>
        <div class="card-sub">
          出席 {{ summary?.attendance_present ?? 0 }} / 共 {{ summary?.attendance_total ?? 0 }}
        </div>
      </button>
      <button type="button" class="card card-leave" @click="emit('jump-section', 'leave')">
        <div class="card-label">本學期請假天</div>
        <div class="card-value">{{ summary?.leave_days ?? 0 }}</div>
        <div class="card-sub">家長代請</div>
      </button>
      <button type="button" class="card card-assessment" @click="emit('jump-section', 'assessment')">
        <div class="card-label">本學期評量</div>
        <div class="card-value">{{ summary?.assessment_count ?? 0 }}</div>
        <div class="card-sub">期中／期末</div>
      </button>
      <button type="button" class="card card-incident" @click="emit('jump-section', 'incident')">
        <div class="card-label">本學期事件</div>
        <div class="card-value">{{ summary?.incident_count ?? 0 }}</div>
        <div class="card-sub">行為／意外</div>
      </button>
    </div>
    <div v-if="summary" class="period">學期區間：{{ periodLabel }}</div>
  </div>
</template>

<style scoped>
.summary-cards {
  margin-bottom: 14px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.card {
  width: 100%;
  border: 0;
  border-radius: 8px;
  padding: 12px 14px;
  background: var(--el-fill-color-lighter);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: transform 120ms, box-shadow 120ms;
}
.card:hover,
.card:focus-visible {
  transform: translateY(-1px);
  box-shadow: var(--el-box-shadow-light);
}
.card-attendance { background: rgba(64, 158, 255, 0.08); }
.card-leave { background: rgba(230, 162, 60, 0.10); }
.card-assessment { background: rgba(103, 194, 58, 0.10); }
.card-incident { background: rgba(245, 108, 108, 0.10); }
.card-label {
  font-size: 0.85em;
  color: var(--el-text-color-secondary);
}
.card-value {
  font-size: 1.6em;
  font-weight: 700;
  margin: 4px 0 2px;
  color: var(--el-text-color-primary);
}
.card-sub {
  font-size: 0.8em;
  color: var(--el-text-color-secondary);
}
.period {
  margin-top: 8px;
  color: var(--el-text-color-secondary);
  font-size: 0.85em;
}
@media (--to-sm) {
  .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
