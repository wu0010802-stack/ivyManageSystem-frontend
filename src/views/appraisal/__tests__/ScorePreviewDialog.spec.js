import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

import ScorePreviewDialog from '@/views/appraisal/components/ScorePreviewDialog.vue'

vi.mock('@/api/appraisal', () => ({ previewAppraisalScore: vi.fn() }))
vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn() } }))

import * as api from '@/api/appraisal'

// 自製 ElTable / ElTableColumn stubs，類似 CurrentSemesterOverview.spec.js
const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h(
      'div',
      {},
      props.data.map((row, index) =>
        h('div', { key: index }, slots.default ? slots.default({ row }) : []),
      ),
    )
  },
})

// 將 fragment vnode 展平（v-for 會包成 Fragment）
function flattenVnodes(vnodes) {
  const out = []
  for (const v of vnodes || []) {
    if (!v) continue
    if (Array.isArray(v.children) && typeof v.type === 'symbol') {
      // Fragment
      out.push(...flattenVnodes(v.children))
    } else if (v.type) {
      out.push(v)
    }
  }
  return out
}

const ElTableStub = defineComponent({
  name: 'ElTableStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => {
      const children = flattenVnodes(slots.default?.() || [])
      return h(
        'div',
        { class: 'el-table' },
        children.map((vnode, index) =>
          h(vnode.type, { ...vnode.props, data: props.data, key: index }, vnode.children),
        ),
      )
    }
  },
})

const stubs = {
  ElDialog: {
    props: ['modelValue', 'title'],
    template: '<div v-if="modelValue" data-test="score-preview-dialog"><slot /><slot name="footer" /></div>',
  },
  ElAlert: { template: '<div class="el-alert"><slot /></div>' },
  ElTable: ElTableStub,
  ElTableColumn: ElTableColumnStub,
  ElButton: { template: '<button><slot /></button>' },
}

const mountOpts = (props = {}) => ({
  props: { visible: true, cycleId: 10, ...props },
  global: {
    stubs,
    directives: { loading: () => {} },
  },
})

describe('ScorePreviewDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads on visible=true with cycleId', async () => {
    api.previewAppraisalScore.mockResolvedValueOnce({
      data: {
        cycle_id: 10,
        on_date: '2026-01-01',
        participants: [{ participant_id: 1, employee_name: '王', items: [] }],
      },
    })
    mount(ScorePreviewDialog, mountOpts())
    await flushPromises()
    expect(api.previewAppraisalScore).toHaveBeenCalledWith(10)
    expect(api.previewAppraisalScore).toHaveBeenCalledTimes(1)
  })

  it('highlights diff when current_db_value differs from delta', async () => {
    api.previewAppraisalScore.mockResolvedValueOnce({
      data: {
        cycle_id: 10,
        on_date: '2026-01-01',
        participants: [
          {
            participant_id: 1,
            employee_name: '王',
            items: [
              {
                item_code: 'LATE_EARLY',
                delta: '-0.75',
                current_db_value: '-99',
                raw_value: 3,
                note: '',
              },
            ],
          },
        ],
      },
    })
    const wrapper = mount(ScorePreviewDialog, mountOpts())
    await flushPromises()
    await nextTick()
    const span = wrapper.find('[data-test="delta-1-LATE_EARLY"]')
    expect(span.exists()).toBe(true)
    expect(span.classes()).toContain('diff')
    expect(span.text()).toBe('-0.75')
  })

  it('reloads when cycleId changes', async () => {
    api.previewAppraisalScore.mockResolvedValueOnce({
      data: { cycle_id: 10, on_date: '2026-01-01', participants: [] },
    })
    const wrapper = mount(ScorePreviewDialog, mountOpts({ cycleId: 10 }))
    await flushPromises()
    expect(api.previewAppraisalScore).toHaveBeenLastCalledWith(10)

    api.previewAppraisalScore.mockResolvedValueOnce({
      data: { cycle_id: 20, on_date: '2026-01-01', participants: [] },
    })
    await wrapper.setProps({ cycleId: 20 })
    await flushPromises()
    expect(api.previewAppraisalScore).toHaveBeenLastCalledWith(20)
    expect(api.previewAppraisalScore).toHaveBeenCalledTimes(2)
  })

  it('does not load and does not render dialog when visible=false', async () => {
    const wrapper = mount(ScorePreviewDialog, mountOpts({ visible: false }))
    await flushPromises()
    expect(wrapper.find('[data-test="score-preview-dialog"]').exists()).toBe(false)
    expect(api.previewAppraisalScore).not.toHaveBeenCalled()
  })
})
