<template>
  <div class="recruitment-ivykids-view">
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-header-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 6h16" />
            <path d="M4 12h16" />
            <path d="M4 18h10" />
            <path d="M18 17l2 2 4-4" />
          </svg>
        </div>
        <div>
          <h2 class="page-title">官網報名</h2>
          <p class="page-subtitle">義華校官網同步資料獨立檢視</p>
        </div>
      </div>
    </div>

    <RecruitmentIvykidsTab
      :bar-component="Bar"
      :show-charts="true"
      :can-write="canWrite"
    />
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent } from 'vue'
import { getUserInfo, PERMISSION_VALUES } from '@/utils/auth'
import RecruitmentIvykidsTab from '@/components/recruitment/RecruitmentIvykidsTab.vue'

let chartReadyPromise = null
const ensureChartReady = () => {
  if (!chartReadyPromise) {
    chartReadyPromise = import('chart.js').then(({
      Chart,
      CategoryScale,
      LinearScale,
      BarElement,
      Title,
      Tooltip,
      Legend,
    }) => {
      Chart.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)
    })
  }
  return chartReadyPromise
}

const Bar = defineAsyncComponent(() =>
  ensureChartReady().then(() => import('vue-chartjs').then((module) => module.Bar))
)

const canWrite = computed(() => {
  try {
    const info = getUserInfo()
    if (!info) return false
    if (info.permissions === -1 || info.permissions === null || info.permissions === undefined) return true
    const permissionValue = BigInt(PERMISSION_VALUES.RECRUITMENT_WRITE)
    return (BigInt(info.permissions) & permissionValue) === permissionValue
  } catch {
    return false
  }
})
</script>

<style scoped>
.recruitment-ivykids-view {
  min-height: 100%;
  padding: 24px;
  background: #f8fafc;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 16px 20px;
  background: #ffffff;
  border: 1px solid #dbeafe;
  border-radius: 14px;
  border-left: 4px solid #1d4ed8;
  box-shadow: 0 1px 4px rgba(30, 64, 175, 0.07);
}

.page-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-header-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #dbeafe;
  color: #1d4ed8;
  flex-shrink: 0;
}

.page-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  color: #1e293b;
}

.page-subtitle {
  margin: 2px 0 0;
  font-size: 0.78rem;
  color: #64748b;
}
</style>
