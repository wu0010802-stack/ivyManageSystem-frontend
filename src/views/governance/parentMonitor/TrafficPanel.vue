<template>
  <div class="traffic-panel">
    <div v-if="errorMessage" data-testid="traffic-error" class="traffic-panel__error">
      {{ errorMessage }}
    </div>

    <div v-else-if="enabled === false" data-testid="traffic-disabled" class="traffic-panel__disabled">
      <EmptyState
        title="家長端監控尚未啟用"
        description="此環境尚未開啟家長端監控功能，流量圖表無法顯示。"
      />
    </div>

    <template v-else>
      <div class="traffic-panel__range">
        <el-radio-group v-model="range" data-testid="traffic-range">
          <el-radio-button value="24h">24 小時</el-radio-button>
          <el-radio-button value="7d">7 天</el-radio-button>
        </el-radio-group>
      </div>

      <div v-if="silence" data-testid="traffic-silence" class="traffic-panel__silence">
        <div class="traffic-panel__silence-head">
          <el-tag :type="silenceTagType">{{ silenceLevelLabel }}</el-tag>
          <span class="traffic-panel__silence-reason">{{ silence.reason }}</span>
        </div>
        <p data-testid="traffic-silence-detail" class="traffic-panel__silence-detail">
          每小時基線：{{ silenceBaselineLabel }}／本小時：{{ silenceCurrentHourLabel }}／連續零流量小時數：{{ silenceZeroHoursLabel }}
        </p>
      </div>

      <EmptyState
        v-if="!loading && series.length === 0"
        data-testid="traffic-empty"
        title="尚無流量資料"
        description="剛部署時還沒有資料，計量每 60 秒才寫一次，等幾分鐘再回來看。"
      />

      <div v-else class="traffic-panel__chart">
        <component :is="LineChart" :data="chartData" :options="chartOptions" />
      </div>

      <el-table :data="displayRoutes" data-testid="traffic-routes">
        <el-table-column label="路由樣板" prop="route_template" />
        <el-table-column label="方法" prop="method" />
        <el-table-column label="請求數" prop="count" />
        <el-table-column label="5xx 率" prop="rate_5xx_label" />
        <el-table-column label="p95 (ms)" prop="p95_ms" />
        <el-table-column label="平均 (ms)" prop="avg_ms" />
        <el-table-column label="最大 (ms)" prop="max_ms" />
      </el-table>
      <p class="traffic-panel__p95-note">
        ※ p95 由五格延遲直方圖估算；顯示 5000ms 代表「至少 5000ms」，不是精確值。
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 流量分頁（SPEC-023 批次 2，Task 6）。
 *
 * 折線圖（總請求／5xx 錯誤兩條線）＋路由彙總表＋靜默狀態列，資料來源是
 * 單一端點 `GET /parent-monitor/traffic?range=`（後端 Task 5 已把三塊資料
 * 併成一支回應，不必像 ProbesPanel 那樣併發兩支）。
 *
 * ⚠ `silence.level`／`reason` 由後端 `lights.py::build_lights` 合成後直接
 * 帶下來（`api/parent_monitor.py::get_traffic` 刻意複用 overview 那盞
 * `silence` 燈的判定，不在端點自行重判門檻）——本元件只負責渲染，不得
 * 自己另外算一套「流量夠不夠」的邏輯，否則會跟 LightsBoard 的燈色漂移。
 *
 * ⚠ `silence.baseline_per_hour` 為 `null` 時代表「尚未收集到任何基線」，
 * 必須顯示「未收集」——顯示 0 會被誤讀成「基線是零」，是本頁最核心的
 * 防呆規則（同批次 1 `metric: null` 不顯示 0 的規則）。
 *
 * ⚠ 空狀態文案刻意不寫「無資料」：本分頁剛上線時、或租戶剛部署時，
 * `parent_api_metrics` 還沒有任何一列是預期狀態（計量每 60 秒 flush 一次），
 * 寫「無資料」會讓值班人員誤以為計量管線壞了。
 *
 * ⚠ p95 是直方圖估算值，`5000ms` 是下界不是精確值（後端
 * `queries.estimate_p95` docstring 已寫明）——表格附一行小字註腳，
 * 不把它當精確數字呈現。
 */
import { computed, onMounted, ref, watch } from 'vue'

import EmptyState from '@/components/common/EmptyState.vue'
import { LineChart } from '@/composables/useChartJs'
import { getParentMonitorTraffic } from '@/api/parentMonitor'
import { getErrorMessage } from '@/utils/errorHandler'
import { fmtPct, formatTimeTW } from '@/utils/format'

type TrafficData = Awaited<ReturnType<typeof getParentMonitorTraffic>>['data']
type SeriesPoint = NonNullable<TrafficData['series']>[number]
type RouteRow = NonNullable<TrafficData['routes']>[number]
type SilenceData = NonNullable<TrafficData['silence']>
type RangeValue = '24h' | '7d'

type TagType = 'primary' | 'success' | 'warning' | 'danger' | 'info'
type SilenceLevel = 'green' | 'yellow' | 'red' | 'gray'

const SILENCE_TAG_TYPES: Record<SilenceLevel, TagType> = {
  green: 'success',
  yellow: 'warning',
  red: 'danger',
  gray: 'info',
}

const SILENCE_LEVEL_LABELS: Record<SilenceLevel, string> = {
  green: '正常',
  yellow: '警示',
  red: '異常',
  gray: '未知',
}

/**
 * 後端 `TrafficSilenceOut.level` 型別是寬鬆的 `string | null`（Pydantic 該欄
 * 未宣告 Literal），比照 `ParentMonitorView.vue::isKnownLevel` 的做法用型別
 * 守衛收斂，收斂不到的值一律當 `gray`（未知）處理，不用 `as any` 硬轉型。
 */
function isKnownSilenceLevel(level: string): level is SilenceLevel {
  return level === 'green' || level === 'yellow' || level === 'red' || level === 'gray'
}

/**
 * 60 分鐘桶（7 天視窗）用 `MM/DD HH:mm`，5 分鐘桶（24 小時視窗）用
 * `HH:mm`——7 天視窗若只顯示時分,使用者分不出是哪一天。`Asia/Taipei`
 * 固定時區,不用瀏覽器所在時區(比照 utils/format.ts 既有慣例)。
 */
const _monthDayMinuteFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Taipei',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function formatMonthDayMinute(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const parts = _monthDayMinuteFmt.formatToParts(d)
  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${valueOf('month')}/${valueOf('day')} ${valueOf('hour')}:${valueOf('minute')}`
}

function formatBucketLabel(bucketStart: string, granularityMinutes: number | null | undefined): string {
  if (granularityMinutes === 60) return formatMonthDayMinute(bucketStart)
  return formatTimeTW(bucketStart)
}

const range = ref<RangeValue>('24h')
const loading = ref(true)
const errorMessage = ref<string | null>(null)
const enabled = ref<boolean | null>(null)
const series = ref<SeriesPoint[]>([])
const routes = ref<RouteRow[]>([])
const silence = ref<SilenceData | null>(null)
const granularityMinutes = ref<number | null | undefined>(null)

const silenceLevel = computed<SilenceLevel>(() => {
  const level = silence.value?.level
  if (level && isKnownSilenceLevel(level)) return level
  return 'gray'
})
const silenceTagType = computed(() => SILENCE_TAG_TYPES[silenceLevel.value])
const silenceLevelLabel = computed(() => SILENCE_LEVEL_LABELS[silenceLevel.value])

// `baseline_per_hour` 為 null 顯示「未收集」，不可顯示 0（見檔頭註解）。
const silenceBaselineLabel = computed(() => {
  const v = silence.value?.baseline_per_hour
  if (v === null || v === undefined) return '未收集'
  return `${v.toFixed(1)} 次/小時`
})

// `current_hour` 沒有「未收集」語意（後端 docstring：當前小時本來就是良定
// 義的數字，即使剛好是 0），但仍防 null/undefined 顯示為 —。
const silenceCurrentHourLabel = computed(() => {
  const v = silence.value?.current_hour
  return v === null || v === undefined ? '—' : `${v} 次`
})

const silenceZeroHoursLabel = computed(() => {
  const v = silence.value?.zero_hours
  return v === null || v === undefined ? '—' : `${v} 小時`
})

/**
 * 表格顯示用的攤平列。刻意不在 `<el-table-column>` 內用 scoped slot
 * （`#default="{ row }"`）——這會在測試環境（沒有 unplugin-vue-components、
 * `el-table-column` 不是真元件）炸掉：未解析的自訂元素上掛 v-slot，
 * Vue 編譯器仍會產生呼叫 slot 函式的程式碼，但沒有真正的元件會傳入
 * `{ row }` scope，`{ row }` 解構會拿到 `undefined` 直接炸掉整個 render。
 * 全部欄位都用 `prop=` 讀純值即可規避——5xx 率在這裡先格式化成字串。
 */
interface DisplayRoute {
  route_template: string
  method: string
  count: number
  rate_5xx_label: string
  p95_ms: number
  avg_ms: number
  max_ms: number
}

const displayRoutes = computed<DisplayRoute[]>(() =>
  routes.value.map((r) => ({
    route_template: r.route_template,
    method: r.method,
    count: r.count,
    rate_5xx_label: fmtPct(r.rate_5xx, { isRatio: true }),
    p95_ms: r.p95_ms,
    avg_ms: r.avg_ms,
    max_ms: r.max_ms,
  })),
)

const chartData = computed(() => ({
  labels: series.value.map((p) => formatBucketLabel(p.bucket_start, granularityMinutes.value)),
  datasets: [
    {
      label: '總請求',
      data: series.value.map((p) => p.count),
      borderColor: '#409eff',
      backgroundColor: 'transparent',
      tension: 0.2,
    },
    {
      label: '5xx 錯誤',
      data: series.value.map((p) => p.count_5xx),
      borderColor: '#f56c6c',
      backgroundColor: 'transparent',
      tension: 0.2,
    },
  ],
}))

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: { legend: { position: 'top' as const } },
  scales: { y: { beginAtZero: true } },
} as unknown as Record<string, unknown>

async function fetchData(): Promise<void> {
  loading.value = true
  errorMessage.value = null
  try {
    const res = await getParentMonitorTraffic({ range: range.value })
    enabled.value = res.data.enabled
    if (res.data.enabled) {
      series.value = res.data.series ?? []
      routes.value = res.data.routes ?? []
      silence.value = res.data.silence ?? null
      granularityMinutes.value = res.data.granularity_minutes
    }
  } catch (e) {
    errorMessage.value = getErrorMessage(e, '流量資料載入失敗，請稍後再試')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void fetchData()
})

watch(range, () => {
  void fetchData()
})
</script>

<style scoped>
.traffic-panel__range {
  margin-bottom: 16px;
}

.traffic-panel__silence {
  padding: 10px 14px;
  border-radius: 6px;
  background: var(--el-fill-color-light, #f5f7fa);
  margin-bottom: 16px;
}

.traffic-panel__silence-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.traffic-panel__silence-reason {
  font-size: 13px;
  color: var(--el-text-color-regular, #606266);
}

.traffic-panel__silence-detail {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
}

.traffic-panel__chart {
  height: 280px;
  margin-bottom: 20px;
}

.traffic-panel__p95-note {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
}

.traffic-panel__error {
  color: var(--el-color-danger, #f56c6c);
  padding: 12px 0;
}
</style>
