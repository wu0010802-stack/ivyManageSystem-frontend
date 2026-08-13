<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { ChartData, ChartOptions } from 'chart.js'
import { LineChart } from '@/composables/useChartJs'
import { fetchChildMeasurements, fetchChildMeasurementChart } from '../api/childMeasurements'
import { toast } from '../utils/toast'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'

const route = useRoute()
const studentId = computed(() => Number(route.params.studentId))

const metric = ref('height')
const chartData = ref<{
  height: { x: string; y: number | string }[]
  weight: { x: string; y: number | string }[]
}>({ height: [], weight: [] })
const loading = ref(false)

const METRIC_OPTIONS = [
  { value: 'height', label: '身高', unit: 'cm', icon: 'height' },
  { value: 'weight', label: '體重', unit: 'kg', icon: 'monitor_weight' },
]

const currentMetric = computed(() => METRIC_OPTIONS.find((o) => o.value === metric.value))
const currentSeries = computed(
  () => (chartData.value as Record<string, { x: string; y: number | string }[]>)[metric.value] || [],
)

const latestValue = computed(() => {
  const s = currentSeries.value
  return s.length ? Number(s[s.length - 1].y) : null
})
const firstValue = computed(() => {
  const s = currentSeries.value
  return s.length ? Number(s[0].y) : null
})
const trend = computed(() => {
  if (latestValue.value == null || firstValue.value == null) return null
  return Number((latestValue.value - firstValue.value).toFixed(1))
})

const currentColor = computed(() => (metric.value === 'height' ? '#0d9053' : '#33aaaa'))
const currentFill = computed(() =>
  metric.value === 'height' ? 'rgba(13,144,83,0.08)' : 'rgba(51,170,170,0.08)',
)

const isEmpty = computed(() => currentSeries.value.length === 0)

const lineData = computed<ChartData<'line', (number | null)[]>>(() => ({
  labels: currentSeries.value.map((p) => p.x),
  datasets: [
    {
      label: currentMetric.value?.label ?? '',
      data: currentSeries.value.map((p) => {
        const n = Number(p.y)
        return Number.isFinite(n) ? n : null
      }),
      borderColor: currentColor.value,
      backgroundColor: currentFill.value,
      borderWidth: 2.5,
      tension: 0.3,
      pointStyle: 'circle',
      pointRadius: 6,
      pointBackgroundColor: currentColor.value,
      pointBorderColor: currentColor.value,
      fill: 'origin',
    },
  ],
}))

const lineOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  layout: { padding: { top: 4, left: 4, right: 4, bottom: 4 } },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#fffcf2',
      borderColor: 'rgba(13,144,83,0.18)',
      borderWidth: 1,
      titleColor: '#392a1c',
      bodyColor: '#392a1c',
      titleFont: { size: 12 },
      bodyFont: { size: 12 },
      padding: 8,
      callbacks: {
        title: (items) => items[0]?.label ?? '',
        label: (ctx) =>
          `${currentMetric.value?.label ?? ''}：${ctx.parsed.y} ${currentMetric.value?.unit ?? ''}`,
      },
    },
  },
  scales: {
    x: {
      type: 'category',
      ticks: {
        maxRotation: 30,
        minRotation: 30,
        font: { size: 10 },
        color: '#6b7280',
      },
      grid: { display: false },
      border: { color: '#dceef5' },
    },
    y: {
      type: 'linear',
      beginAtZero: false,
      ticks: { font: { size: 10 }, color: '#6b7280' },
      grid: { color: '#f1f5ee' },
      border: { display: false },
    },
  },
}))

/**
 * 歷次量測明細。
 *
 * 這頁原本只畫成長曲線，逐筆紀錄（含頭圍與視力，曲線畫不出來的兩項）
 * 後端一直有但前端沒接（api/childMeasurements.ts 舊 TODO）。曲線看趨勢，
 * 清單看單次數字，兩者互補。
 */
interface MeasurementRecord {
  id: number
  measured_on: string | null
  height_cm: string | null
  weight_kg: string | null
  head_circumference_cm: string | null
  vision_left: string | null
  vision_right: string | null
  note: string | null
}

const records = ref<MeasurementRecord[]>([])

// F3：曲線與清單各自 Promise.allSettled、各自容錯（清單失敗刻意不彈 toast，
// 見 load() 內註解），因此也各自記一個錯誤旗標，讓「載入失敗」與「本來就沒
// 資料」在畫面上可被區分，並提供重試按鈕。
const chartError = ref(false)
const listError = ref(false)

/** 一筆量測的可顯示欄位（後端未填的一律不佔位） */
function recordChips(r: MeasurementRecord): { key: string; label: string; value: string }[] {
  const out: { key: string; label: string; value: string }[] = []
  if (r.height_cm) out.push({ key: 'h', label: '身高', value: `${r.height_cm} cm` })
  if (r.weight_kg) out.push({ key: 'w', label: '體重', value: `${r.weight_kg} kg` })
  if (r.head_circumference_cm) {
    out.push({ key: 'hc', label: '頭圍', value: `${r.head_circumference_cm} cm` })
  }
  if (r.vision_left || r.vision_right) {
    out.push({
      key: 'v',
      label: '視力',
      value: `${r.vision_left || '—'} / ${r.vision_right || '—'}`,
    })
  }
  return out
}

function recordDateLabel(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${y} 年 ${m} 月 ${d} 日`
}

async function load() {
  if (!studentId.value) return
  loading.value = true
  chartError.value = false
  listError.value = false
  try {
    // 曲線與清單同時抓；清單失敗不該讓曲線一起消失，故各自容錯。
    const [chartRes, listRes] = await Promise.allSettled([
      fetchChildMeasurementChart(studentId.value, 24),
      fetchChildMeasurements(studentId.value, { months: 24 }),
    ])
    if (chartRes.status === 'fulfilled') {
      chartData.value = chartRes.value.data
    } else {
      chartError.value = true
      const err = chartRes.reason as Record<string, unknown>
      toast.error(String(err?.displayMessage || '載入失敗'))
    }
    if (listRes.status === 'fulfilled') {
      const d = listRes.value.data as { items?: MeasurementRecord[] } | null
      records.value = d?.items || []
    } else {
      // 清單失敗刻意不彈 toast（曲線才是這頁主體），但仍記錯誤旗標讓
      // 「歷次紀錄」區塊改顯示可重試的錯誤態，而非跟「本來就沒紀錄」
      // 同一句文案。
      listError.value = true
    }
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="meas-view">
    <header class="pt-page-hero">
      <p class="pt-page-hero-eyebrow">成長量測</p>
      <h1 class="pt-page-hero-title">{{ currentMetric?.label }}曲線</h1>
      <p v-if="latestValue != null" class="pt-page-hero-note">
        最新 <strong>{{ latestValue }} {{ currentMetric?.unit }}</strong>
        <span v-if="trend != null && trend !== 0" class="trend" :class="{ up: trend > 0 }">
          <span class="material-symbols-rounded" aria-hidden="true">{{ trend > 0 ? 'arrow_upward' : 'arrow_downward' }}</span>
          {{ Math.abs(trend) }} {{ currentMetric?.unit }}
        </span>
      </p>
    </header>

    <div class="metric-tabs pt-section-pad-x">
      <button
        v-for="opt in METRIC_OPTIONS"
        :key="opt.value"
        type="button"
        :class="{ active: metric === opt.value }"
        @click="metric = opt.value"
      >
        <span class="material-symbols-rounded" aria-hidden="true">{{ opt.icon }}</span>
        {{ opt.label }}
      </button>
    </div>

    <div class="pt-card chart-card">
      <div v-if="loading && isEmpty" class="skeleton-wrap">
        <SkeletonBlock variant="card" :count="1" />
      </div>
      <MobileErrorRetry
        v-else-if="chartError && isEmpty"
        @retry="load"
      />
      <template v-else>
        <div class="chart">
          <LineChart v-if="!isEmpty" :data="lineData" :options="lineOptions" />
        </div>
        <p v-if="isEmpty" class="empty-msg">
          尚無 {{ currentMetric?.label }} 紀錄
        </p>
      </template>
    </div>

    <!-- 歷次紀錄：曲線看趨勢，這裡看每一次的實際數字（含曲線畫不出的頭圍與視力） -->
    <section class="pt-card records-card" aria-labelledby="records-title">
      <h2 id="records-title" class="records-title">歷次紀錄</h2>

      <div v-if="loading && records.length === 0" class="skeleton-wrap">
        <SkeletonBlock variant="row" :count="2" />
      </div>

      <MobileErrorRetry
        v-else-if="listError && records.length === 0"
        @retry="load"
      />

      <p v-else-if="records.length === 0" class="empty-msg">
        園所完成量測後會出現在這裡
      </p>

      <ul v-else class="records">
        <li v-for="r in records" :key="r.id" class="record">
          <p class="record-date">{{ recordDateLabel(r.measured_on) }}</p>
          <div class="record-chips">
            <span v-for="c in recordChips(r)" :key="c.key" class="record-chip">
              <span class="record-chip-label">{{ c.label }}</span>
              <span class="record-chip-value">{{ c.value }}</span>
            </span>
          </div>
          <p v-if="r.note" class="record-note">{{ r.note }}</p>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.meas-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 24px;
}

.trend {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: 8px;
  color: var(--brand-primary, #0d9053);
  font-weight: 600;
}
.trend.up { color: var(--brand-primary, #0d9053); }
.trend:not(.up) { color: var(--sky-700, #2d6f8e); }
.trend .material-symbols-rounded { font-size: 14px; }

.metric-tabs {
  display: flex;
  gap: 8px;
}
.metric-tabs > button {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px;
  background: var(--pt-surface-card, #fff);
  border: 1px solid var(--pt-border-light, #ecf5f9);
  border-radius: 14px;
  font-size: 14px;
  font-weight: 600;
  color: var(--pt-text-muted);
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease, border-color 160ms ease;
  font-family: inherit;
}
.metric-tabs > button .material-symbols-rounded {
  font-size: 18px;
  font-variation-settings: 'wght' 500;
}
.metric-tabs > button.active {
  background: var(--m3-primary, var(--brand-primary, #0d9053));
  color: var(--m3-on-primary, #fff);
  border-color: var(--m3-primary, var(--brand-primary, #0d9053));
}

.chart-card { display: flex; flex-direction: column; gap: 8px; padding: 12px; }
.chart {
  width: 100%;
  height: 260px;
}
.skeleton-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.empty-msg {
  margin: 0;
  padding: 20px 16px;
  text-align: center;
  color: var(--pt-text-faint);
  font-size: 14px;
}

.records-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 0 4px;
}
.records-title {
  margin: 0 16px 8px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--pt-text-muted);
}
.records {
  list-style: none;
  margin: 0;
  padding: 0;
}
.record {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 16px;
  border-top: 1px solid var(--pt-border-light, #ecf5f9);
}
.record-date {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--pt-text-strong);
}
.record-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.record-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--cream, #fffcf2);
  border: 1px solid rgba(13, 144, 83, 0.10);
}
.record-chip-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--pt-text-muted);
}
.record-chip-value {
  font-size: 13px;
  font-weight: 700;
  color: var(--pt-text-strong);
}
.record-note {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--pt-text-soft);
}

@media (prefers-reduced-motion: reduce) {
  .metric-tabs > button { transition: none; }
}
</style>
