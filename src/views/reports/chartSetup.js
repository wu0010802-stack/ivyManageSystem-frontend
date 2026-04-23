import { defineAsyncComponent } from 'vue'

// Chart.js + vue-chartjs 延遲載入；多個 Panel 共用同一個 Promise
let _chartReady = null
export const ensureChartReady = () => {
  if (!_chartReady) {
    _chartReady = import('chart.js').then(({
      Chart, CategoryScale, LinearScale, PointElement, LineElement,
      BarElement, ArcElement, Title, Tooltip, Legend, Filler,
    }) => {
      Chart.register(
        CategoryScale, LinearScale, PointElement, LineElement,
        BarElement, ArcElement, Title, Tooltip, Legend, Filler,
      )
    })
  }
  return _chartReady
}

export const LineChart = defineAsyncComponent(() =>
  ensureChartReady().then(() => import('vue-chartjs').then(m => m.Line)),
)
export const BarChart = defineAsyncComponent(() =>
  ensureChartReady().then(() => import('vue-chartjs').then(m => m.Bar)),
)
export const PieChart = defineAsyncComponent(() =>
  ensureChartReady().then(() => import('vue-chartjs').then(m => m.Pie)),
)

export const MONTH_LABELS = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
]
