import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import CalendarView from '@/views/CalendarView.vue'

// ── API mocks ──────────────────────────────────────────────────────────────
const getCalendarFeed = vi.fn()
const getEvent = vi.fn()
const createEvent = vi.fn()
const updateEvent = vi.fn()
const deleteEvent = vi.fn()

vi.mock('@/api/events', () => ({
  getCalendarFeed: (...a: unknown[]) => getCalendarFeed(...a),
  getEvent: (...a: unknown[]) => getEvent(...a),
  createEvent: (...a: unknown[]) => createEvent(...a),
  updateEvent: (...a: unknown[]) => updateEvent(...a),
  deleteEvent: (...a: unknown[]) => deleteEvent(...a),
}))

const getAdminFeed = vi.fn()
vi.mock('@/api/calendar', () => ({
  getAdminFeed: (...a: unknown[]) => getAdminFeed(...a),
}))

// calimp01：負責人選單改用 employee store——mock 掉避免測試需要 Pinia
const fetchEmployees = vi.fn()
vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({ employees: [], fetchEmployees }),
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
  CalendarImportDialog: true,
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

describe('CalendarView 事件編輯 payload（calimp01 可見範圍/分類/負責人）', () => {
  // calendar-feed 的真實 shape：精簡欄位，**沒有** category/學年/負責人等
  // （reviewer 抓過假綠：feed row 塞了不存在的欄位讓測試測不到資料遺失）
  const FEED_ROW = {
    id: 5,
    title: '主教會議',
    event_date: '2026-07-10',
    end_date: null,
    event_type: 'meeting',
    description: null,
    location: null,
    is_all_day: true,
    start_time: null,
    end_time: null,
    is_official: false,
    is_read_only: false,
    official_kind: null,
    visibility: 'staff',
  }
  // GET /events/{id}（EventOut）才有完整欄位——編輯表單必須從這裡回填
  const EVENT_DETAIL = {
    ...FEED_ROW,
    event_type_label: '會議',
    recurrence_rule: null,
    category: 'teaching',
    academic_year: 115,
    semester: 'first',
    week_no: 3,
    owner_employee_id: 9,
    owner_employee_name: '王老師',
    source: 'branch_calendar_import',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    getCalendarFeed.mockResolvedValue({
      data: { events: [FEED_ROW], official_sync: null },
    })
    getEvent.mockResolvedValue({ data: EVENT_DETAIL })
    getAdminFeed.mockResolvedValue({ data: { from: '', to: '', items: [] } })
    updateEvent.mockResolvedValue({ data: {} })
  })

  it('編輯前先抓單筆完整資料；只改標題存檔時不清空匯入欄位', async () => {
    const wrapper = mountCalendarView()
    await flushPromises()
    await wrapper.findComponent(CalendarBoardStub).vm.$emit('dates-set', JULY_2026_DATES_SET)
    await flushPromises()

    // 從月曆點擊事件 → 開啟編輯表單（必須先 GET /events/{id}）
    await wrapper.findComponent(CalendarBoardStub).vm.$emit('event-click', {
      event: { extendedProps: { layer: 'event', rawId: 5, link: null } },
    })
    await flushPromises()
    expect(getEvent).toHaveBeenCalledWith(5)

    const saveBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('儲存'))
    expect(saveBtn).toBeTruthy()
    await saveBtn!.trigger('click')
    await flushPromises()

    // el-button stub 的 click 會 native fallthrough + $emit 雙重觸發，
    // 只驗 payload 內容不驗次數
    expect(updateEvent).toHaveBeenCalled()
    const [id, payload] = updateEvent.mock.calls[0] as [number, Record<string, unknown>]
    expect(id).toBe(5)
    // 資料保全：payload 必須帶回 detail 的原值，而不是被打回預設值
    expect(payload.visibility).toBe('staff')
    expect(payload.category).toBe('teaching')
    expect(payload.academic_year).toBe(115)
    expect(payload.semester).toBe('first')
    expect(payload.week_no).toBe(3)
    expect(payload.owner_employee_id).toBe(9)
    // 表單未管理簽閱欄位——update 絕不可送出，否則覆寫既有設定
    expect('requires_acknowledgment' in payload).toBe(false)
  })

  it('detail 載入失敗時不開編輯表單、不發 update（避免用殘缺資料覆寫）', async () => {
    getEvent.mockRejectedValueOnce(new Error('boom'))
    const wrapper = mountCalendarView()
    await flushPromises()
    await wrapper.findComponent(CalendarBoardStub).vm.$emit('dates-set', JULY_2026_DATES_SET)
    await flushPromises()

    await wrapper.findComponent(CalendarBoardStub).vm.$emit('event-click', {
      event: { extendedProps: { layer: 'event', rawId: 5, link: null } },
    })
    await flushPromises()

    const saveBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('儲存'))
    await saveBtn!.trigger('click')
    await flushPromises()
    // 表單沒被回填（title 空）→ saveEvent 走「請填寫標題與日期」的早退路徑
    expect(updateEvent).not.toHaveBeenCalled()
  })
})
