import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import CalendarView from '@/views/CalendarView.vue'

// ── API mocks ──────────────────────────────────────────────────────────────
const getCalendarFeed = vi.fn()
const createEvent = vi.fn()
const updateEvent = vi.fn()
const deleteEvent = vi.fn()

vi.mock('@/api/events', () => ({
  getCalendarFeed: (...a: unknown[]) => getCalendarFeed(...a),
  createEvent: (...a: unknown[]) => createEvent(...a),
  updateEvent: (...a: unknown[]) => updateEvent(...a),
  deleteEvent: (...a: unknown[]) => deleteEvent(...a),
}))

const getAdminFeed = vi.fn()
vi.mock('@/api/calendar', () => ({
  getAdminFeed: (...a: unknown[]) => getAdminFeed(...a),
}))

// ── composable mock ────────────────────────────────────────────────────────
const setItems = vi.fn()
vi.mock('@/composables/useCalendarLayers', () => ({
  useCalendarLayers: () => ({
    enabledLayers: ref(new Set<string>()),
    fullCalendarEvents: ref([]),
    setItems,
  }),
}))

// ── router / element-plus / utils mocks ────────────────────────────────────
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

vi.mock('@/utils/download', () => ({ downloadFile: vi.fn() }))

// ── stubs ──────────────────────────────────────────────────────────────────
const CalendarBoardStub = defineComponent({
  name: 'CalendarBoard',
  emits: ['event-click', 'event-drop', 'dates-set'],
  template: '<div class="calendar-board-stub" />',
})

const GLOBAL_STUBS = {
  CalendarBoard: CalendarBoardStub,
  CalendarToolbar: true,
  RecurrenceEditor: true,
  CalendarEventDetailDialog: true,
  'el-card': { template: '<div><slot /></div>' },
  'el-alert': { props: ['title'], template: '<div>{{ title }}</div>' },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-input': { template: '<input />' },
  'el-table': { template: '<div><slot /></div>' },
  'el-table-column': true,
  'el-tag': { template: '<span><slot /></span>' },
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { props: ['label'], template: '<label>{{ label }}<slot /></label>' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-date-picker': { template: '<input />' },
  'el-time-picker': { template: '<input />' },
  'el-switch': { template: '<input type="checkbox" />' },
}

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

function mountCalendarView() {
  return mount(CalendarView, {
    global: {
      directives: { loading: () => {} },
      stubs: GLOBAL_STUBS,
    },
  })
}

// FullCalendar dayGridMonth 檢視 2026 年 7 月的 DatesSetArg：
// 格線第一格是 6/28（週日）、end 為 exclusive 8/9；
// view.currentStart / currentEnd 才是「當前顯示月份」的真正邊界。
const JULY_2026_DATES_SET = {
  start: new Date(2026, 5, 28),
  end: new Date(2026, 7, 9),
  startStr: '2026-06-28',
  endStr: '2026-08-09',
  timeZone: 'local',
  view: {
    type: 'dayGridMonth',
    currentStart: new Date(2026, 6, 1),
    currentEnd: new Date(2026, 7, 1),
  },
}

describe('CalendarView 上下同步（datesSet 月份推導）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCalendarFeed.mockResolvedValue({ data: { events: [], official_sync: null } })
    getAdminFeed.mockResolvedValue({ data: { from: '', to: '', items: [] } })
  })

  it('月檢視格線含前月末尾時，事件列表仍撈「當前顯示月份」的 feed', async () => {
    const wrapper = mountCalendarView()
    await flushPromises()

    await wrapper.findComponent(CalendarBoardStub).vm.$emit('dates-set', JULY_2026_DATES_SET)
    await flushPromises()

    // 顯示的是 7 月 → 下方事件列表必須撈 7 月，而不是格線第一格所在的 6 月
    expect(getCalendarFeed).toHaveBeenCalledWith({ year: 2026, month: 7 })
  })

  it('admin_feed 仍以整個可見格線區間為窗（end 轉 inclusive）', async () => {
    const wrapper = mountCalendarView()
    await flushPromises()

    await wrapper.findComponent(CalendarBoardStub).vm.$emit('dates-set', JULY_2026_DATES_SET)
    await flushPromises()

    expect(getAdminFeed).toHaveBeenCalledWith('2026-06-28', '2026-08-08')
  })
})
