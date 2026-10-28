import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import LeaveQuotaOverviewTable from '../LeaveQuotaOverviewTable.vue'

const getLeaveQuotas = vi.fn()
const initLeaveQuotas = vi.fn()
vi.mock('@/api/leaves', () => ({
  getLeaveQuotas: (...a: unknown[]) => getLeaveQuotas(...a),
  initLeaveQuotas: (...a: unknown[]) => initLeaveQuotas(...a),
}))

const confirmMock = vi.fn()
const alertMock = vi.fn()
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
  ElMessageBox: {
    confirm: (...a: unknown[]) => confirmMock(...a),
    alert: (...a: unknown[]) => alertMock(...a),
  },
}))

vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const EMPLOYEES = [
  { id: 1, name: '林佳蓉' },
  { id: 2, name: '陳雅婷' },
  { id: 3, name: '王思穎' },
]

function mountTable(employees = EMPLOYEES) {
  return mount(LeaveQuotaOverviewTable, { props: { employees } })
}

describe('LeaveQuotaOverviewTable', () => {
  beforeEach(() => {
    getLeaveQuotas.mockReset()
    initLeaveQuotas.mockReset()
  })

  it('掛載時查詢當年度全員配額（不帶 employee_id）', async () => {
    getLeaveQuotas.mockResolvedValue({ data: [] })
    mountTable()
    await flushPromises()
    const call = getLeaveQuotas.mock.calls[0][0]
    expect(call).toHaveProperty('year')
    expect(call).not.toHaveProperty('employee_id')
  })

  it('依 employee_id 把配額列分組到對應員工；沒有配額列的員工標記為未初始化', async () => {
    getLeaveQuotas.mockResolvedValue({
      data: [
        { employee_id: 1, leave_type: 'annual', leave_type_label: '特休', total_hours: 80, used_hours: 24, pending_hours: 40, remaining_hours: 16 },
        { employee_id: 1, leave_type: 'sick', leave_type_label: '病假', total_hours: 240, used_hours: 8, pending_hours: 0, remaining_hours: 232 },
        { employee_id: 2, leave_type: 'annual', leave_type_label: '特休', total_hours: 56, used_hours: 56, pending_hours: 0, remaining_hours: 0 },
      ],
    })
    const w = mountTable()
    await flushPromises()

    const rows = w.vm.$.setupState.employeeRows
    const emp1 = rows.find((r: { employee_id: number }) => r.employee_id === 1)
    const emp2 = rows.find((r: { employee_id: number }) => r.employee_id === 2)
    const emp3 = rows.find((r: { employee_id: number }) => r.employee_id === 3)

    expect(emp1.initialized).toBe(true)
    expect(emp1.cells.annual.remaining_hours).toBe(16)
    expect(emp1.cells.sick.remaining_hours).toBe(232)
    expect(emp2.initialized).toBe(true)
    expect(emp2.cells.annual.remaining_hours).toBe(0)
    expect(emp3.initialized).toBe(false)
    expect(emp3.cells).toEqual({})
  })

  it('cellClass：remaining<=0 為 bad、<16 為 warn、其餘 ok', async () => {
    getLeaveQuotas.mockResolvedValue({ data: [] })
    const w = mountTable()
    await flushPromises()
    const cellClass = w.vm.$.setupState.cellClass
    expect(cellClass({ remaining_hours: 0, total_hours: 10, used_hours: 10, pending_hours: 0 })).toBe('bad')
    expect(cellClass({ remaining_hours: 8, total_hours: 80, used_hours: 72, pending_hours: 0 })).toBe('warn')
    expect(cellClass({ remaining_hours: 40, total_hours: 80, used_hours: 40, pending_hours: 0 })).toBe('ok')
    expect(cellClass(undefined)).toBe('none')
  })

  it('特休剩 <16h 篩選只留符合條件且已初始化的員工', async () => {
    getLeaveQuotas.mockResolvedValue({
      data: [
        { employee_id: 1, leave_type: 'annual', leave_type_label: '特休', total_hours: 80, used_hours: 72, pending_hours: 0, remaining_hours: 8 },
        { employee_id: 2, leave_type: 'annual', leave_type_label: '特休', total_hours: 80, used_hours: 20, pending_hours: 0, remaining_hours: 60 },
      ],
    })
    const w = mountTable()
    await flushPromises()

    w.vm.$.setupState.filterValues.focus = 'low_annual'
    await flushPromises()
    const ids = w.vm.$.setupState.filteredRows.map((r: { employee_id: number }) => r.employee_id)
    expect(ids).toEqual([1])
  })

  it('尚未初始化篩選只留沒有配額列的員工', async () => {
    getLeaveQuotas.mockResolvedValue({
      data: [{ employee_id: 1, leave_type: 'annual', leave_type_label: '特休', total_hours: 80, used_hours: 0, pending_hours: 0, remaining_hours: 80 }],
    })
    const w = mountTable()
    await flushPromises()

    w.vm.$.setupState.filterValues.focus = 'uninitialized'
    await flushPromises()
    const ids = w.vm.$.setupState.filteredRows.map((r: { employee_id: number }) => r.employee_id).sort()
    expect(ids).toEqual([2, 3])
  })

  it('搜尋依姓名收斂', async () => {
    getLeaveQuotas.mockResolvedValue({ data: [] })
    const w = mountTable()
    await flushPromises()

    w.vm.$.setupState.search = '林'
    await flushPromises()
    expect(w.vm.$.setupState.filteredRows.map((r: { employee_name: string }) => r.employee_name)).toEqual(['林佳蓉'])
  })

  it('欄位順序依 LEAVE_TYPES 既有順序（特休在事假之後、病假之前，依定義序）而非回應陣列順序', async () => {
    getLeaveQuotas.mockResolvedValue({
      data: [
        { employee_id: 1, leave_type: 'sick', leave_type_label: '病假', total_hours: 240, used_hours: 0, pending_hours: 0, remaining_hours: 240 },
        { employee_id: 1, leave_type: 'personal', leave_type_label: '事假', total_hours: 112, used_hours: 0, pending_hours: 0, remaining_hours: 112 },
      ],
    })
    const w = mountTable()
    await flushPromises()
    const values = w.vm.$.setupState.columns.map((c: { value: string }) => c.value)
    expect(values.indexOf('personal')).toBeLessThan(values.indexOf('sick'))
  })

  it('initRow 呼叫 initLeaveQuotas 並重新載入總覽', async () => {
    getLeaveQuotas.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({
      data: [{ employee_id: 3, leave_type: 'annual', leave_type_label: '特休', total_hours: 40, used_hours: 0, pending_hours: 0, remaining_hours: 40 }],
    })
    initLeaveQuotas.mockResolvedValue({ data: [] })
    const w = mountTable()
    await flushPromises()

    const row = w.vm.$.setupState.employeeRows.find((r: { employee_id: number }) => r.employee_id === 3)
    await w.vm.$.setupState.initRow(row)
    await flushPromises()

    expect(initLeaveQuotas).toHaveBeenCalledWith(expect.objectContaining({ employee_id: 3 }))
    expect(getLeaveQuotas).toHaveBeenCalledTimes(2)
  })

  it('整年度沒有任何人初始化時，表頭仍畫出有上限的假別欄（不塌成只剩員工欄）', async () => {
    getLeaveQuotas.mockResolvedValue({ data: [] })
    const w = mountTable()
    await flushPromises()
    const cols = w.vm.$.setupState.columns.map((c: { value: string }) => c.value)
    expect(cols).toEqual(['annual', 'sick', 'menstrual', 'personal', 'family_care'])
    expect(w.findAll('thead th').length).toBe(cols.length + 2)
  })

  it('批次初始化只處理尚未初始化的員工（已初始化者不被覆寫回法定值），完成後重新載入', async () => {
    getLeaveQuotas.mockResolvedValue({
      data: [
        { employee_id: 1, leave_type: 'annual', leave_type_label: '特休', total_hours: 80, used_hours: 0, pending_hours: 0, remaining_hours: 80 },
      ],
    })
    confirmMock.mockResolvedValue('confirm')
    initLeaveQuotas.mockResolvedValue({})
    const w = mountTable()
    await flushPromises()

    await w.vm.$.setupState.initAllUninitialized()
    await flushPromises()

    const ids = initLeaveQuotas.mock.calls.map((c) => (c[0] as { employee_id: number }).employee_id).sort()
    expect(ids).toEqual([2, 3])
    expect(getLeaveQuotas).toHaveBeenCalledTimes(2)
    expect(w.vm.$.setupState.bulkProgress).toBeNull()
  })

  it('批次初始化取消確認時不呼叫任何初始化', async () => {
    getLeaveQuotas.mockResolvedValue({ data: [] })
    confirmMock.mockRejectedValue('cancel')
    const w = mountTable()
    await flushPromises()
    await w.vm.$.setupState.initAllUninitialized()
    expect(initLeaveQuotas).not.toHaveBeenCalled()
  })

  it('批次初始化部分失敗時繼續處理其餘員工並列出失敗名單', async () => {
    getLeaveQuotas.mockResolvedValue({ data: [] })
    confirmMock.mockResolvedValue('confirm')
    alertMock.mockResolvedValue('confirm')
    initLeaveQuotas.mockImplementation(async (p: { employee_id: number }) => {
      if (p.employee_id === 2) throw new Error('boom')
      return {}
    })
    const w = mountTable()
    await flushPromises()
    await w.vm.$.setupState.initAllUninitialized()
    await flushPromises()
    expect(initLeaveQuotas).toHaveBeenCalledTimes(3)
    expect(alertMock).toHaveBeenCalledTimes(1)
    expect(String(alertMock.mock.calls[0][0])).toContain('陳雅婷')
  })
  // bug-hunt 10-28 idx5：GET 失敗／年度切換競態時，不得把已初始化的人誤判為未初始化而批次覆寫回法定值
  it('總覽載入失敗時不顯示批次初始化、不把員工標成未初始化，也不呼叫 init', async () => {
    getLeaveQuotas.mockRejectedValue(new Error('500'))
    confirmMock.mockResolvedValue('confirm')
    const w = mountTable()
    await flushPromises()

    expect(w.vm.$.setupState.uninitializedCount).toBe(0)
    expect(w.find('[data-test="quota-init-all"]').exists()).toBe(false)
    expect(w.text()).not.toContain('尚未初始化配額')
    await w.vm.$.setupState.initAllUninitialized()
    await flushPromises()
    expect(initLeaveQuotas).not.toHaveBeenCalled()
  })

  it('切換年度後新年度載入失敗，不沿用上一年度資料判定未初始化', async () => {
    getLeaveQuotas
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce(new Error('timeout'))
    confirmMock.mockResolvedValue('confirm')
    const w = mountTable()
    await flushPromises()
    expect(w.vm.$.setupState.uninitializedCount).toBe(3)

    w.vm.$.setupState.overviewYear = w.vm.$.setupState.overviewYear + 1
    await flushPromises()
    await flushPromises()

    expect(w.vm.$.setupState.uninitializedCount).toBe(0)
    await w.vm.$.setupState.initAllUninitialized()
    await flushPromises()
    expect(initLeaveQuotas).not.toHaveBeenCalled()
  })

  it('快速切換年度時較慢的舊年度回應不得蓋掉目前年度的資料', async () => {
    const y = new Date().getFullYear()
    let resolveOld: (v: unknown) => void = () => {}
    getLeaveQuotas.mockImplementation((p: { year: number }) => {
      if (p.year === y + 1) return new Promise((r) => { resolveOld = r })
      // 目前年度：員工 1 已初始化
      return Promise.resolve({
        data: [{ employee_id: 1, leave_type: 'sick', leave_type_label: '病假', total_hours: 300, used_hours: 0, pending_hours: 0, remaining_hours: 300 }],
      })
    })
    confirmMock.mockResolvedValue('confirm')
    initLeaveQuotas.mockResolvedValue({})
    const w = mountTable()
    await flushPromises()

    w.vm.$.setupState.overviewYear = y + 1
    await flushPromises()
    w.vm.$.setupState.overviewYear = y
    await flushPromises()
    await flushPromises()
    // 舊（y+1）回應晚到：員工 1 在 y+1 沒有配額
    resolveOld({ data: [] })
    await flushPromises()
    await flushPromises()

    const emp1 = w.vm.$.setupState.employeeRows.find((r: { employee_id: number }) => r.employee_id === 1)
    expect(emp1.initialized).toBe(true)
    await w.vm.$.setupState.initAllUninitialized()
    await flushPromises()
    const ids = initLeaveQuotas.mock.calls.map((c) => (c[0] as { employee_id: number }).employee_id)
    expect(ids).not.toContain(1)
  })
})
