import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import StudentMonthlyStats from '@/views/portal/components/studentAttendance/StudentMonthlyStats.vue'

vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  CategoryScale: {},
  LinearScale: {},
  BarElement: {},
  Title: {},
  Tooltip: {},
  Legend: {},
}))

vi.mock('vue-chartjs', () => ({
  Bar: { name: 'Bar', template: '<canvas data-test="bar-chart" />', props: ['data', 'options'] },
}))

const DATA = {
  classroom_name: '小太陽班',
  year: 2026,
  month: 5,
  classroom_attendance_rate: 92,
  classroom_record_completion_rate: 85,
  school_days_count: 22,
  students: [
    {
      student_id: 1, student_no: 'A001', name: '小明',
      attendance_rate: 95, school_days: 22,
      出席: 20, 缺席: 1, 病假: 1, 事假: 0, 遲到: 0, 未點名: 0,
      longest_absence_streak: 1, absence_alert: false,
    },
    {
      student_id: 2, student_no: 'A002', name: '小華',
      attendance_rate: 60, school_days: 22,
      出席: 13, 缺席: 5, 病假: 3, 事假: 0, 遲到: 1, 未點名: 0,
      longest_absence_streak: 4, absence_alert: true,
    },
  ],
  alerts: [
    { student_id: 2, name: '小華', longest_absence_streak: 4 },
  ],
}

const STUBS = {
  ElDatePicker: {
    template: '<input type="text" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    name: 'ElDatePicker',
    props: ['modelValue', 'type', 'valueFormat', 'placeholder', 'clearable'],
    emits: ['update:modelValue'],
  },
  ElButton: {
    template: '<button @click="$emit(\'click\')"><slot /></button>',
    name: 'ElButton',
    props: ['size', 'type', 'disabled'],
    emits: ['click'],
  },
  ElCard: {
    template: '<div class="el-card"><div class="el-card__header"><slot name="header" /></div><div class="el-card__body"><slot /></div></div>',
    name: 'ElCard',
    props: ['shadow'],
  },
  ElTag: {
    template: '<span class="el-tag" :data-type="type"><slot /></span>',
    name: 'ElTag',
    props: ['type', 'effect'],
  },
  ElEmpty: {
    template: '<div class="el-empty">{{ description }}</div>',
    name: 'ElEmpty',
    props: ['description', 'imageSize'],
  },
  ElTable: {
    template: '<table class="el-table"><slot /></table>',
    name: 'ElTable',
    props: ['data', 'stripe', 'size', 'border'],
  },
  ElTableColumn: {
    template: '<td class="el-table-column"></td>',
    name: 'ElTableColumn',
    props: ['label', 'width', 'prop', 'align', 'minWidth'],
  },
}

describe('StudentMonthlyStats', () => {
  it('renders empty state when data is null', () => {
    const w = mount(StudentMonthlyStats, {
      props: { data: null, monthPicker: '2026-05', loading: false },
      global: { stubs: STUBS },
    })
    expect(w.text()).toContain('尚未載入')
  })

  it('renders 4 summary cards', () => {
    const w = mount(StudentMonthlyStats, {
      props: { data: DATA, monthPicker: '2026-05', loading: false },
      global: { stubs: STUBS },
    })
    expect(w.findAll('.summary-card').length).toBe(4)
  })

  it('renders correct summary values', () => {
    const w = mount(StudentMonthlyStats, {
      props: { data: DATA, monthPicker: '2026-05', loading: false },
      global: { stubs: STUBS },
    })
    expect(w.text()).toContain('92%')
    expect(w.text()).toContain('85%')
    expect(w.text()).toContain('22 天')
  })

  it('renders bar chart', () => {
    const w = mount(StudentMonthlyStats, {
      props: { data: DATA, monthPicker: '2026-05', loading: false },
      global: { stubs: STUBS },
    })
    expect(w.find('[data-test="bar-chart"]').exists()).toBe(true)
  })

  it('renders alert students in alert section', () => {
    const w = mount(StudentMonthlyStats, {
      props: { data: DATA, monthPicker: '2026-05', loading: false },
      global: { stubs: STUBS },
    })
    expect(w.text()).toContain('異常告警')
    expect(w.text()).toContain('小華')
    expect(w.text()).toContain('連缺')
    expect(w.text()).toContain('4 天')
  })

  it('shows el-empty in alert section when no alerts', () => {
    const dataNoAlerts = { ...DATA, alerts: [] }
    const w = mount(StudentMonthlyStats, {
      props: { data: dataNoAlerts, monthPicker: '2026-05', loading: false },
      global: { stubs: STUBS },
    })
    expect(w.findComponent({ name: 'ElEmpty' }).exists()).toBe(true)
  })

  it('emits update:monthPicker', async () => {
    const w = mount(StudentMonthlyStats, {
      props: { data: DATA, monthPicker: '2026-05', loading: false },
      global: { stubs: STUBS },
    })
    await w.findComponent({ name: 'ElDatePicker' }).vm.$emit('update:modelValue', '2026-04')
    expect(w.emitted('update:monthPicker')[0]).toEqual(['2026-04'])
  })

  it('emits export-csv on button click', async () => {
    const w = mount(StudentMonthlyStats, {
      props: { data: DATA, monthPicker: '2026-05', loading: false },
      global: { stubs: STUBS },
    })
    const btn = w.findAll('button').find((b) => b.text().includes('匯出'))
    await btn.trigger('click')
    expect(w.emitted('export-csv')).toHaveLength(1)
  })

  it('renders classroom name and period in chart header', () => {
    const w = mount(StudentMonthlyStats, {
      props: { data: DATA, monthPicker: '2026-05', loading: false },
      global: { stubs: STUBS },
    })
    expect(w.text()).toContain('小太陽班')
    expect(w.text()).toContain('2026')
    expect(w.text()).toContain('5')
  })
})
