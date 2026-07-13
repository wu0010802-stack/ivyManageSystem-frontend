import { ref, computed } from 'vue'
import type { ApiResponse } from '@/api/_generated/typed'
import {
  getMyAppraisals,
  getMyAppraisalTrend,
  getMyAppraisalDetail,
} from '@/api/portalAppraisal'

type AppraisalListItem = ApiResponse<'/portal/my-appraisals', 'get'>['items'][number]
type AppraisalTrendPoint = ApiResponse<'/portal/my-appraisals/trend', 'get'>['points'][number]

const GRADE_STYLES = {
  OUTSTANDING: { className: 'grade-outstanding', label: '優', color: '#1e7e34' },
  GOOD: { className: 'grade-good', label: '甲', color: '#2563eb' },
  PASS: { className: 'grade-pass', label: '乙', color: '#a16207' },
  WARN: { className: 'grade-warn', label: '丙', color: '#c2410c' },
  FAIL: { className: 'grade-fail', label: '丁', color: '#b91c1c' },
}

/**
 * 學年 + 學期 → ROC 中文 label，如 (114, 'FIRST') → '114上'。
 */
export function cycleLabel(academicYear: number | string, semester: string) {
  return `${academicYear}${semester === 'FIRST' ? '上' : '下'}`
}

/**
 * 等第 → CSS class / 中文短碼 / 顏色。未知值回 'grade-unknown'。
 */
export function gradeStyle(grade: string) {
  return (
    (GRADE_STYLES as Record<string, { className: string; label: string; color: string }>)[grade] || {
      className: 'grade-unknown',
      label: '—',
      color: '#6b7280',
    }
  )
}

/**
 * 計算 list[index] 相對於 list 中**下一個** is_visible=true 期的 delta。
 * list 由 API 傳來，已按時間 DESC 排序（index 0 = 最新）；
 * 因此「上一期」是 index > current 中第一個 is_visible 的條目。
 * 回傳 number 或 null（無上期 / 自身非 visible）。
 */
export function computeDelta(items: { is_visible?: boolean; total_score?: number | string | null }[], index: number) {
  const current = items[index]
  if (!current || !current.is_visible) return null
  if (current.total_score == null) return null
  for (let i = index + 1; i < items.length; i++) {
    if (items[i].is_visible && items[i].total_score != null) {
      const a = Number(current.total_score)
      const b = Number(items[i].total_score)
      return Number((a - b).toFixed(2))
    }
  }
  return null
}

/**
 * 判斷整個 list 的空態類型，給 view 決定要不要畫圖。
 *  - no-data：完全沒參與過考核
 *  - all-pending：有參與但全部進行中 / 未公布
 *  - has-finalized：至少一期已 FINALIZED 可顯示
 */
export function resolveEmptyState(items: { is_visible?: boolean }[] | null | undefined) {
  if (!items || items.length === 0) return 'no-data'
  if (items.some((it) => it.is_visible)) return 'has-finalized'
  return 'all-pending'
}

export function usePortalAppraisal() {
  const items = ref<AppraisalListItem[]>([])
  const trend = ref<AppraisalTrendPoint[]>([])
  const loading = ref(false)
  const error = ref<unknown>(null)

  const emptyState = computed(() => resolveEmptyState(items.value))
  const latest = computed(() => {
    const idx = items.value.findIndex((it) => it.is_visible)
    return idx === -1
      ? null
      : { item: items.value[idx], delta: computeDelta(items.value, idx) }
  })

  const fetchAll = async () => {
    loading.value = true
    error.value = null
    try {
      const [listResp, trendResp] = await Promise.all([
        getMyAppraisals(),
        getMyAppraisalTrend(),
      ])
      items.value = listResp.data.items
      trend.value = trendResp.data.points
    } catch (e) {
      error.value = e
    } finally {
      loading.value = false
    }
  }

  const fetchDetail = (cycleId: number) => getMyAppraisalDetail(cycleId)

  return {
    items,
    trend,
    loading,
    error,
    emptyState,
    latest,
    fetchAll,
    fetchDetail,
  }
}
