/**
 * useParentTodos — 家長端待辦清單的唯一真源。
 *
 * 重整前同一筆待辦最多出現三次（首頁頂部橫幅、首頁 bento 方格、今日動態），
 * 每處各自從 summary 讀欄位、各自做 null guard。這支把八種待辦收斂成一份
 * 固定順序的陣列，首頁與事務頁共用。
 *
 * 涵蓋：
 *  - 八種列各自取對欄位、count 為 0 不產生列
 *  - 固定順序（不因逾期而重排）
 *  - 逾期走 alert tone、sub 改顯示逾期金額
 *  - 部分來源失敗時，其餘來源已有的列照常渲染
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

const summaryRef = ref<Record<string, unknown> | null>(null)
const summaryError = ref<unknown>(null)
const summaryPending = ref(false)
const refreshSummary = vi.fn()

vi.mock('@/parent/composables/useHomeSummary', () => ({
  HOME_SUMMARY_CACHE_KEY: 'parent/today/summary',
  useHomeSummary: () => ({
    summary: summaryRef,
    error: summaryError,
    pending: summaryPending,
    refresh: refreshSummary,
  }),
}))

const listMySignRequests = vi.fn()
const listPickupAuthorizations = vi.fn()
vi.mock('@/parent/api/signDocuments', () => ({
  listMySignRequests: (...a: unknown[]) => listMySignRequests(...a),
}))
vi.mock('@/parent/api/pickup', () => ({
  listPickupAuthorizations: (...a: unknown[]) => listPickupAuthorizations(...a),
}))

import { useParentTodos } from '@/parent/composables/useParentTodos'
import { _resetCacheForTesting } from '@/composables/useCachedAsync'

function setSummary(overrides: Record<string, unknown> = {}) {
  summaryRef.value = {
    unread_announcements: 0,
    fees: { outstanding_count: 0, outstanding: 0, overdue: 0 },
    pending_event_acks: 0,
    pending_survey_count: 0,
    pending_activity_promotions: 0,
    recent_leave_reviews: 0,
    ...overrides,
  }
}

/** 等待 composable 內兩支 fetch 的 microtask 收斂 */
async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  _resetCacheForTesting()
  vi.clearAllMocks()
  summaryError.value = null
  summaryPending.value = false
  listMySignRequests.mockResolvedValue({ data: { pending: [], signed: [] } })
  listPickupAuthorizations.mockResolvedValue({ data: { items: [] } })
  setSummary()
})

describe('useParentTodos 列的產生條件', () => {
  it('全部為 0：不產生任何待辦列', async () => {
    const { todos } = useParentTodos()
    await flush()
    expect(todos.value).toEqual([])
  })

  it('待繳學費未逾期：tone=action，sub 顯示筆數', async () => {
    setSummary({ fees: { outstanding_count: 2, outstanding: 3600, overdue: 0 } })
    const { todos } = useParentTodos()
    await flush()
    const fees = todos.value.find((t) => t.key === 'fees')
    expect(fees).toBeTruthy()
    expect(fees!.label).toBe('待繳學費')
    expect(fees!.count).toBe(2)
    expect(fees!.tone).toBe('action')
    expect(fees!.sub).toBe('2 筆')
    expect(fees!.to).toBe('/fees')
  })

  it('待繳學費有逾期：tone=alert，sub 顯示逾期金額', async () => {
    setSummary({ fees: { outstanding_count: 2, outstanding: 3600, overdue: 1200 } })
    const { todos } = useParentTodos()
    await flush()
    const fees = todos.value.find((t) => t.key === 'fees')!
    expect(fees.tone).toBe('alert')
    expect(fees.sub).toContain('逾期')
    expect(fees.sub).toContain('1,200')
  })

  it('入學文件簽署：讀 listMySignRequests().data.pending 的長度，導向 /sign', async () => {
    listMySignRequests.mockResolvedValue({ data: { pending: [{ id: 1 }, { id: 2 }], signed: [] } })
    const { todos, signDocsCount } = useParentTodos()
    await flush()
    expect(signDocsCount.value).toBe(2)
    const row = todos.value.find((t) => t.key === 'signDocs')!
    expect(row.label).toBe('入學文件簽署')
    expect(row.count).toBe(2)
    expect(row.to).toBe('/sign')
  })

  it('待簽文件：讀 pending_event_acks，導向 /events', async () => {
    setSummary({ pending_event_acks: 3 })
    const { todos } = useParentTodos()
    await flush()
    const row = todos.value.find((t) => t.key === 'eventAcks')!
    expect(row.label).toBe('待簽文件')
    expect(row.count).toBe(3)
    expect(row.to).toBe('/events')
  })

  it('臨時接送：讀 listPickupAuthorizations 的 items 長度，tone=info', async () => {
    listPickupAuthorizations.mockResolvedValue({ data: { items: [{ id: 1 }] } })
    const { todos, pickupActiveCount } = useParentTodos()
    await flush()
    expect(pickupActiveCount.value).toBe(1)
    const row = todos.value.find((t) => t.key === 'pickup')!
    expect(row.tone).toBe('info')
    expect(row.to).toBe('/pickup')
  })

  it('未讀公告與請假已成立為 info tone', async () => {
    setSummary({ unread_announcements: 5, recent_leave_reviews: 1 })
    const { todos } = useParentTodos()
    await flush()
    expect(todos.value.find((t) => t.key === 'announcements')!.tone).toBe('info')
    expect(todos.value.find((t) => t.key === 'leaveReviews')!.tone).toBe('info')
  })

  // 用詞對齊 origin/staging @ 1e8fcb1a（請假統一為「已成立」語意）。釘住它，
  // 免得合併時被舊文案蓋回去。
  it('請假列用「已成立」用詞，不再是「審核結果」', async () => {
    setSummary({ recent_leave_reviews: 2 })
    const { todos } = useParentTodos()
    await flush()
    const row = todos.value.find((t) => t.key === 'leaveReviews')!
    expect(row.label).toBe('請假已成立')
    expect(row.label).not.toContain('審核')
    expect(row.sub).toBe('近 7 天 2 筆')
  })
})

describe('useParentTodos 順序與計數', () => {
  it('順序固定為 fees→signDocs→eventAcks→surveys→promotions→pickup→leaveReviews→announcements，逾期不改變位置', async () => {
    setSummary({
      fees: { outstanding_count: 1, outstanding: 100, overdue: 100 },
      pending_event_acks: 1,
      pending_survey_count: 1,
      pending_activity_promotions: 1,
      recent_leave_reviews: 1,
      unread_announcements: 1,
    })
    listMySignRequests.mockResolvedValue({ data: { pending: [{ id: 1 }], signed: [] } })
    listPickupAuthorizations.mockResolvedValue({ data: { items: [{ id: 1 }] } })
    const { todos } = useParentTodos()
    await flush()
    expect(todos.value.map((t) => t.key)).toEqual([
      'fees', 'signDocs', 'eventAcks', 'surveys',
      'promotions', 'pickup', 'leaveReviews', 'announcements',
    ])
  })

  it('actionCount 只加總 action 與 alert 列，不含 info 列', async () => {
    setSummary({
      fees: { outstanding_count: 2, outstanding: 100, overdue: 0 },
      pending_event_acks: 3,
      unread_announcements: 99,
      recent_leave_reviews: 4,
    })
    const { actionCount } = useParentTodos()
    await flush()
    expect(actionCount.value).toBe(5)
  })
})

describe('useParentTodos 錯誤處理', () => {
  it('入學文件 API 失敗：不產生該列，但其他來源的列照常產生', async () => {
    listMySignRequests.mockRejectedValue(new Error('boom'))
    setSummary({ pending_event_acks: 2 })
    const { todos, signDocsCount } = useParentTodos()
    await flush()
    expect(signDocsCount.value).toBe(0)
    expect(todos.value.find((t) => t.key === 'signDocs')).toBeUndefined()
    expect(todos.value.find((t) => t.key === 'eventAcks')).toBeTruthy()
  })

  it('summary 失敗但入學文件成功：仍產生入學文件列，error 有值', async () => {
    summaryRef.value = null
    summaryError.value = new Error('summary down')
    listMySignRequests.mockResolvedValue({ data: { pending: [{ id: 1 }], signed: [] } })
    const { todos, error } = useParentTodos()
    await flush()
    expect(error.value).toBeTruthy()
    expect(todos.value.find((t) => t.key === 'signDocs')).toBeTruthy()
  })

  it('refresh 會重新呼叫兩支 API 與 summary refresh', async () => {
    const { refresh } = useParentTodos()
    await flush()
    listMySignRequests.mockClear()
    listPickupAuthorizations.mockClear()
    await refresh()
    await flush()
    expect(refreshSummary).toHaveBeenCalled()
    expect(listMySignRequests).toHaveBeenCalled()
    expect(listPickupAuthorizations).toHaveBeenCalled()
  })
})
