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

vi.mock('element-plus', () => ({
  ElMessage: {
    success: (...a) => ElMessageSuccess(...a),
    error: (...a) => ElMessageError(...a),
    warning: (...a) => ElMessageWarning(...a),
  },
  ElMessageBox: {
    confirm: (...a) => ElMessageBoxConfirm(...a),
  },
}))

// ────────────────────────────────────────────────────────────────── //

import { useActivityRegistration } from '@/composables/useActivityRegistration'

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

  it('batchMarkPaid 送出正確的 ids 和 isPaid', async () => {
    const { selectedIds, batchMarkPaid } = useActivityRegistration()
    selectedIds.value = [1, 2, 3]

    await batchMarkPaid(true)

    expect(batchUpdatePayment).toHaveBeenCalledWith([1, 2, 3], true)
  })

  it('batchMarkPaid 成功後顯示後端訊息並清空 selectedIds', async () => {
    const { selectedIds, batchMarkPaid } = useActivityRegistration()
    selectedIds.value = [1, 2]

    await batchMarkPaid(true)

    expect(ElMessageSuccess).toHaveBeenCalledWith('已更新 2 筆報名為已繳費')
    expect(selectedIds.value).toEqual([])
  })

  it('batchMarkPaid 取消確認後不呼叫 API', async () => {
    ElMessageBoxConfirm.mockRejectedValue(new Error('cancel'))

    const { selectedIds, batchMarkPaid } = useActivityRegistration()
    selectedIds.value = [1]

    await batchMarkPaid(true)

    expect(batchUpdatePayment).not.toHaveBeenCalled()
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
