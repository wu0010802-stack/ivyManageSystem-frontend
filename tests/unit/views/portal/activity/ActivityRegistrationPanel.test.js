import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ActivityRegistrationPanel from '@/views/portal/components/activity/ActivityRegistrationPanel.vue'

// Mock dependencies
vi.mock('@/constants/activity', () => ({
  COURSE_STATUS_TAG_TYPE: {
    enrolled: 'success',
    waitlist: 'warning',
    promoted_pending: 'warning',
    pending_review: 'warning',
    pending_review_waitlist: 'info',
  },
  COURSE_STATUS_LABEL: {
    enrolled: '正式',
    waitlist: '候補',
    promoted_pending: '待家長確認',
    pending_review: '待審核',
    pending_review_waitlist: '待審核候補',
  },
}))
vi.mock('@/utils/format', () => ({
  formatActivityDate: (d) => d,
}))

const vLoading = { mounted() {}, updated() {} }

const DATA = {
  summary: { total_registrations: 30, total_enrolled: 25, total_waitlist: 3, total_paid: 20 },
  registrations: [
    {
      id: 1,
      student_name: '小明',
      class_name: '小白兔',
      courses: [{ course_name: '畫畫', status: 'enrolled', waitlist_position: null }],
      is_paid: true,
      created_at: '2026-05-01',
    },
    {
      id: 2,
      student_name: '小華',
      class_name: '小綠葉',
      courses: [{ course_name: '音樂', status: 'waitlist', waitlist_position: 1 }],
      is_paid: false,
      created_at: '2026-05-02',
    },
  ],
  classrooms: ['小白兔', '小綠葉'],
}

const STUBS = {
  ElRow: { template: '<div class="el-row"><slot /></div>' },
  ElCol: { template: '<div class="el-col"><slot /></div>' },
  ElCard: {
    template: '<div class="el-card"><slot /></div>',
    props: ['shadow'],
    name: 'ElCard',
  },
  ElTabs: {
    template: '<div class="el-tabs" :data-value="modelValue"><slot /></div>',
    props: ['modelValue'],
    emits: ['update:modelValue'],
    name: 'ElTabs',
  },
  ElTabPane: {
    template: '<div class="el-tab-pane" :data-name="name">{{ label }}</div>',
    props: ['label', 'name'],
  },
  ElTable: {
    template: '<table class="el-table"><slot /></table>',
    props: ['data', 'border', 'stripe', 'loading'],
    name: 'ElTable',
  },
  ElTableColumn: {
    template: '<td></td>',
    props: ['prop', 'label', 'width', 'minWidth', 'align'],
  },
  ElTag: {
    template: '<span class="el-tag" :data-type="type"><slot /></span>',
    props: ['type', 'size'],
  },
}

const GLOBAL = { stubs: STUBS, directives: { loading: vLoading } }

describe('ActivityRegistrationPanel', () => {
  it('renders empty (no root element) when data=null', () => {
    const w = mount(ActivityRegistrationPanel, {
      props: { data: null, activeClass: null },
      global: GLOBAL,
    })
    expect(w.find('.registration-panel').exists()).toBe(false)
  })

  it('renders 4 summary cards with correct values', () => {
    const w = mount(ActivityRegistrationPanel, {
      props: { data: DATA, activeClass: null },
      global: GLOBAL,
    })
    const cards = w.findAll('.el-card')
    expect(cards.length).toBe(4)
    expect(w.text()).toContain('30')  // total_registrations
    expect(w.text()).toContain('25')  // total_enrolled
    expect(w.text()).toContain('3')   // total_waitlist
    expect(w.text()).toContain('20')  // total_paid
  })

  it('shows classroom tabs when 2+ classrooms', () => {
    const w = mount(ActivityRegistrationPanel, {
      props: { data: DATA, activeClass: null },
      global: GLOBAL,
    })
    expect(w.findComponent({ name: 'ElTabs' }).exists()).toBe(true)
    expect(w.findAll('.el-tab-pane').length).toBe(2)
  })

  it('hides classroom tabs when only 1 classroom', () => {
    const data1 = { ...DATA, classrooms: ['小白兔'] }
    const w = mount(ActivityRegistrationPanel, {
      props: { data: data1, activeClass: null },
      global: GLOBAL,
    })
    expect(w.findComponent({ name: 'ElTabs' }).exists()).toBe(false)
  })

  it('emits update:activeClass when tab changes', async () => {
    const w = mount(ActivityRegistrationPanel, {
      props: { data: DATA, activeClass: null },
      global: GLOBAL,
    })
    await w.findComponent({ name: 'ElTabs' }).vm.$emit('update:modelValue', '小白兔')
    expect(w.emitted('update:activeClass')[0]).toEqual(['小白兔'])
  })

  it('passes filtered registrations to table when activeClass set', () => {
    const w = mount(ActivityRegistrationPanel, {
      props: { data: DATA, activeClass: '小白兔' },
      global: GLOBAL,
    })
    const table = w.findComponent({ name: 'ElTable' })
    expect(table.props('data').length).toBe(1)
    expect(table.props('data')[0].class_name).toBe('小白兔')
  })

  it.each([
    ['enrolled', '正式'],
    ['waitlist', '候補'],
    ['promoted_pending', '待家長確認'],
    ['pending_review', '待審核'],
    ['pending_review_waitlist', '待審核候補'],
  ])('課程狀態 %s 顯示可辨識文字「%s」', (status, label) => {
    const data = {
      ...DATA,
      registrations: [{
        ...DATA.registrations[0],
        courses: [{
          course_name: '畫畫',
          status,
          waitlist_position: status === 'waitlist' ? 2 : null,
        }],
      }],
    }
    const w = mount(ActivityRegistrationPanel, {
      props: { data, activeClass: null },
      global: GLOBAL,
    })

    expect(w.vm.courseStatusLabel(status)).toBe(label)
  })
})
