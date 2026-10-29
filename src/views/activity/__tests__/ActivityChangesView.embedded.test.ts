import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getChangesMock = vi.hoisted(() => vi.fn())
const getChangesMetaMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/activity', () => ({
  getChanges: getChangesMock,
  getChangesMeta: getChangesMetaMock,
}))
vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn() } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import ActivityChangesView from '../ActivityChangesView.vue'

// 後台 IA 重整 M4：異動紀錄以頁籤嵌入報名管理時，頁首標題由 hub 提供，這裡只留說明＋重新整理
const STUBS = {
  'el-button': { template: '<button><slot /></button>' },
  'el-table': { template: '<div />' },
  'el-table-column': { template: '<div />' },
  'el-pagination': { template: '<div />' },
  'el-input': { template: '<input />' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { template: '<div />' },
  'el-date-picker': { template: '<div />' },
  PageHeader: { props: ['title'], template: '<h2 data-test="own-header">{{ title }}</h2>' },
}

const mountView = (props: { embedded?: boolean } = {}) =>
  mount(ActivityChangesView, {
    props,
    global: { stubs: STUBS, directives: { loading: () => {} } },
  })

describe('ActivityChangesView embedded 模式', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getChangesMock.mockResolvedValue({ data: { items: [], total: 0 } })
    getChangesMetaMock.mockResolvedValue({ data: { change_types: [] } })
  })

  it('embedded：不渲染自己的 PageHeader，改放說明文字與重新整理鈕，且去掉外層 padding class', async () => {
    const w = mountView({ embedded: true })
    await flushPromises()
    expect(w.find('[data-test="own-header"]').exists()).toBe(false)
    expect(w.find('.changes-embedded-bar__hint').text()).toContain('點學生姓名可直接打開那筆報名')
    expect(w.find('.changes-embedded-bar button').text()).toBe('重新整理')
    expect(w.classes()).toContain('activity-changes--embedded')
  })

  it('獨立掛載（預設）：仍有自己的 PageHeader', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="own-header"]').text()).toBe('報名修改紀錄')
    expect(w.find('.changes-embedded-bar').exists()).toBe(false)
  })
})
