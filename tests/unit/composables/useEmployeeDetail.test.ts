import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'

const mockGetEmployee = vi.fn()
const mockListEdu = vi.fn()
const mockListCert = vi.fn()
const mockListContract = vi.fn()
const mockListClassHistory = vi.fn()

vi.mock('@/api/employees', () => ({
  getEmployee: (...a: unknown[]) => mockGetEmployee(...a),
  listEmployeeEducations: (...a: unknown[]) => mockListEdu(...a),
  listEmployeeCertificates: (...a: unknown[]) => mockListCert(...a),
  listEmployeeContracts: (...a: unknown[]) => mockListContract(...a),
  listEmployeeClassHistory: (...a: unknown[]) => mockListClassHistory(...a),
}))

import { useEmployeeDetail } from '@/composables/useEmployeeDetail'

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.clearAllMocks()
  // 真實契約形狀：employee 物件直接在 data；class-history 是 { rows: [...] }
  mockGetEmployee.mockResolvedValue({ data: { id: 1, name: '呂麗珍', base_salary: 45300 } })
  mockListEdu.mockResolvedValue({ data: [{ id: 10, school_name: '靜宜大學' }] })
  mockListCert.mockResolvedValue({ data: [] })
  mockListContract.mockResolvedValue({ data: [] })
  mockListClassHistory.mockResolvedValue({ data: { rows: [{ school_year: 114, semester: 1 }] } })
})

describe('useEmployeeDetail', () => {
  it('immediate 載入主資料與四子資源（深連結不依賴清單 store）', async () => {
    const id = ref(1)
    const d = useEmployeeDetail(id)
    await flush(); await nextTick()
    expect(mockGetEmployee).toHaveBeenCalledWith(1)
    expect(d.employee.value).toMatchObject({ id: 1, name: '呂麗珍' })
    expect(d.educations.value).toHaveLength(1)
    expect(d.classHistory.value).toEqual([{ school_year: 114, semester: 1 }])
    expect(d.loading.value).toBe(false)
    expect(d.error.value).toBeNull()
  })

  it('主資料失敗 → error 設定、不打子資源', async () => {
    mockGetEmployee.mockRejectedValueOnce(new Error('404'))
    const d = useEmployeeDetail(ref(999))
    await flush(); await nextTick()
    expect(d.error.value).toBe('載入員工資料失敗')
    expect(d.employee.value).toBeNull()
    expect(mockListEdu).not.toHaveBeenCalled()
    expect(d.loading.value).toBe(false)
  })

  it('子資源單項失敗 → 不設 error、subResourceErrors 計數', async () => {
    mockListCert.mockRejectedValueOnce(new Error('boom'))
    const d = useEmployeeDetail(ref(1))
    await flush(); await nextTick()
    expect(d.error.value).toBeNull()
    expect(d.subResourceErrors.value).toBe(1)
    expect(d.educations.value).toHaveLength(1)
  })

  it('id 變更 → 自動全量重載', async () => {
    const id = ref(1)
    useEmployeeDetail(id)
    await flush()
    id.value = 2
    await flush(); await nextTick()
    expect(mockGetEmployee).toHaveBeenLastCalledWith(2)
  })

  it('reloadCore 只重打主資料', async () => {
    const d = useEmployeeDetail(ref(1))
    await flush()
    vi.clearAllMocks()
    mockGetEmployee.mockResolvedValue({ data: { id: 1, name: '呂麗珍（改）' } })
    await d.reloadCore()
    expect(mockGetEmployee).toHaveBeenCalledTimes(1)
    expect(mockListEdu).not.toHaveBeenCalled()
    expect(d.employee.value).toMatchObject({ name: '呂麗珍（改）' })
  })
})
