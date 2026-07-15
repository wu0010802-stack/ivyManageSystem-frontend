import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/api/activity', () => ({ getRegistrations: vi.fn() }))
vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn(() => true) }))
vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn() } }))

import { getRegistrations } from '@/api/activity'
import ActivityTab from '../ActivityTab.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

describe('ActivityTab 學生切換', () => {
  beforeEach(() => vi.clearAllMocks())

  it('studentId 改變後立即清空舊學生資料並重新抓取', async () => {
    vi.mocked(getRegistrations)
      .mockResolvedValueOnce({ data: { items: [{ id: 1, course_names: 'A 的課' }] } } as never)
      .mockResolvedValueOnce({ data: { items: [{ id: 2, course_names: 'B 的課' }] } } as never)
    const wrapper = mount(ActivityTab, {
      props: { studentId: 1, active: true },
      global: {
        stubs: {
          'el-button': { template: '<button><slot /></button>' },
          'el-table': { props: ['data'], template: '<div data-test="table">{{ JSON.stringify(data) }}</div>' },
          'el-table-column': true,
          'el-tag': { template: '<span><slot /></span>' },
          'el-empty': { props: ['description'], template: '<div>{{ description }}</div>' },
        },
        directives: { loading: () => {} },
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('A 的課')

    await wrapper.setProps({ studentId: 2 })
    expect(wrapper.text()).not.toContain('A 的課')
    await flushPromises()

    expect(getRegistrations).toHaveBeenLastCalledWith({ student_id: 2, limit: 100 })
    expect(wrapper.text()).toContain('B 的課')
  })

  it('A 的慢回應不得覆寫已切換完成的 B', async () => {
    const a = deferred<{ data: { items: Array<{ id: number; course_names: string }> } }>()
    vi.mocked(getRegistrations)
      .mockReturnValueOnce(a.promise as never)
      .mockResolvedValueOnce({ data: { items: [{ id: 2, course_names: 'B 的課' }] } } as never)
    const wrapper = mount(ActivityTab, {
      props: { studentId: 1, active: true },
      global: {
        stubs: {
          'el-button': true,
          'el-table': { props: ['data'], template: '<div>{{ JSON.stringify(data) }}</div>' },
          'el-table-column': true,
          'el-tag': true,
          'el-empty': true,
        },
        directives: { loading: () => {} },
      },
    })

    await wrapper.setProps({ studentId: 2 })
    await flushPromises()
    expect(wrapper.text()).toContain('B 的課')

    a.resolve({ data: { items: [{ id: 1, course_names: 'A 的慢課' }] } })
    await flushPromises()
    expect(wrapper.text()).toContain('B 的課')
    expect(wrapper.text()).not.toContain('A 的慢課')
  })
})
