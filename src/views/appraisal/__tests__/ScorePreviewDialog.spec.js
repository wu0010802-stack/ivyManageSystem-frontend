import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

import ScorePreviewDialog from '@/views/appraisal/components/ScorePreviewDialog.vue'

vi.mock('@/api/appraisal', () => ({ previewAppraisalScore: vi.fn(), syncAppraisalScoreItems: vi.fn() }))
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
  ElSwitch: {
    props: ['modelValue', 'activeText'],
    emits: ['update:modelValue'],
    template:
      '<label class="el-switch">' +
      '<input type="checkbox" :checked="modelValue" ' +
      '@change="$emit(\'update:modelValue\', $event.target.checked)" />' +
      '{{ activeText }}</label>',
  },
  ElRadioGroup: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<div class="el-radio-group"><slot /></div>',
  },
  ElRadioButton: {
    props: ['label'],
    template: '<button class="el-radio-button"><slot /></button>',
  },
  ElTooltip: {
    template: '<span class="el-tooltip"><slot /></span>',
  },
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

  // 多參與者 fixture：用於合計、排序、過濾
  const multiParticipantsFixture = {
    cycle_id: 10,
    on_date: '2026-01-01',
    participants: [
      {
        participant_id: 1,
        employee_name: 'Alice',
        items: [
          { item_code: 'LATE_EARLY', delta: '0.5', current_db_value: '0.5', raw_value: 2, note: '' },
          { item_code: 'LEAVE', delta: '0.5', current_db_value: '0.5', raw_value: 1, note: '' },
        ],
      },
      {
        participant_id: 2,
        employee_name: 'Bob',
        items: [
          { item_code: 'LATE_EARLY', delta: '-2.0', current_db_value: '-1.0', raw_value: 8, note: '異常多' },
        ],
      },
      {
        participant_id: 3,
        employee_name: 'Charlie',
        items: [
          { item_code: 'OTHER', delta: '-0.5', current_db_value: '-0.5', raw_value: 1, note: '' },
        ],
      },
    ],
  }

  it('renders 合計 column with sum of all deltas per participant', async () => {
    api.previewAppraisalScore.mockResolvedValueOnce({ data: multiParticipantsFixture })
    const wrapper = mount(ScorePreviewDialog, mountOpts())
    await flushPromises()
    await nextTick()
    expect(wrapper.find('[data-test="total-1"]').text()).toBe('1')
    expect(wrapper.find('[data-test="total-2"]').text()).toBe('-2')
    expect(wrapper.find('[data-test="total-3"]').text()).toBe('-0.5')
  })

  it('default-sorts participants by abs(total) descending', async () => {
    api.previewAppraisalScore.mockResolvedValueOnce({ data: multiParticipantsFixture })
    const wrapper = mount(ScorePreviewDialog, mountOpts())
    await flushPromises()
    await nextTick()
    const totals = wrapper.findAll('[data-test^="total-"]')
    const ids = totals.map((el) => el.attributes('data-test').replace('total-', ''))
    // Bob(|-2|=2) > Alice(|1|=1) > Charlie(|-0.5|=0.5)
    expect(ids).toEqual(['2', '1', '3'])
  })

  it('「只看有變動」filters out participants without any diff', async () => {
    api.previewAppraisalScore.mockResolvedValueOnce({ data: multiParticipantsFixture })
    const wrapper = mount(ScorePreviewDialog, mountOpts())
    await flushPromises()
    await nextTick()
    // 預設 3 人都顯示
    expect(wrapper.findAll('[data-test^="total-"]').length).toBe(3)
    // 打開過濾
    await wrapper.find('[class~="el-switch"] input').setValue(true)
    await nextTick()
    // 只剩 Bob（current_db=-1.0 vs delta=-2.0 → hasDiff）
    const totals = wrapper.findAll('[data-test^="total-"]')
    expect(totals.length).toBe(1)
    expect(totals[0].attributes('data-test')).toBe('total-2')
  })
})
