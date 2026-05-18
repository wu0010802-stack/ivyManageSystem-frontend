import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { defineComponent, h } from 'vue'

import SummaryLogDrawer from '@/views/appraisal/components/SummaryLogDrawer.vue'

vi.mock('@/api/appraisal', () => ({
  getSummaryLogs: vi.fn(),
}))
vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn() },
}))

import * as api from '@/api/appraisal'

const ElDrawerStub = defineComponent({
  props: ['modelValue', 'title', 'size'],
  setup(props, { slots }) {
    return () => props.modelValue
      ? h('div', { 'data-test': 'summary-log-drawer' }, slots.default?.())
      : null
  },
})
const ElTimelineStub = defineComponent({
  setup(_, { slots }) { return () => h('div', { class: 'el-timeline' }, slots.default?.()) }
})
const ElTimelineItemStub = defineComponent({
  props: ['timestamp', 'type'],
  setup(props, { slots, attrs }) {
    return () => h('div', { class: 'el-timeline-item', ...attrs }, slots.default?.())
  },
})
const ElTagStub = defineComponent({ setup(_, { slots }) { return () => h('span', slots.default?.()) }})
const ElEmptyStub = defineComponent({
  props: ['description'],
  setup(props) { return () => h('div', { class: 'el-empty' }, props.description) }
})

const stubs = {
  ElDrawer: ElDrawerStub,
  ElTimeline: ElTimelineStub,
  ElTimelineItem: ElTimelineItemStub,
  ElTag: ElTagStub,
  ElEmpty: ElEmptyStub,
}

const mountOpts = (props = {}) => ({
  props: { visible: true, summaryId: 7, ...props },
  global: { stubs, directives: { loading: () => {} } },
})

describe('SummaryLogDrawer', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('loads on visible=true and renders timeline items', async () => {
    api.getSummaryLogs.mockResolvedValueOnce({ data: [
      { id: 1, action: 'SIGN_SUPERVISOR', from_status: 'DRAFT', to_status: 'SUPERVISOR_SIGNED',
        actor_id: 100, actor_name: '李主管', created_at: '2026-05-17T10:00:00Z' },
      { id: 2, action: 'REJECT', from_status: 'SUPERVISOR_SIGNED', to_status: 'DRAFT',
        actor_id: 100, reason: '時數錯誤需重核', created_at: '2026-05-17T11:00:00Z' },
    ]})
    const wrapper = mount(SummaryLogDrawer, mountOpts())
    await nextTick(); await nextTick()
    expect(api.getSummaryLogs).toHaveBeenCalledWith(7)
    expect(wrapper.find('[data-test="log-item-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="log-item-2"]').exists()).toBe(true)
  })

  it('shows empty state when no logs', async () => {
    api.getSummaryLogs.mockResolvedValueOnce({ data: [] })
    const wrapper = mount(SummaryLogDrawer, mountOpts())
    await nextTick(); await nextTick()
    expect(wrapper.find('.el-empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('尚無簽核軌跡')
  })

  it('reloads when summaryId changes', async () => {
    api.getSummaryLogs.mockResolvedValueOnce({ data: [] })
    const wrapper = mount(SummaryLogDrawer, mountOpts({ summaryId: 7 }))
    await nextTick()
    expect(api.getSummaryLogs).toHaveBeenCalledTimes(1)
    api.getSummaryLogs.mockResolvedValueOnce({ data: [] })
    await wrapper.setProps({ summaryId: 99 })
    await nextTick()
    expect(api.getSummaryLogs).toHaveBeenCalledTimes(2)
    expect(api.getSummaryLogs).toHaveBeenLastCalledWith(99)
  })

  // P2-FE-3：API reject → ElMessage.error + empty state（沒有 logs 顯示）
  it('shows error toast when API rejects', async () => {
    const { ElMessage } = await import('element-plus')
    api.getSummaryLogs.mockRejectedValueOnce({
      response: { status: 500, data: { detail: 'server error' } },
    })
    const wrapper = mount(SummaryLogDrawer, mountOpts())
    await nextTick(); await nextTick()
    expect(ElMessage.error).toHaveBeenCalled()
    // 沒有 log item
    expect(wrapper.find('[data-test^="log-item-"]').exists()).toBe(false)
  })
})
