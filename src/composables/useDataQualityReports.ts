import { reactive, ref } from 'vue'

import {
  ackReport,
  getSummary,
  ignoreReport,
  listReports,
  resolveReport,
  runNow,
  type DataQualityReportRow,
  type DataQualitySummary,
  type ListReportsQuery,
} from '@/api/dataQuality'
import { useErrorNotify } from '@/composables/useErrorNotify'

const DEFAULT_PAGE_SIZE = 20

type ListQuery = NonNullable<ListReportsQuery>

export interface DataQualityFilters {
  status: string
  severity: string
  rule_code: string
  page: number
  page_size: number
}

/**
 * 資料品質報告的載入與處理邏輯（dqview01）。
 *
 * 兩條獨立的載入路徑：
 *  - 列表（listReports）受篩選與分頁影響
 *  - 統計（getSummary）永遠是全站待處理數，與使用者篩到哪一頁無關
 *
 * 統計失敗只降級統計區、不阻斷列表；寫入操作失敗則兩者都不重載，
 * 避免用一次成功的重載掩蓋掉失敗。
 */
export function useDataQualityReports() {
  const { notify } = useErrorNotify()

  const filters = reactive<DataQualityFilters>({
    status: 'open',
    severity: '',
    rule_code: '',
    page: 1,
    page_size: DEFAULT_PAGE_SIZE,
  })

  const rows = ref<DataQualityReportRow[]>([])
  const total = ref(0)
  const summary = ref<DataQualitySummary | null>(null)
  const loading = ref(false)
  const running = ref(false)
  const loadError = ref(false)

  async function reload() {
    loading.value = true
    try {
      const params: ListQuery = {
        page: filters.page,
        page_size: filters.page_size,
      }
      if (filters.status) params.status = filters.status
      if (filters.severity) params.severity = filters.severity
      if (filters.rule_code) params.rule_code = filters.rule_code

      const { data } = await listReports(params)
      rows.value = data.items ?? []
      total.value = data.total ?? 0
      loadError.value = false
    } catch (e) {
      // 保留既有列表資料不清空，讓使用者還看得到上一次的結果
      loadError.value = true
      notify(e, 'DataQualityView:reload', '載入資料品質報告失敗')
    } finally {
      loading.value = false
    }
  }

  async function reloadSummary() {
    try {
      const { data } = await getSummary()
      summary.value = data
    } catch (e) {
      // 統計是輔助資訊，失敗時降級為 null（UI 顯示「—」），不擋列表
      summary.value = null
      notify(e, 'DataQualityView:summary', '載入統計失敗')
    }
  }

  /** 篩選變更的唯一入口：必定回到第 1 頁，否則會落在不存在的分頁上。 */
  async function applyFilters() {
    filters.page = 1
    await reload()
  }

  async function changePage(page: number) {
    filters.page = page
    await reload()
  }

  async function changePageSize(size: number) {
    filters.page_size = size
    filters.page = 1
    await reload()
  }

  /** 寫入成功才重載；失敗時保持畫面現狀並回報，回傳值供 UI 判斷。 */
  async function _mutate(
    action: () => Promise<unknown>,
    context: string,
    fallback: string,
  ): Promise<boolean> {
    try {
      await action()
    } catch (e) {
      notify(e, context, fallback)
      return false
    }
    await Promise.all([reload(), reloadSummary()])
    return true
  }

  function acknowledge(id: number, note: string) {
    return _mutate(
      () => ackReport(id, { note }),
      'DataQualityView:ack',
      '標記確認失敗',
    )
  }

  function resolve(id: number, note: string) {
    return _mutate(
      () => resolveReport(id, { note }),
      'DataQualityView:resolve',
      '標記已修正失敗',
    )
  }

  function ignore(id: number, note: string) {
    return _mutate(
      () => ignoreReport(id, { note }),
      'DataQualityView:ignore',
      '標記忽略失敗',
    )
  }

  /** 立即重跑全部規則；回傳結果摘要供 UI 顯示，失敗回 null。 */
  async function triggerRunNow() {
    running.value = true
    try {
      const { data } = await runNow()
      await Promise.all([reload(), reloadSummary()])
      return data
    } catch (e) {
      notify(e, 'DataQualityView:runNow', '執行資料品質檢查失敗')
      return null
    } finally {
      running.value = false
    }
  }

  async function init() {
    await Promise.all([reload(), reloadSummary()])
  }

  return {
    filters,
    rows,
    total,
    summary,
    loading,
    running,
    loadError,
    init,
    reload,
    reloadSummary,
    applyFilters,
    changePage,
    changePageSize,
    acknowledge,
    resolve,
    ignore,
    triggerRunNow,
  }
}
