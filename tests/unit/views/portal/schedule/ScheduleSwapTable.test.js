import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ScheduleSwapTable from '@/views/portal/components/schedule/ScheduleSwapTable.vue'

const RECEIVED = [
  {
    id: 1,
    swap_date: '2026-05-10',
    requester_name: '王老師',
    requester_shift: '早班',
    target_shift: '正班',
    reason: '私事',
    status: 'pending',
    is_mine: false,
  },
  {
    id: 2,
    swap_date: '2026-05-12',
    requester_name: '李老師',
    requester_shift: '正班',
    target_shift: '早班',
    reason: '看醫生',
    status: 'accepted',
    is_mine: false,
  },
]

const SENT = [
  {
    id: 10,
    swap_date: '2026-05-15',
    target_name: '張老師',
    requester_shift: '早班',
    target_shift: '正班',
    reason: '出差',
    status: 'pending',
    is_mine: true,
  },
  {
    id: 11,
    swap_date: '2026-05-18',
    target_name: '陳老師',
    requester_shift: '正班',
    target_shift: '早班',
    reason: '休假',
    status: 'rejected',
    is_mine: true,
  },
]

const STUBS = {
  ElTabs: {
    template: '<div><slot /></div>',
    props: ['modelValue'],
  },
  ElTabPane: {
    template: '<div :data-label="label" :data-name="name"><slot /></div>',
    props: ['label', 'name'],
  },
  ElTable: {
    template: '<table><slot /></table>',
    props: ['data', 'loading', 'emptyText'],
  },
  ElTableColumn: {
    // Render default slot for every row in the parent ElTable's data prop
    // We inject tableData via a renderless trick: just expose the slot once with a sample row
    template: '<td><slot :row="sampleRow" /></td>',
    props: ['prop', 'label', 'width', 'minWidth', 'fixed', 'showOverflowTooltip'],
    data() {
      return { sampleRow: {} }
    },
  },
  ElButton: {
    template: '<button :data-type="type" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
    props: ['size', 'type', 'disabled'],
    emits: ['click'],
  },
  ElTag: {
    template: '<span :data-tag-type="type"><slot /></span>',
    props: ['type', 'size'],
  },
}

describe('ScheduleSwapTable', () => {
  it('renders two tab panes with correct counts', () => {
    const w = mount(ScheduleSwapTable, {
      props: { receivedRequests: RECEIVED, sentRequests: SENT, loading: false },
      global: { stubs: STUBS },
    })
    const panes = w.findAll('[data-label]')
    expect(panes.length).toBe(2)
    expect(panes[0].attributes('data-label')).toContain('收到的申請')
    expect(panes[0].attributes('data-label')).toContain('2')
    expect(panes[1].attributes('data-label')).toContain('我發起的')
    expect(panes[1].attributes('data-label')).toContain('2')
  })

  it('passes receivedRequests to first ElTable and sentRequests to second', () => {
    const w = mount(ScheduleSwapTable, {
      props: { receivedRequests: RECEIVED, sentRequests: SENT, loading: false },
      global: { stubs: STUBS },
    })
    // Both tab panes are rendered by the stub; find all <table> elements
    const tables = w.findAll('table')
    expect(tables.length).toBe(2)
    // Confirm labels contain expected counts
    const panes = w.findAll('[data-label]')
    expect(panes[0].attributes('data-label')).toContain('2')
    expect(panes[1].attributes('data-label')).toContain('2')
  })

  it('renders without errors for empty arrays', () => {
    const w = mount(ScheduleSwapTable, {
      props: { receivedRequests: [], sentRequests: [], loading: false },
      global: { stubs: STUBS },
    })
    const panes = w.findAll('[data-label]')
    expect(panes[0].attributes('data-label')).toContain('0')
    expect(panes[1].attributes('data-label')).toContain('0')
  })

  it('emits respond with accept when accept button clicked', async () => {
    // Mount with a single-row override to test emit
    const singleReceived = [{ ...RECEIVED[0] }]
    const STUBS_WITH_ROW = {
      ...STUBS,
      ElTableColumn: {
        template: '<td><slot :row="sampleRow" /></td>',
        props: ['prop', 'label', 'width', 'minWidth', 'fixed', 'showOverflowTooltip'],
        data() {
          return { sampleRow: singleReceived[0] }
        },
      },
    }
    const w = mount(ScheduleSwapTable, {
      props: { receivedRequests: singleReceived, sentRequests: [], loading: false },
      global: { stubs: STUBS_WITH_ROW },
    })
    const acceptBtn = w.findAll('button').find((b) => b.text() === '接受')
    await acceptBtn.trigger('click')
    expect(w.emitted('respond')).toBeDefined()
    expect(w.emitted('respond')[0]).toEqual([1, 'accept'])
  })

  it('emits respond with reject when reject button clicked', async () => {
    const singleReceived = [{ ...RECEIVED[0] }]
    const STUBS_WITH_ROW = {
      ...STUBS,
      ElTableColumn: {
        template: '<td><slot :row="sampleRow" /></td>',
        props: ['prop', 'label', 'width', 'minWidth', 'fixed', 'showOverflowTooltip'],
        data() {
          return { sampleRow: singleReceived[0] }
        },
      },
    }
    const w = mount(ScheduleSwapTable, {
      props: { receivedRequests: singleReceived, sentRequests: [], loading: false },
      global: { stubs: STUBS_WITH_ROW },
    })
    const rejectBtn = w.findAll('button').find((b) => b.text() === '拒絕')
    await rejectBtn.trigger('click')
    expect(w.emitted('respond')[0]).toEqual([1, 'reject'])
  })

  it('emits cancel when 撤銷 button clicked on pending sent request', async () => {
    const pendingSent = [{ ...SENT[0] }]
    const STUBS_WITH_ROW = {
      ...STUBS,
      ElTableColumn: {
        template: '<td><slot :row="sampleRow" /></td>',
        props: ['prop', 'label', 'width', 'minWidth', 'fixed', 'showOverflowTooltip'],
        data() {
          return { sampleRow: pendingSent[0] }
        },
      },
    }
    const w = mount(ScheduleSwapTable, {
      props: { receivedRequests: [], sentRequests: pendingSent, loading: false },
      global: { stubs: STUBS_WITH_ROW },
    })
    const cancelBtn = w.findAll('button').find((b) => b.text() === '撤銷')
    await cancelBtn.trigger('click')
    expect(w.emitted('cancel')).toBeDefined()
    expect(w.emitted('cancel')[0]).toEqual([10])
  })

  it('does not show action buttons for non-pending received requests', () => {
    const acceptedReceived = [{ ...RECEIVED[1] }] // status: accepted
    const STUBS_WITH_ROW = {
      ...STUBS,
      ElTableColumn: {
        template: '<td><slot :row="sampleRow" /></td>',
        props: ['prop', 'label', 'width', 'minWidth', 'fixed', 'showOverflowTooltip'],
        data() {
          return { sampleRow: acceptedReceived[0] }
        },
      },
    }
    const w = mount(ScheduleSwapTable, {
      props: { receivedRequests: acceptedReceived, sentRequests: [], loading: false },
      global: { stubs: STUBS_WITH_ROW },
    })
    const acceptBtn = w.findAll('button').find((b) => b.text() === '接受')
    const rejectBtn = w.findAll('button').find((b) => b.text() === '拒絕')
    expect(acceptBtn).toBeUndefined()
    expect(rejectBtn).toBeUndefined()
    expect(w.text()).toContain('--')
  })

  it('handles loading prop without error', () => {
    const w = mount(ScheduleSwapTable, {
      props: { receivedRequests: RECEIVED, sentRequests: SENT, loading: true },
      global: { stubs: STUBS },
    })
    expect(() => w).not.toThrow()
  })
})
