import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getPOSUnlockEventsMock = vi.hoisted(() => vi.fn())
vi.mock('@/api/activity', () => ({ getPOSUnlockEvents: getPOSUnlockEventsMock }))
vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn() } }))
vi.mock('@/components/activity/OperatorActivityTab.vue', () => ({
  default: { name: 'OperatorActivityTab', template: '<div data-test="operator-tab" />' },
}))

import POSAuditEventsView from '../POSAuditEventsView.vue'

// 後台 IA 重整 M5：稽核軌跡以頁籤嵌入 POS 簽核頁時，標題由頁籤承擔，這裡不重複 h2
const STUBS = {
  'el-card': { template: '<div class="card"><slot name="header" /><slot /></div>' },
  'el-tabs': { template: '<div><slot /></div>' },
  'el-tab-pane': { props: ['label'], template: '<section :data-label="label"><slot /></section>' },
  'el-select': { template: '<div />' },
  'el-option': { template: '<div />' },
  'el-empty': { template: '<div />' },
  'el-timeline': { template: '<div><slot /></div>' },
  'el-timeline-item': { template: '<div><slot /></div>' },
}

const mountView = (props: { embedded?: boolean } = {}) => mount(POSAuditEventsView, { props, global: { stubs: STUBS } })

describe('POSAuditEventsView embedded 模式', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPOSUnlockEventsMock.mockResolvedValue({ data: { events: [] } })
  })

  it('embedded：不渲染卡片標題，兩個子頁籤（解鎖事件／操作員活動）都在', async () => {
    const w = mountView({ embedded: true })
    await flushPromises()
    expect(w.find('h2.pos-audit__title').exists()).toBe(false)
    expect(w.classes()).toContain('pos-audit--embedded')
    expect(w.findAll('section').map((s) => s.attributes('data-label'))).toEqual(['解鎖事件', '操作員活動'])
  })

  it('獨立掛載（預設）：仍有 POS 異常稽核軌跡標題', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.find('h2.pos-audit__title').text()).toBe('POS 異常稽核軌跡')
  })
})
