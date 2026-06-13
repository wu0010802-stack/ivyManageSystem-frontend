// src/components/recruitment/lazyChartComponents.ts
/**
 * chart.js 延遲載入：首次需要圖表時才動態 import 並註冊 scale/element。
 * 自 RecruitmentView 抽出，供招生入學各統計元件共用。
 */
import { defineAsyncComponent } from 'vue'
import type { ChartOptions } from 'chart.js'

let _chartReady: Promise<void> | null = null
const ensureChartReady = (): Promise<void> => {
  if (!_chartReady) {
    _chartReady = import('chart.js').then(({
      Chart, CategoryScale, LinearScale, BarElement,
      PointElement, LineElement, ArcElement,
      Title, Tooltip, Legend,
    }) => {
      Chart.register(
        CategoryScale, LinearScale, BarElement,
        PointElement, LineElement, ArcElement,
        Title, Tooltip, Legend,
      )
    })
  }
  return _chartReady
}

export const LazyBar = defineAsyncComponent(() =>
  ensureChartReady().then(() => import('vue-chartjs').then(m => m.Bar))
)
export const LazyLine = defineAsyncComponent(() =>
  ensureChartReady().then(() => import('vue-chartjs').then(m => m.Line))
)

// chart options 轉型（vue-chartjs 要求 ChartOptions<T>，composable 回傳 Record<string,unknown>）
export const castChartOpts = (opts: Record<string, unknown>): ChartOptions<'bar'> =>
  opts as unknown as ChartOptions<'bar'>
