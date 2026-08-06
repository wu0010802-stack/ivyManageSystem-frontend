import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getChangesMock = vi.hoisted(() => vi.fn())
const getChangesMetaMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ data: { change_types: [] } }),
)

vi.mock('@/api/activity', () => ({
  getChanges: getChangesMock,
  getChangesMeta: getChangesMetaMock,
}))

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn() },
}))

import ActivityChangesView from '../ActivityChangesView.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const STUBS = {
  'el-button': { template: '<button><slot /></button>' },
  'el-table': { template: '<div><slot /></div>' },
  'el-table-column': { template: '<div />' },
  'el-pagination': { template: '<div />' },
}

interface ChangeRow {
  id: number
  student_name: string
}

interface SetupState {
  page: number
  list: ChangeRow[]
  loading: boolean
  fetchList: () => Promise<void>
}

describe('ActivityChangesView 分頁請求序號守衛', () => {
  beforeEach(() => vi.clearAllMocks())

  it('較慢的舊頁回應不會覆寫較新頁面的紀錄', async () => {
    getChangesMock.mockResolvedValueOnce({ data: { items: [], total: 0 } })
    const wrapper = mount(ActivityChangesView, {
      global: { stubs: STUBS, directives: { loading: () => {} } },
    })
    await flushPromises()

    const firstPage = deferred<unknown>()
    const secondPage = deferred<unknown>()
    getChangesMock
      .mockReturnValueOnce(firstPage.promise)
      .mockReturnValueOnce(secondPage.promise)

    const state = wrapper.vm.$.setupState as SetupState
    state.page = 1
    const firstRequest = state.fetchList()
    state.page = 2
    const secondRequest = state.fetchList()

    secondPage.resolve({
      data: { items: [{ id: 22, student_name: '第二頁學生' }], total: 40 },
    })
    await flushPromises()
    firstPage.resolve({
      data: { items: [{ id: 11, student_name: '第一頁學生' }], total: 40 },
    })
    await Promise.all([firstRequest, secondRequest])
    await flushPromises()

    expect(state.page).toBe(2)
    expect(state.list).toEqual([{ id: 22, student_name: '第二頁學生' }])
    expect(state.loading).toBe(false)
    wrapper.unmount()
  })
})
