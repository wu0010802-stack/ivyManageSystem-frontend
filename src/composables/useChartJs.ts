import { defineAsyncComponent } from 'vue'

let _chartReady: Promise<void> | null = null
export const ensureChartReady = (): Promise<void> => {
  if (!_chartReady) {
    _chartReady = import('chart.js').then(({
      Chart, CategoryScale, LinearScale, RadialLinearScale,
      PointElement, LineElement, BarElement, ArcElement,
      Title, Tooltip, Legend, Filler,
    }) => {
      Chart.register(
        CategoryScale, LinearScale, RadialLinearScale,
        PointElement, LineElement, BarElement, ArcElement,
        Title, Tooltip, Legend, Filler,
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
export const DoughnutChart = defineAsyncComponent(() =>
  ensureChartReady().then(() => import('vue-chartjs').then(m => m.Doughnut)),
)
export const RadarChart = defineAsyncComponent(() =>
  ensureChartReady().then(() => import('vue-chartjs').then(m => m.Radar)),
)

export const MONTH_LABELS = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
]
