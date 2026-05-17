import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import RuleHistoryDrawer from '@/views/appraisal/components/RuleHistoryDrawer.vue'

vi.mock('@/api/appraisal', () => ({
  getScoringRuleHistory: vi.fn(),
}))

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn() },
}))

import * as api from '@/api/appraisal'

// 沿用 Task 18 stub pattern（簡化的 el-drawer/timeline/empty stubs）
const stubs = {
  ElDrawer: {
    props: ['modelValue', 'title', 'size'],
    template: '<div data-test="rule-history-drawer" v-if="modelValue"><slot /></div>',
  },
  ElTimeline: { template: '<div class="el-timeline"><slot /></div>' },
  ElTimelineItem: {
    props: ['timestamp'],
    template: '<div class="el-timeline-item" :data-timestamp="timestamp"><slot /></div>',
  },
  ElEmpty: {
    props: ['description'],
    template: '<div class="el-empty">{{ description }}</div>',
  },
}

const mountOpts = (props = {}) => ({
  props: { visible: true, itemCode: 'LATE_EARLY', ...props },
  global: { stubs, directives: { loading: () => {} } },
})

describe('RuleHistoryDrawer', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('loads versions on visible=true and renders timeline items', async () => {
    api.getScoringRuleHistory.mockResolvedValueOnce({ data: [
      { id: 1, effective_from: '2026-07-01', rule_type: 'PER_UNIT', rule_config: { per_unit_delta: -0.5 } },
      { id: 2, effective_from: '2026-01-01', rule_type: 'PER_UNIT', rule_config: { per_unit_delta: -0.25 } },
    ]})
    const wrapper = mount(RuleHistoryDrawer, mountOpts())
    await nextTick(); await nextTick()
    expect(api.getScoringRuleHistory).toHaveBeenCalledWith('LATE_EARLY')
    expect(wrapper.find('[data-test="history-item-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="history-item-2"]').exists()).toBe(true)
  })

  it('shows empty state when no versions', async () => {
    api.getScoringRuleHistory.mockResolvedValueOnce({ data: [] })
    const wrapper = mount(RuleHistoryDrawer, mountOpts())
    await nextTick(); await nextTick()
    expect(wrapper.find('.el-empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('尚無歷史版本')
  })

  it('reloads when itemCode changes', async () => {
    api.getScoringRuleHistory.mockResolvedValueOnce({ data: [] })
    const wrapper = mount(RuleHistoryDrawer, mountOpts({ itemCode: 'LATE_EARLY' }))
    await nextTick()
    expect(api.getScoringRuleHistory).toHaveBeenCalledTimes(1)
    api.getScoringRuleHistory.mockResolvedValueOnce({ data: [] })
    await wrapper.setProps({ itemCode: 'MISSING_PUNCH' })
    await nextTick()
    expect(api.getScoringRuleHistory).toHaveBeenCalledTimes(2)
    expect(api.getScoringRuleHistory).toHaveBeenLastCalledWith('MISSING_PUNCH')
  })
})
