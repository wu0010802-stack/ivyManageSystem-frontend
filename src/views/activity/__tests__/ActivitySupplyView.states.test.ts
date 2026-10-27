import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const getSuppliesMock = vi.hoisted(() => vi.fn())
const deleteSupplyMock = vi.hoisted(() => vi.fn())
const alertMock = vi.hoisted(() => vi.fn())
const confirmMock = vi.hoisted(() => vi.fn())
vi.mock('@/api/activity', () => ({
  getSupplies: getSuppliesMock,
  createSupply: vi.fn(),
  updateSupply: vi.fn(),
  deleteSupply: deleteSupplyMock,
  getRegistrations: vi.fn(),
}))
vi.mock('@/stores/academicTerm', () => ({ useAcademicTermStore: () => ({ school_year: 114, semester: 1 }) }))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: confirmMock, alert: alertMock },
}))

import ActivitySupplyView from '../ActivitySupplyView.vue'

const STUBS = {
  AcademicTermSelector: true,
  AdminListToolbar: true,
  FormDialog: true,
  'el-table': { props: ['data'], template: '<div><div v-if="!data.length" class="empty"><slot name="empty" /></div></div>' },
  'el-table-column': true,
  'el-button': { template: '<button><slot /></button>' },
  'el-link': true,
  'el-tag': true,
  'el-dialog': true,
  'el-form': true,
  'el-form-item': true,
  'el-input': true,
  'el-input-number': true,
}

interface VM {
  handleDelete: (row: { id: number; name: string; price: number; ordered_count: number }) => Promise<void>
  supplySearch: string
  filteredSupplies: { name: string }[]
}

const mountView = () => mount(ActivitySupplyView, { global: { stubs: STUBS, directives: { loading: () => {} } } })

describe('ActivitySupplyView 狀態與停用', () => {
  beforeEach(() => vi.clearAllMocks())

  it('載入失敗 → 顯示載入失敗與重試，不是「還沒有用品」', async () => {
    getSuppliesMock.mockRejectedValueOnce(new Error('boom'))
    const w = mountView()
    await flushPromises()
    expect(w.find('.empty').text()).toContain('用品資料載入失敗')
    expect(w.find('.empty').text()).not.toContain('這學期還沒有用品')
  })

  it('真的沒有用品 → 引導新增', async () => {
    getSuppliesMock.mockResolvedValueOnce({ data: { supplies: [] } })
    const w = mountView()
    await flushPromises()
    expect(w.find('.empty').text()).toContain('這學期還沒有用品')
  })

  it('仍有報名選用 → 說明不能停用，不呼叫停用 API', async () => {
    getSuppliesMock.mockResolvedValue({ data: { supplies: [] } })
    alertMock.mockResolvedValueOnce(undefined)
    const w = mountView()
    await flushPromises()
    await (w.vm as unknown as VM).handleDelete({ id: 5, name: '畫具', price: 300, ordered_count: 2 })
    expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('2 筆報名'), '暫時不能停用', expect.anything())
    expect(confirmMock).not.toHaveBeenCalled()
    expect(deleteSupplyMock).not.toHaveBeenCalled()
  })

  it('沒人選用 → 確認後停用', async () => {
    getSuppliesMock.mockResolvedValue({ data: { supplies: [] } })
    confirmMock.mockResolvedValueOnce('confirm')
    deleteSupplyMock.mockResolvedValueOnce({})
    const w = mountView()
    await flushPromises()
    await (w.vm as unknown as VM).handleDelete({ id: 5, name: '畫具', price: 300, ordered_count: 0 })
    expect(deleteSupplyMock).toHaveBeenCalledWith(5)
  })

  it('搜尋用品名稱即時過濾', async () => {
    getSuppliesMock.mockResolvedValueOnce({
      data: { supplies: [{ id: 1, name: '美術材料包', price: 500, ordered_count: 0 }, { id: 2, name: '律動服', price: 300, ordered_count: 0 }] },
    })
    const w = mountView()
    await flushPromises()
    const vm = w.vm as unknown as VM
    vm.supplySearch = '美術'
    await flushPromises()
    expect(vm.filteredSupplies.map((r) => r.name)).toEqual(['美術材料包'])
  })
})
