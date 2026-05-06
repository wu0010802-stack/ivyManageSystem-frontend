import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ScheduleCalendarGrid from '@/views/portal/components/schedule/ScheduleCalendarGrid.vue'

// Stubs for ElButton and ElTag
// 不把 class 宣告為 prop，讓 inheritAttrs 自動套到 root element
const globalStubs = {
  ElButton: {
    template: '<button v-bind="$attrs" @click.stop="$emit(\'click\')"><slot /></button>',
    inheritAttrs: true,
    props: ['size', 'type', 'link'],
    emits: ['click'],
  },
  ElTag: {
    template: '<span class="el-tag"><slot /></span>',
    props: ['size', 'type', 'effect'],
  },
}

const TODAY_DATE = '2026-05-04'
const isToday = (day) => !!day && day.date === TODAY_DATE
const isFutureDate = (dateStr) => dateStr >= '2026-05-04'

// 兩週測試資料（使用實際欄位：shift_name、work_start/end、is_override、is_weekend）
const WEEKS = [
  // 第一週：5 個 null + 5/1(有班) + 5/2(週末)
  [
    null, null, null, null, null,
    {
      day: 1,
      date: '2026-05-01',
      shift_name: '正班',
      work_start: '08:00',
      work_end: '17:00',
      is_weekend: false,
      is_override: false,
    },
    {
      day: 2,
      date: '2026-05-02',
      shift_name: null,
      work_start: null,
      work_end: null,
      is_weekend: true,
      is_override: false,
    },
  ],
  // 第二週：5/3(休) + 5/4(today+有班) + 5/5(調班) + 5/6~5/9
  [
    {
      day: 3,
      date: '2026-05-03',
      shift_name: null,
      work_start: null,
      work_end: null,
      is_weekend: true,
      is_override: false,
    },
    {
      day: 4,
      date: '2026-05-04',
      shift_name: '早班',
      work_start: '07:30',
      work_end: '16:30',
      is_weekend: false,
      is_override: false,
    },
    {
      day: 5,
      date: '2026-05-05',
      shift_name: '晚班',
      work_start: '13:00',
      work_end: '22:00',
      is_weekend: false,
      is_override: true,
    },
    {
      day: 6,
      date: '2026-05-06',
      shift_name: '正班',
      work_start: '08:00',
      work_end: '17:00',
      is_weekend: false,
      is_override: false,
    },
    {
      day: 7,
      date: '2026-05-07',
      shift_name: '正班',
      work_start: '08:00',
      work_end: '17:00',
      is_weekend: false,
      is_override: false,
    },
    {
      day: 8,
      date: '2026-05-08',
      shift_name: '正班',
      work_start: '08:00',
      work_end: '17:00',
      is_weekend: false,
      is_override: false,
    },
    {
      day: 9,
      date: '2026-05-09',
      shift_name: null,
      work_start: null,
      work_end: null,
      is_weekend: true,
      is_override: false,
    },
  ],
]

describe('ScheduleCalendarGrid', () => {
  it('renders 7 weekday headers', () => {
    const w = mount(ScheduleCalendarGrid, {
      props: { weeks: WEEKS, isToday, isFutureDate },
      global: { stubs: globalStubs },
    })
    expect(w.findAll('.calendar-header-cell').length).toBe(7)
  })

  it('renders 14 cells (2 weeks × 7)', () => {
    const w = mount(ScheduleCalendarGrid, {
      props: { weeks: WEEKS, isToday, isFutureDate },
      global: { stubs: globalStubs },
    })
    expect(w.findAll('.calendar-cell').length).toBe(14)
  })

  it('marks today cell with is-today class', () => {
    const w = mount(ScheduleCalendarGrid, {
      props: { weeks: WEEKS, isToday, isFutureDate },
      global: { stubs: globalStubs },
    })
    const todayCells = w.findAll('.is-today')
    expect(todayCells.length).toBe(1)
    expect(todayCells[0].text()).toContain('4')
  })

  it('marks weekend cells with is-weekend class', () => {
    const w = mount(ScheduleCalendarGrid, {
      props: { weeks: WEEKS, isToday, isFutureDate },
      global: { stubs: globalStubs },
    })
    // 5/2, 5/3, 5/9 is_weekend=true
    expect(w.findAll('.is-weekend').length).toBe(3)
  })

  it('marks null cells with is-empty class', () => {
    const w = mount(ScheduleCalendarGrid, {
      props: { weeks: WEEKS, isToday, isFutureDate },
      global: { stubs: globalStubs },
    })
    expect(w.findAll('.is-empty').length).toBe(5)
  })

  it('renders shift name in cell', () => {
    const w = mount(ScheduleCalendarGrid, {
      props: { weeks: WEEKS, isToday, isFutureDate },
      global: { stubs: globalStubs },
    })
    expect(w.text()).toContain('正班')
    expect(w.text()).toContain('早班')
  })

  it('renders work_start ~ work_end time', () => {
    const w = mount(ScheduleCalendarGrid, {
      props: { weeks: WEEKS, isToday, isFutureDate },
      global: { stubs: globalStubs },
    })
    expect(w.text()).toContain('08:00~17:00')
    expect(w.text()).toContain('07:30~16:30')
  })

  it('renders 調班 tag for is_override cell', () => {
    const w = mount(ScheduleCalendarGrid, {
      props: { weeks: WEEKS, isToday, isFutureDate },
      global: { stubs: globalStubs },
    })
    const overrideTags = w.findAll('.el-tag')
    expect(overrideTags.length).toBeGreaterThan(0)
    expect(overrideTags.some(el => el.text() === '調班')).toBe(true)
  })

  it('shows swap button on desktop for eligible days', () => {
    const w = mount(ScheduleCalendarGrid, {
      props: { weeks: WEEKS, isToday, isFutureDate, isMobile: false },
      global: { stubs: globalStubs },
    })
    // shift_name 非 null + isFutureDate + !is_weekend：5/4, 5/5, 5/6, 5/7, 5/8
    const swapBtns = w.findAll('.cell-swap-btn')
    expect(swapBtns.length).toBeGreaterThan(0)
  })

  it('does not emit cell-click for empty null cells', async () => {
    const w = mount(ScheduleCalendarGrid, {
      props: { weeks: WEEKS, isToday, isFutureDate },
      global: { stubs: globalStubs },
    })
    // 第一個 cell 是 null（is-empty）
    const cells = w.findAll('.calendar-cell')
    await cells[0].trigger('click')
    expect(w.emitted('cell-click')).toBeFalsy()
  })

  it('emits cell-click with day object when non-empty cell is clicked', async () => {
    const w = mount(ScheduleCalendarGrid, {
      props: { weeks: WEEKS, isToday, isFutureDate },
      global: { stubs: globalStubs },
    })
    // cell index 5 = 5/1
    const cells = w.findAll('.calendar-cell')
    await cells[5].trigger('click')
    expect(w.emitted('cell-click')).toHaveLength(1)
    expect(w.emitted('cell-click')[0][0]).toEqual(expect.objectContaining({ day: 1, date: '2026-05-01' }))
  })

  it('emits swap-click when 換班 button is clicked', async () => {
    const w = mount(ScheduleCalendarGrid, {
      props: { weeks: WEEKS, isToday, isFutureDate, isMobile: false },
      global: { stubs: globalStubs },
    })
    const swapBtns = w.findAll('.cell-swap-btn')
    await swapBtns[0].trigger('click')
    expect(w.emitted('swap-click')).toHaveLength(1)
  })

  it('swap-click does not also fire cell-click (stop propagation)', async () => {
    const w = mount(ScheduleCalendarGrid, {
      props: { weeks: WEEKS, isToday, isFutureDate, isMobile: false },
      global: { stubs: globalStubs },
    })
    const swapBtns = w.findAll('.cell-swap-btn')
    await swapBtns[0].trigger('click')
    // cell-click should not be emitted when swap button is clicked (stop propagation)
    expect(w.emitted('cell-click')).toBeFalsy()
  })

  it('adds is-tappable class when isMobile=true and day is non-null', () => {
    const w = mount(ScheduleCalendarGrid, {
      props: { weeks: WEEKS, isToday, isFutureDate, isMobile: true },
      global: { stubs: globalStubs },
    })
    // Non-empty cells should have is-tappable
    const tappable = w.findAll('.is-tappable')
    expect(tappable.length).toBeGreaterThan(0)
    // Empty cells should NOT have is-tappable
    tappable.forEach(cell => {
      expect(cell.classes()).not.toContain('is-empty')
    })
  })
})
