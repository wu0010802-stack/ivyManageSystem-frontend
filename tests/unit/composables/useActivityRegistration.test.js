import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// ── API mocks ──────────────────────────────────────────────────────────────
const getRegistrations = vi.fn()
const batchUpdatePayment = vi.fn()
const getCourses = vi.fn()
const getClassOptions = vi.fn()

vi.mock('@/api/activity', () => ({
  getRegistrations: (...a) => getRegistrations(...a),
  batchUpdatePayment: (...a) => batchUpdatePayment(...a),
  getCourses: (...a) => getCourses(...a),
  getClassOptions: (...a) => getClassOptions(...a),
}))

// ── vue-router mock ─────────────────────────────────────────────────────────
const mockReplace = vi.fn()
const mockQuery = { value: {} }

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mockQuery.value }),
  useRouter: () => ({ replace: mockReplace }),
}))

// ── Element Plus mocks ─────────────────────────────────────────────────────
const ElMessageSuccess = vi.fn()
const ElMessageError = vi.fn()
const ElMessageWarning = vi.fn()
const ElMessageBoxConfirm = vi.fn()
const ElMessageBoxPrompt = vi.fn()

vi.mock('element-plus', () => ({
  ElMessage: {
    success: (...a) => ElMessageSuccess(...a),
    error: (...a) => ElMessageError(...a),
    warning: (...a) => ElMessageWarning(...a),
  },
  ElMessageBox: {
    confirm: (...a) => ElMessageBoxConfirm(...a),
    prompt: (...a) => ElMessageBoxPrompt(...a),
  },
}))

// ────────────────────────────────────────────────────────────────── //

import { useActivityRegistration } from '@/composables/useActivityRegistration'
import { useAcademicTermStore } from '@/stores/academicTerm'

describe('useActivityRegistration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockQuery.value = {}

    // 預設 API 回傳
    getRegistrations.mockResolvedValue({ data: { items: [], total: 0 } })
    getCourses.mockResolvedValue({ data: { courses: [] } })
    getClassOptions.mockResolvedValue({ data: { options: [] } })
    batchUpdatePayment.mockResolvedValue({ data: { message: '已更新 2 筆報名為已繳費' } })
    ElMessageBoxConfirm.mockResolvedValue(true)
    // batchMarkPaid 改用 prompt 收集 reason（2026-04-27 守衛）；測試預設一個合法 reason
    ElMessageBoxPrompt.mockResolvedValue({ value: '期末批次補齊（家長現金繳清，已對帳）' })
  })

  it('fetchList 呼叫 API 並更新 list 和 total', async () => {
    const items = [{ id: 1, student_name: '王小明' }]
    getRegistrations.mockResolvedValue({ data: { items, total: 1 } })

    const { list, total, fetchList } = useActivityRegistration()
    await fetchList()

    expect(getRegistrations).toHaveBeenCalledOnce()
    expect(list.value).toEqual(items)
    expect(total.value).toBe(1)
  })

  it('新查詢開始即清空舊列表，失敗後維持空資料避免操作上一學期', async () => {
    getRegistrations.mockResolvedValueOnce({
      data: { items: [{ id: 1, student_name: '舊學期學生' }], total: 1 },
    })
    const { list, total, fetchList } = useActivityRegistration()
    await fetchList()
    expect(list.value).toHaveLength(1)

    let rejectNext
    getRegistrations.mockReturnValueOnce(new Promise((_, reject) => {
      rejectNext = reject
    }))
    const pending = fetchList()

    expect(list.value).toEqual([])
    expect(total.value).toBe(0)

    rejectNext(new Error('network'))
    await pending
    expect(list.value).toEqual([])
    expect(total.value).toBe(0)
  })

  it('handleSearch 重置 page=1 並呼叫 fetchList', async () => {
    vi.useFakeTimers()
    const { page, handleSearch } = useActivityRegistration()
    page.value = 3

    handleSearch()
    await vi.advanceTimersByTimeAsync(300)

    expect(page.value).toBe(1)
    expect(getRegistrations).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('fetchList 傳遞正確的篩選參數', async () => {
    const { searchText, paymentFilter, courseFilter, classroomFilter, fetchList } = useActivityRegistration()
    searchText.value = '王'
    paymentFilter.value = 'paid'
    courseFilter.value = 5
    classroomFilter.value = '大班'

    await fetchList()

    expect(getRegistrations).toHaveBeenCalledWith(
      expect.objectContaining({
        search: '王',
        payment_status: 'paid',
        course_id: 5,
        classroom_name: '大班',
      })
    )
  })

  it('fetchList 帶 match_status；選 rejected 時附 include_inactive=true', async () => {
    const { matchStatusFilter, fetchList } = useActivityRegistration()

    matchStatusFilter.value = 'pending'
    await fetchList()
    expect(getRegistrations).toHaveBeenLastCalledWith(
      expect.objectContaining({ match_status: 'pending', include_inactive: undefined })
    )

    matchStatusFilter.value = 'rejected'
    await fetchList()
    expect(getRegistrations).toHaveBeenLastCalledWith(
      expect.objectContaining({ match_status: 'rejected', include_inactive: true })
    )
  })

  // ── 回歸：不篩選（全部）時也要看得到全部審核狀態，含已拒絕 ──────────────────
  // Bug：原本不篩選時完全不帶 include_inactive，導致 is_active=False 的「已拒絕」
  // 報名在「全部」檢視下永遠不會出現；後端已同步收斂為「未帶 match_status 時
  // include_inactive=true 只會多放行 rejected，不會連刪除報名一併洩漏」。
  it('fetchList 不篩選（全部）時也附 include_inactive=true', async () => {
    const { matchStatusFilter, fetchList } = useActivityRegistration()

    expect(matchStatusFilter.value).toBe('')
    await fetchList()
    expect(getRegistrations).toHaveBeenLastCalledWith(
      expect.objectContaining({ match_status: undefined, include_inactive: true })
    )
  })

  it('batchMarkPaid 送出正確的 ids 與 reason（只接受 isPaid=true，批次沖帳已禁用）', async () => {
    const { batchMarkPaid } = useActivityRegistration()
    const termStore = useAcademicTermStore()

    await batchMarkPaid(true, [1, 2, 3])

    expect(batchUpdatePayment).toHaveBeenCalledWith(
      [1, 2, 3],
      '期末批次補齊（家長現金繳清，已對帳）',
      { school_year: termStore.school_year, semester: termStore.semester }
    )
  })

  // ── 資安（#3 2026-07-30）：切換學期後批次操作誤打上一學期資料 ─────────────
  // batchMarkPaid 需帶上呼叫端目前檢視的學期，讓後端可驗證整批 ids 同屬此學期，
  // 不符時回 409（見 schemas/activity_admin.py BatchPaymentUpdate）。
  it('batchMarkPaid payload 帶當前選定學期（資安 #3 2026-07-30）', async () => {
    const { batchMarkPaid } = useActivityRegistration()
    const termStore = useAcademicTermStore()
    termStore.setTerm(115, 2)

    await batchMarkPaid(true, [1, 2])

    expect(batchUpdatePayment).toHaveBeenCalledWith(
      [1, 2],
      '期末批次補齊（家長現金繳清，已對帳）',
      { school_year: 115, semester: 2 }
    )
  })

  it('batchMarkPaid 遇後端 409（批次名單與目前學期不符）時明確提示重新整理，並清空選取、重抓列表', async () => {
    batchUpdatePayment.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { detail: '批次名單與目前檢視的學期不符，請重新整理後再操作' },
      },
    })
    const onSuccess = vi.fn()
    const { batchMarkPaid } = useActivityRegistration()

    await batchMarkPaid(true, [1, 2], onSuccess)

    expect(ElMessageError).toHaveBeenCalledWith('批次名單與目前檢視的學期不符，請重新整理後再操作')
    // 409 屬「選取殘留舊學期資料」情境：清空選取（呼叫端 view 層 clearSelection）
    expect(onSuccess).toHaveBeenCalledOnce()
    // 重新整理列表，避免使用者以同一批 ids 重試仍然失敗
    expect(getRegistrations).toHaveBeenCalled()
  })

  it('batchMarkPaid 傳入 isPaid=false 不呼叫 API（已禁用批次沖帳）', async () => {
    const { batchMarkPaid } = useActivityRegistration()

    await batchMarkPaid(false, [1, 2])

    expect(batchUpdatePayment).not.toHaveBeenCalled()
  })

  it('batchMarkPaid 成功後顯示後端訊息', async () => {
    const { batchMarkPaid } = useActivityRegistration()

    await batchMarkPaid(true, [1, 2])

    expect(ElMessageSuccess).toHaveBeenCalledWith('已更新 2 筆報名為已繳費')
  })

  it('batchMarkPaid 取消確認後不呼叫 API', async () => {
    // prompt 取消（user 按 cancel 或關閉對話框）→ ElMessageBox.prompt reject
    ElMessageBoxPrompt.mockRejectedValue(new Error('cancel'))

    const { batchMarkPaid } = useActivityRegistration()

    await batchMarkPaid(true, [1])

    expect(batchUpdatePayment).not.toHaveBeenCalled()
  })

  it('batchMarkPaid prompt 要求原因 ≥ 15 字（對齊後端 BatchPaymentUpdate.reason）', async () => {
    // 後端 BatchPaymentUpdate.reason 硬限 MIN_REFUND_REASON_LENGTH=15；前端 prompt
    // 過去用 5 字 regex，5-14 字會過前端、被後端 422。
    const { batchMarkPaid } = useActivityRegistration()

    await batchMarkPaid(true, [1, 2])

    const opts = ElMessageBoxPrompt.mock.calls[0][2]
    expect(opts.inputPattern.test('一二三四五六七八九十一二三四')).toBe(false) // 14 字
    expect(opts.inputPattern.test('一二三四五六七八九十一二三四五')).toBe(true) // 15 字
    const message = ElMessageBoxPrompt.mock.calls[0][0]
    expect(message).toContain('15')
  })

  it('initFromQuery 從 URL query 反序列化篩選條件', () => {
    mockQuery.value = {
      search: '李',
      payment_status: 'partial',
      course_id: '3',
      classroom_name: '中班',
      page: '2',
    }

    const { searchText, paymentFilter, courseFilter, classroomFilter, page, initFromQuery } = useActivityRegistration()
    initFromQuery()

    expect(searchText.value).toBe('李')
    expect(paymentFilter.value).toBe('partial')
    expect(courseFilter.value).toBe(3)
    expect(classroomFilter.value).toBe('中班')
    expect(page.value).toBe(2)
  })

  it('fetchList 後推送 URL query（篩選有值時）', async () => {
    const { searchText, fetchList } = useActivityRegistration()
    searchText.value = '測試'

    await fetchList()

    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ search: '測試' }) })
    )
  })

  it('loadOptions 載入課程和班級選項', async () => {
    const courses = [{ id: 1, name: '美術' }]
    const options = ['大班', '中班']
    getCourses.mockResolvedValue({ data: { courses } })
    getClassOptions.mockResolvedValue({ data: { options } })

    const { courseOptions, classroomOptions, loadOptions } = useActivityRegistration()
    await loadOptions()

    expect(courseOptions.value).toEqual(courses)
    expect(classroomOptions.value).toEqual(options)
    const termStore = useAcademicTermStore()
    expect(getClassOptions).toHaveBeenCalledWith({
      school_year: termStore.school_year,
      semester: termStore.semester,
    })
  })

  it('同學期第二次 loadOptions 不重抓班級，切換學期後會重抓', async () => {
    getCourses.mockResolvedValue({ data: { courses: [{ id: 1, name: '美術' }] } })
    getClassOptions.mockResolvedValue({ data: { options: ['大班'] } })

    const { loadOptions } = useActivityRegistration()
    await loadOptions() // 首次：課程 + 班級各一次
    expect(getCourses).toHaveBeenCalledTimes(1)
    expect(getClassOptions).toHaveBeenCalledTimes(1)

    await loadOptions() // mutation 後刷新名額：只重抓課程
    expect(getCourses).toHaveBeenCalledTimes(2)
    expect(getClassOptions).toHaveBeenCalledTimes(1)

    const termStore = useAcademicTermStore()
    termStore.setTerm(termStore.school_year + 1, termStore.semester)
    await vi.waitFor(() => expect(getClassOptions).toHaveBeenCalledTimes(2))
    expect(getClassOptions).toHaveBeenLastCalledWith({
      school_year: termStore.school_year,
      semester: termStore.semester,
    })
  })

  it('班級守衛：首次 getClassOptions 失敗則下次仍會重試（未標記已載入）', async () => {
    getCourses.mockResolvedValue({ data: { courses: [] } })
    getClassOptions
      .mockRejectedValueOnce(new Error('班級載入失敗'))
      .mockResolvedValueOnce({ data: { options: ['大班'] } })

    const { classroomOptions, loadOptions } = useActivityRegistration()
    await loadOptions() // 班級失敗
    expect(classroomOptions.value).toEqual([])

    await loadOptions() // 應重試班級
    expect(getClassOptions).toHaveBeenCalledTimes(2)
    expect(classroomOptions.value).toEqual(['大班'])
  })

  it('handleSearch 有防抖：300ms 內多次呼叫只觸發一次 fetchList', async () => {
    vi.useFakeTimers()

    const { handleSearch } = useActivityRegistration()

    handleSearch()
    handleSearch()
    handleSearch()

    // 300ms 內尚未觸發
    await vi.advanceTimersByTimeAsync(299)
    expect(getRegistrations).not.toHaveBeenCalled()

    // 等過 300ms 後才觸發一次
    await vi.advanceTimersByTimeAsync(1)
    expect(getRegistrations).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  it('handleSearch 重置 page=1（防抖觸發後）', async () => {
    vi.useFakeTimers()

    const { page, handleSearch } = useActivityRegistration()
    page.value = 5

    handleSearch()
    await vi.advanceTimersByTimeAsync(300)

    expect(page.value).toBe(1)

    vi.useRealTimers()
  })
})
