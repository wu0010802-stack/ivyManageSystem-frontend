import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getChangesMock = vi.hoisted(() => vi.fn())
const getChangesMetaMock = vi.hoisted(() => vi.fn())
const pushMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/activity', () => ({
  getChanges: getChangesMock,
  getChangesMeta: getChangesMetaMock,
}))
vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn() } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushMock }) }))

import ActivityChangesView from '../ActivityChangesView.vue'

// el-table stub 同時渲染 #empty 與第一欄的 #default（用第一筆資料），
// 讓空狀態與學生姓名連結都測得到
const STUBS = {
  'el-button': { template: '<button><slot /></button>' },
  'el-table': {
    props: ['data'],
    template: '<div><div v-if="!data.length" class="empty"><slot name="empty" /></div><slot v-else /></div>',
  },
  'el-table-column': {
    props: ['label'],
    template: '<div v-if="label === \'學生姓名\'" class="name-cell"><slot :row="$parent.$props.data[0]" /></div>',
  },
  'el-tag': { template: '<span><slot /></span>' },
  'el-pagination': { template: '<div />' },
  'el-input': { template: '<input />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { template: '<div />' },
  'el-date-picker': { template: '<div />' },
  PageHeader: { template: '<div><slot name="actions" /></div>' },
}

function mountView() {
  return mount(ActivityChangesView, { global: { stubs: STUBS, directives: { loading: () => {} } } })
}

describe('ActivityChangesView 空狀態與連結', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getChangesMetaMock.mockResolvedValue({ data: { change_types: [] } })
  })

  it('載入失敗 → 顯示「載入失敗」與重試，而不是「還沒有異動」', async () => {
    getChangesMock.mockRejectedValueOnce(new Error('boom'))
    const wrapper = mountView()
    await flushPromises()
    const text = wrapper.find('.empty').text()
    expect(text).toContain('異動紀錄載入失敗')
    expect(text).not.toContain('目前還沒有報名異動')

    getChangesMock.mockResolvedValueOnce({ data: { items: [], total: 0 } })
    await wrapper.find('.empty button').trigger('click')
    await flushPromises()
    expect(getChangesMock).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.empty').text()).toContain('目前還沒有報名異動')
  })

  it('有篩選條件但查無資料 → 提示清除條件', async () => {
    getChangesMock.mockResolvedValue({ data: { items: [], total: 0 } })
    const wrapper = mountView()
    await flushPromises()
    ;(wrapper.vm as unknown as { filters: { studentName: string } }).filters.studentName = '王'
    await flushPromises()
    expect(wrapper.find('.empty').text()).toContain('沒有符合條件的異動紀錄')
  })

  it('點學生姓名 → 導到報名管理並帶 ?open=<registration_id>', async () => {
    getChangesMock.mockResolvedValue({
      data: {
        items: [{ id: 1, student_name: '陳小明', change_type: '退課', description: 'x', registration_id: 42 }],
        total: 1,
      },
    })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.find('.name-cell button').trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ path: '/activity/registrations', query: { open: '42' } })
  })

  it('報名已不存在（registration_id 為空）→ 姓名不是連結', async () => {
    getChangesMock.mockResolvedValue({
      data: { items: [{ id: 1, student_name: '陳小明', change_type: '刪除報名', description: 'x', registration_id: null }], total: 1 },
    })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('.name-cell button').exists()).toBe(false)
    expect(wrapper.find('.name-cell').text()).toContain('陳小明')
  })
})
