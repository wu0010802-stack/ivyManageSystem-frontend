// src/parent/composables/useParentTodos.ts
/**
 * 家長端「待辦」的唯一真源。
 *
 * 重整前（2026-09-02 之前）同一筆待辦最多在首頁出現三次：頂部 sticky 橫幅、
 * bento 方格、今日動態的「晚一些」桶，三處各自從 summary 讀欄位、各自做
 * null guard 與型別斷言；事務頁與我的頁又各讀一次。這支把八種待辦收斂成
 * 一份固定順序的陣列，首頁 HomeTodoList 與事務頁 AdminListView 共用。
 *
 * 資料來源三支：
 *  1. GET /parent/home/summary（經 useHomeSummary，cache key parent/today/summary）
 *  2. GET /parent/sign-requests/mine（入學文件電子簽，summary 未聚合此欄位）
 *  3. GET /parent/pickup-authorizations?status=active（臨時接送，summary 亦無）
 *
 * 2、3 各自走 useCachedAsync 固定 key，首頁與事務頁同時掛載只會各打一次。
 * key 以 `parent/` 開頭，登出時 invalidateCachedAsync('parent/') 才清得掉。
 */
import { computed, type ComputedRef } from 'vue'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { formatCurrency } from '@/utils/currency'
import { listMySignRequests } from '../api/signDocuments'
import { listPickupAuthorizations } from '../api/pickup'
import { useHomeSummary } from './useHomeSummary'

export const SIGN_DOCS_CACHE_KEY = 'parent/sign-requests/mine'
export const PICKUP_ACTIVE_CACHE_KEY = 'parent/pickup/active'

export type ParentTodoKey =
  | 'fees' | 'signDocs' | 'eventAcks' | 'surveys'
  | 'promotions' | 'pickup' | 'leaveReviews' | 'announcements'

/**
 * tone 語意分三級，色調必須分開，否則「今天有 5 則公告」會被讀成「有事沒處理」：
 *  - alert：逾期款項，唯一該讓家長心跳快一下的情況
 *  - action：需要家長動手或該知道結果
 *  - info：純資訊，不計入標題的「N 件」
 */
export type ParentTodoTone = 'alert' | 'action' | 'info'

export interface ParentTodo {
  key: ParentTodoKey
  label: string
  count: number
  sub?: string
  tone: ParentTodoTone
  icon: string
  to: string
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

export function useParentTodos(options: { immediate?: boolean } = {}) {
  const { immediate = true } = options

  const {
    summary,
    error: summaryError,
    pending: summaryPending,
    refresh: refreshSummary,
  } = useHomeSummary({ immediate })

  const {
    data: signDocsData,
    error: signDocsError,
    pending: signDocsPending,
    refresh: refreshSignDocs,
  } = useCachedAsync(
    SIGN_DOCS_CACHE_KEY,
    async () => {
      const res = await listMySignRequests()
      return res.data
    },
    { ttl: 60_000, immediate },
  )

  const {
    data: pickupData,
    error: pickupError,
    pending: pickupPending,
    refresh: refreshPickup,
  } = useCachedAsync(
    PICKUP_ACTIVE_CACHE_KEY,
    async () => {
      const res = await listPickupAuthorizations({ status: 'active' })
      return res.data
    },
    { ttl: 60_000, immediate },
  )

  const signDocsCount = computed<number>(() => {
    const d = signDocsData.value as { pending?: unknown[] } | null
    return Array.isArray(d?.pending) ? d.pending.length : 0
  })

  const pickupActiveCount = computed<number>(() => {
    const d = pickupData.value as { items?: unknown[] } | null
    return Array.isArray(d?.items) ? d.items.length : 0
  })

  const todos = computed<ParentTodo[]>(() => {
    const s = (summary.value ?? {}) as {
      fees?: { outstanding_count?: unknown; outstanding?: unknown; overdue?: unknown }
      pending_event_acks?: unknown
      pending_survey_count?: unknown
      pending_activity_promotions?: unknown
      recent_leave_reviews?: unknown
      unread_announcements?: unknown
    }
    const fees = s.fees ?? {}
    const feesCount = num(fees.outstanding_count)
    const feesOverdue = num(fees.overdue)

    // 順序刻意固定，不做動態排序：家長每天看到的位置穩定，比「最急的浮上來」
    // 更符合 PRODUCT.md 的「安心、可信」調性。逾期以 tone 表達，不改位置。
    const rows: ParentTodo[] = [
      {
        key: 'fees',
        label: '待繳學費',
        count: feesCount,
        sub: feesOverdue > 0 ? `逾期 ${formatCurrency(feesOverdue)}` : `${feesCount} 筆`,
        tone: feesOverdue > 0 ? 'alert' : 'action',
        icon: 'payments',
        to: '/fees',
      },
      {
        key: 'signDocs',
        label: '入學文件簽署',
        count: signDocsCount.value,
        sub: `${signDocsCount.value} 份待簽`,
        tone: 'action',
        icon: 'history_edu',
        to: '/sign',
      },
      {
        key: 'eventAcks',
        label: '待簽文件',
        count: num(s.pending_event_acks),
        sub: `${num(s.pending_event_acks)} 份待簽收`,
        tone: 'action',
        icon: 'mark_email_read',
        to: '/events',
      },
      {
        key: 'surveys',
        label: '活動調查',
        count: num(s.pending_survey_count),
        sub: `${num(s.pending_survey_count)} 份待回覆`,
        tone: 'action',
        icon: 'fact_check',
        to: '/surveys',
      },
      {
        key: 'promotions',
        label: '才藝候補確認',
        count: num(s.pending_activity_promotions),
        sub: `${num(s.pending_activity_promotions)} 筆待確認`,
        tone: 'action',
        icon: 'palette',
        to: '/activity',
      },
      {
        key: 'pickup',
        label: '臨時接送進行中',
        count: pickupActiveCount.value,
        sub: `${pickupActiveCount.value} 筆授權`,
        tone: 'info',
        icon: 'hail',
        to: '/pickup',
      },
      {
        key: 'leaveReviews',
        // 用詞對齊 origin/staging @ 1e8fcb1a：平行 session 於 2026-09-02 把請假
        // 徽章統一為「已成立」語意（原為「審核結果」）。本分支底座 2fe63c14
        // 早於該 commit，這裡直接寫新版，合併時不會把對方的文案蓋回舊版。
        label: '請假已成立',
        count: num(s.recent_leave_reviews),
        sub: `近 7 天 ${num(s.recent_leave_reviews)} 筆`,
        tone: 'info',
        icon: 'event_busy',
        to: '/leaves',
      },
      {
        key: 'announcements',
        label: '未讀公告',
        count: num(s.unread_announcements),
        sub: `${num(s.unread_announcements)} 則`,
        tone: 'info',
        icon: 'campaign',
        to: '/announcements',
      },
    ]

    return rows.filter((r) => r.count > 0)
  })

  /** 標題「N 件」只算需要家長動作的，避免未讀公告把數字撐大。 */
  const actionCount = computed<number>(() =>
    todos.value
      .filter((t) => t.tone !== 'info')
      .reduce((sum, t) => sum + t.count, 0),
  )

  /**
   * 三個來源都還沒有資料時才算 pending。任一來源已有資料就直接渲染它的列，
   * 部分失敗不清空整份清單（真實失敗被偽裝成「沒有待辦」是家長端反覆出現
   * 過的 defect class）。
   */
  const pending = computed<boolean>(() => {
    const hasAny = !!summary.value || !!signDocsData.value || !!pickupData.value
    if (hasAny) return false
    return !!(summaryPending.value || signDocsPending.value || pickupPending.value)
  })

  const error = computed<unknown>(
    () => summaryError.value || signDocsError.value || pickupError.value || null,
  )

  async function refresh(): Promise<void> {
    await Promise.all([
      refreshSummary(true),
      refreshSignDocs(true),
      refreshPickup(true),
    ])
  }

  return {
    todos,
    actionCount,
    signDocsCount,
    pickupActiveCount,
    pending,
    error,
    refresh,
  } as {
    todos: ComputedRef<ParentTodo[]>
    actionCount: ComputedRef<number>
    signDocsCount: ComputedRef<number>
    pickupActiveCount: ComputedRef<number>
    pending: ComputedRef<boolean>
    error: ComputedRef<unknown>
    refresh: () => Promise<void>
  }
}
