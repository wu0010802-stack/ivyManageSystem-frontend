import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getChangesMock = vi.hoisted(() => vi.fn())
const getChangesMetaMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/activity', () => ({
  getChanges: getChangesMock,
  getChangesMeta: getChangesMetaMock,
}))

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn() },
}))

import ActivityChangesView from '../ActivityChangesView.vue'

const STUBS = {
  'el-button': { template: '<button><slot /></button>' },
  'el-table': { template: '<div><slot /></div>' },
  'el-table-column': { template: '<div />' },
  'el-pagination': { template: '<div />' },
  'el-input': { template: '<input />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { template: '<div />' },
  'el-date-picker': { template: '<div />' },
}

interface SetupState {
  page: number
  changeTypes: string[]
  filters: { studentName: string; changeType: string; changedBy: string }
  dateRange: [string, string] | null
  search: () => void
  fetchList: () => Promise<void>
}

async function mountView() {
  getChangesMock.mockResolvedValue({ data: { items: [], total: 0 } })
  getChangesMetaMock.mockResolvedValue({ data: { change_types: ['退課', '刪除報名'] } })
  const wrapper = mount(ActivityChangesView, {
    global: { stubs: STUBS, directives: { loading: () => {} } },
  })
  await flushPromises()
  return wrapper
}

describe('ActivityChangesView 篩選', () => {
  beforeEach(() => vi.clearAllMocks())

  it('未填任何條件時只送分頁參數，不送空字串', async () => {
    await mountView()
    expect(getChangesMock).toHaveBeenCalledWith({ skip: 0, limit: 20 })
  })

  it('填入的條件會轉成後端參數名送出', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as SetupState
    vm.filters.studentName = '陳'
    vm.filters.changeType = '退課'
    vm.filters.changedBy = 'teacher_a'
    vm.dateRange = ['2026-08-01', '2026-08-04']
    getChangesMock.mockClear()

    vm.search()
    await flushPromises()

    expect(getChangesMock).toHaveBeenCalledWith({
      skip: 0,
      limit: 20,
      student_name: '陳',
      change_type: '退課',
      changed_by: 'teacher_a',
      date_from: '2026-08-01',
      date_to: '2026-08-04',
    })
  })

  it('換條件會回到第一頁（否則停在舊頁碼會看到空清單）', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as SetupState
    vm.page = 3
    vm.filters.studentName = '林'
    getChangesMock.mockClear()

    vm.search()
    await flushPromises()

    expect(vm.page).toBe(1)
    expect(getChangesMock).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0 }),
    )
  })

  it('異動類型下拉選項來自後端 meta，不在前端硬編', async () => {
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as SetupState
    expect(getChangesMetaMock).toHaveBeenCalled()
    expect(vm.changeTypes).toEqual(['退課', '刪除報名'])
  })

  it('meta 載入失敗不影響主清單（下拉留空即可）', async () => {
    getChangesMock.mockResolvedValue({ data: { items: [{ id: 1 }], total: 1 } })
    getChangesMetaMock.mockRejectedValue(new Error('boom'))
    const wrapper = mount(ActivityChangesView, {
      global: { stubs: STUBS, directives: { loading: () => {} } },
    })
    await flushPromises()

    const vm = wrapper.vm as unknown as SetupState
    expect(vm.changeTypes).toEqual([])
    expect(getChangesMock).toHaveBeenCalled()
  })
})
