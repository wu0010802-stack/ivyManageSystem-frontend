/**
 * 學校行事曆頁 UI/UX 優化（2026-10-29）：
 * - 頁首只有一個主要動作，匯入／匯出收進選單
 * - 載入失敗（月曆格線、事件列表）顯示錯誤態＋重試，不被當成「這個月沒有事件」
 * - 寫入（新增／編輯／刪除／拖拉）失敗有可見提示，對話框不關
 * - 發布給家長、刪除家長／教師看得到的事件、拖拉家長可見事件，都先確認
 * - ≤768px 事件列表改任務卡片
 * - 送出 payload 與改版前逐字相同（契約）
 *
 * 注意：vitest 下 ElForm.validate() 不可信，本檔不靠真 el-form 驗證失敗的路徑。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import ElementPlus from 'element-plus'
import CalendarView from '@/views/CalendarView.vue'

// ── API / store / composable mocks ─────────────────────────────────────────
const api = vi.hoisted(() => ({
  getCalendarFeed: vi.fn(),
  getEvent: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  getAdminFeed: vi.fn(),
}))
vi.mock('@/api/events', () => ({
  getCalendarFeed: api.getCalendarFeed,
  getEvent: api.getEvent,
  createEvent: api.createEvent,
  updateEvent: api.updateEvent,
  deleteEvent: api.deleteEvent,
}))
vi.mock('@/api/calendar', () => ({ getAdminFeed: api.getAdminFeed }))

const employeeState = vi.hoisted(() => ({
  employees: [] as unknown[],
  error: null as string | null,
  fetchEmployees: vi.fn(),
}))
vi.mock('@/stores/employee', () => ({ useEmployeeStore: () => employeeState }))

const setItems = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useCalendarLayers', () => ({
  useCalendarLayers: () => ({
    enabledLayers: ref(new Set<string>()),
    fullCalendarEvents: ref([]),
    setItems,
  }),
}))

const mobile = vi.hoisted(() => ({ value: false }))
vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: ref(mobile.value), cleanup: () => {} }),
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const download = vi.hoisted(() => ({ downloadFile: vi.fn() }))
vi.mock('@/utils/download', () => download)

const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
const confirm = vi.hoisted(() => vi.fn())
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return { ...actual, ElMessage: msg, ElMessageBox: { confirm } }
})

// ── stubs ──────────────────────────────────────────────────────────────────
const CalendarBoardStub = {
  name: 'CalendarBoard',
  emits: ['event-click', 'event-drop', 'dates-set'],
  template: '<div class="calendar-board-stub" />',
}
const ImportDialogStub = { name: 'CalendarImportDialog', props: ['modelValue'], emits: ['imported'], template: '<i class="import-stub" />' }

const STUBS = {
  CalendarBoard: CalendarBoardStub,
  CalendarToolbar: true,
  CalendarEventDetailDialog: true,
  CalendarImportDialog: ImportDialogStub,
  RecurrenceEditor: true,
  'el-dialog': {
    props: ['modelValue'],
    template: '<div class="el-dialog-host"><div v-if="modelValue" class="el-dialog-stub"><slot /><slot name="footer" /></div></div>',
  },
  'el-dropdown': { name: 'ElDropdown', emits: ['command'], template: '<div class="dd"><slot /><slot name="dropdown" /></div>' },
  'el-dropdown-menu': { template: '<div class="dd-menu"><slot /></div>' },
  'el-dropdown-item': { props: ['command'], template: '<button class="dd-item" :data-command="command"><slot /></button>' },
  // 桌機表格：只驗空狀態／錯誤態（資料列互動在手機卡片版驗）
  'el-table': {
    props: ['data'],
    template: '<div class="table-stub"><div v-if="!data || !data.length" class="table-empty"><slot name="empty" /></div><slot /></div>',
  },
  'el-table-column': true,
  'el-select': { template: '<div class="select-stub"><slot /></div>' },
  'el-option': true,
  'el-date-picker': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input class="dp-stub" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  'el-time-picker': true,
  'el-input-number': true,
}

// ── 測試資料 ───────────────────────────────────────────────────────────────
const feedRow = (over: Record<string, unknown> = {}) => ({
  id: 5,
  title: '主教會議',
  event_date: '2026-07-10',
  end_date: null,
  event_type: 'meeting',
  event_type_label: '會議',
  description: null,
  location: null,
  is_all_day: true,
  start_time: null,
  end_time: null,
  is_official: false,
  is_read_only: false,
  official_kind: null,
  visibility: 'staff',
  ...over,
})
const detail = (over: Record<string, unknown> = {}) => ({
  ...feedRow(),
  recurrence_rule: null,
  category: 'teaching',
  academic_year: 115,
  semester: 'first',
  week_no: 3,
  owner_employee_id: 9,
  owner_employee_name: '王老師',
  source: 'branch_calendar_import',
  ...over,
})

const JULY_2026 = {
  start: new Date(2026, 5, 28),
  end: new Date(2026, 7, 9),
  view: { type: 'dayGridMonth', currentStart: new Date(2026, 6, 1), currentEnd: new Date(2026, 7, 1) },
}

const backendError = (message: string) => Object.assign(new Error(message), { displayMessage: message })

async function mountView(opts: { isMobile?: boolean } = {}) {
  mobile.value = opts.isMobile ?? false
  const wrapper = mount(CalendarView, {
    global: { plugins: [ElementPlus], directives: { loading: () => {} }, stubs: STUBS },
  })
  await flushPromises()
  wrapper.findComponent(CalendarBoardStub).vm.$emit('dates-set', JULY_2026)
  await flushPromises()
  return wrapper
}

const board = (w: VueWrapper) => w.findComponent(CalendarBoardStub)
const clickEventOnCalendar = async (w: VueWrapper, rawId: number | string = 5) => {
  board(w).vm.$emit('event-click', { event: { extendedProps: { layer: 'event', rawId, link: null } } })
  await flushPromises()
}
const cardButton = (w: VueWrapper, text: string) =>
  w.findAll('.alc-card__actions button').find((b) => b.text() === text)!
const formItem = (w: VueWrapper, label: string) =>
  w.findAll('.el-form-item').find((i) => i.find('.el-form-item__label').text() === label)
const submitDialog = async (w: VueWrapper) => {
  await w.find('[data-test="form-dialog-submit"]').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  mobile.value = false
  employeeState.employees = []
  employeeState.error = null
  confirm.mockResolvedValue('confirm')
  api.getCalendarFeed.mockResolvedValue({ data: { events: [feedRow()], official_sync: null } })
  api.getAdminFeed.mockResolvedValue({ data: { from: '', to: '', items: [] } })
  api.getEvent.mockResolvedValue({ data: detail() })
  api.createEvent.mockResolvedValue({ data: {} })
  api.updateEvent.mockResolvedValue({ data: {} })
  api.deleteEvent.mockResolvedValue({ data: {} })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('頁首動作：一個主要動作，其餘收進選單', () => {
  it('只有「新增事件」是主要按鈕；匯入／匯出不再是四顆並排的同級按鈕', async () => {
    const w = await mountView()
    const actions = w.find('.header-actions')
    const create = actions.find('[data-test="admin-create-button"]')
    expect(create.exists()).toBe(true)
    expect(create.text()).toContain('新增事件')
    expect(create.classes()).toContain('el-button--primary')
    // 頁首直接露出的按鈕只有「匯入／匯出」選單鈕與「新增事件」；選單項目在選單內
    const topLevelButtons = actions.findAll('button').filter((b) => !b.classes().includes('dd-item'))
    expect(topLevelButtons.map((b) => b.text())).toEqual(['匯入／匯出', '新增事件'])
    expect(topLevelButtons.filter((b) => b.classes().includes('el-button--primary'))).toHaveLength(1)
  })

  it('選單項目帶出目前顯示的年月，使用者知道匯出的是哪一段', async () => {
    const w = await mountView()
    const items = w.findAll('.dd-item').map((i) => ({ command: i.attributes('data-command'), text: i.text() }))
    expect(items).toEqual([
      { command: 'import', text: '匯入分校行事曆' },
      { command: 'export-calendar', text: '匯出 2026 年 7 月行事曆' },
      { command: 'export-holidays', text: '匯出 2026 年國定假日' },
    ])
  })

  it('選單指令：匯出行事曆／國定假日呼叫下載（網址與改版前相同）；匯入開啟匯入對話框', async () => {
    const w = await mountView()
    const dropdown = w.findComponent({ name: 'ElDropdown' })
    dropdown.vm.$emit('command', 'export-calendar')
    dropdown.vm.$emit('command', 'export-holidays')
    expect(download.downloadFile).toHaveBeenNthCalledWith(1, '/exports/calendar?year=2026&month=7', '2026年7月行事曆.xlsx')
    expect(download.downloadFile).toHaveBeenNthCalledWith(2, '/exports/holidays?year=2026', '2026年國定假日.xlsx')

    expect(w.findComponent(ImportDialogStub).props('modelValue')).toBe(false)
    dropdown.vm.$emit('command', 'import')
    await flushPromises()
    expect(w.findComponent(ImportDialogStub).props('modelValue')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('載入失敗：不被當成「這個月沒有事件」', () => {
  it('事件列表載入失敗 → 錯誤態＋重新載入，不顯示「還沒有事件」，也不留舊資料', async () => {
    const w = await mountView({ isMobile: true })
    expect(w.text()).toContain('主教會議')

    api.getCalendarFeed.mockRejectedValueOnce(backendError('伺服器忙碌'))
    board(w).vm.$emit('dates-set', { ...JULY_2026, view: { ...JULY_2026.view, currentStart: new Date(2026, 7, 1) } })
    await flushPromises()

    expect(w.find('[data-test="calendar-events-error"]').exists()).toBe(true)
    expect(w.text()).toContain('本月事件列表載入失敗')
    expect(w.text()).not.toContain('這個月還沒有事件')
    expect(w.text()).not.toContain('主教會議')
    expect(msg.error).toHaveBeenCalledWith('伺服器忙碌')
  })

  it('按「重新載入」→ 重新撈取，成功後錯誤態消失、列出事件', async () => {
    api.getCalendarFeed.mockRejectedValueOnce(backendError('伺服器忙碌'))
    const w = await mountView({ isMobile: true })
    expect(w.find('[data-test="calendar-events-error"]').exists()).toBe(true)

    api.getCalendarFeed.mockClear()
    await w.find('[data-test="calendar-events-retry"]').trigger('click')
    await flushPromises()

    expect(api.getCalendarFeed).toHaveBeenCalledWith({ year: 2026, month: 7 })
    expect(w.find('[data-test="calendar-events-error"]').exists()).toBe(false)
    expect(w.text()).toContain('主教會議')
  })

  it('桌機表格版同樣顯示錯誤態（不是空表格）', async () => {
    api.getCalendarFeed.mockRejectedValueOnce(backendError('伺服器忙碌'))
    const w = await mountView()
    expect(w.find('[data-test="calendar-events-error"]').exists()).toBe(true)
    expect(w.find('.table-stub').exists()).toBe(false)
  })

  it('月曆格線（admin_feed）載入失敗 → 明講「看不到不代表沒行程」並可重試', async () => {
    api.getAdminFeed.mockRejectedValueOnce(new Error('boom'))
    const w = await mountView()
    expect(w.find('[data-test="calendar-feed-error"]').exists()).toBe(true)
    expect(w.find('[data-test="calendar-feed-error"]').text()).toContain('不代表這段期間沒有行程')
    // 失敗時清掉上個月的格線項目
    expect(setItems).toHaveBeenLastCalledWith([])

    await w.find('[data-test="calendar-feed-retry"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-test="calendar-feed-error"]').exists()).toBe(false)
  })

  it('載入成功但本月真的沒事件 → 才顯示「這個月還沒有事件」', async () => {
    api.getCalendarFeed.mockResolvedValue({ data: { events: [], official_sync: null } })
    const w = await mountView()
    expect(w.find('[data-test="calendar-events-error"]').exists()).toBe(false)
    expect(w.find('.table-empty').text()).toContain('這個月還沒有事件')
  })

  it('搜尋沒有結果 → 說明是搜尋範圍而不是整月沒事件', async () => {
    const w = await mountView({ isMobile: true })
    await w.find('.list-search input').setValue('不存在的關鍵字')
    expect(w.text()).toContain('找不到符合「不存在的關鍵字」的事件')
    expect(w.text()).not.toContain('這個月還沒有事件')
  })

  it('事件清單沒載到時點月曆上的事件 → 有提示，不是無聲無息', async () => {
    api.getCalendarFeed.mockRejectedValueOnce(backendError('伺服器忙碌'))
    const w = await mountView()
    await clickEventOnCalendar(w)
    expect(msg.warning).toHaveBeenCalledWith(expect.stringContaining('沒有載入成功'))
    expect(api.getEvent).not.toHaveBeenCalled()
  })

  it('點到不在本月清單內的事件（相鄰月份的格子）→ 有提示', async () => {
    const w = await mountView()
    await clickEventOnCalendar(w, 999)
    expect(msg.warning).toHaveBeenCalledWith(expect.stringContaining('切換到事件所在的月份'))
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('新增事件：送出 payload 與改版前一致', () => {
  const openCreate = async (w: VueWrapper) => {
    await w.find('[data-test="admin-create-button"]').trigger('click')
    await flushPromises()
  }
  const fillBasics = async (w: VueWrapper) => {
    await formItem(w, '標題')!.find('input').setValue('期末教學會議')
    await formItem(w, '開始日期')!.find('.dp-stub').setValue('2026-07-20')
  }
  const EXPECTED_CREATE = {
    title: '期末教學會議',
    description: null,
    event_date: '2026-07-20',
    end_date: null,
    event_type: 'general',
    is_all_day: true,
    start_time: null,
    end_time: null,
    location: null,
    recurrence_rule: null,
    visibility: 'parent',
    category: 'general',
    academic_year: null,
    semester: null,
    week_no: null,
    owner_employee_id: null,
    requires_acknowledgment: false,
  }

  it('預設「家長」可見：先確認發布；確認後 createEvent 的 payload 欄位與值逐字不變', async () => {
    const w = await mountView()
    await openCreate(w)
    await fillBasics(w)
    await submitDialog(w)

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0][0]).toContain('期末教學會議')
    expect(confirm.mock.calls[0][0]).toContain('家長端')
    expect(api.createEvent).toHaveBeenCalledTimes(1)
    expect(api.createEvent).toHaveBeenCalledWith(EXPECTED_CREATE)
    expect(msg.success).toHaveBeenCalledWith('事件已新增')
    // 成功後對話框關閉並重新載入
    expect(w.find('.el-dialog-stub').exists()).toBe(false)
    expect(api.getCalendarFeed).toHaveBeenCalledTimes(2)
  })

  it('在發布確認按「再檢查一下」→ 不送出，對話框與已填內容留著', async () => {
    confirm.mockRejectedValueOnce('cancel')
    const w = await mountView()
    await openCreate(w)
    await fillBasics(w)
    await submitDialog(w)

    expect(api.createEvent).not.toHaveBeenCalled()
    expect(w.find('.el-dialog-stub').exists()).toBe(true)
    expect((formItem(w, '標題')!.find('input').element as HTMLInputElement).value).toBe('期末教學會議')
  })

  it('改成「教職員」可見 → 不需要發布確認，payload 其餘欄位不變', async () => {
    const w = await mountView()
    await openCreate(w)
    await fillBasics(w)
    await w.findComponent({ name: 'ElRadioGroup' }).vm.$emit('update:modelValue', 'staff')
    await flushPromises()
    await submitDialog(w)

    expect(confirm).not.toHaveBeenCalled()
    expect(api.createEvent).toHaveBeenCalledWith({ ...EXPECTED_CREATE, visibility: 'staff' })
  })

  it('新增失敗 → 顯示後端訊息、對話框不關、內容還在，可修正後再送', async () => {
    api.createEvent.mockRejectedValueOnce(backendError('結束日期不可早於開始日期'))
    const w = await mountView()
    await openCreate(w)
    await fillBasics(w)
    await w.findComponent({ name: 'ElRadioGroup' }).vm.$emit('update:modelValue', 'staff')
    await flushPromises()
    await submitDialog(w)

    expect(msg.error).toHaveBeenCalledWith('結束日期不可早於開始日期')
    expect(msg.success).not.toHaveBeenCalled()
    expect(w.find('.el-dialog-stub').exists()).toBe(true)
    expect((formItem(w, '標題')!.find('input').element as HTMLInputElement).value).toBe('期末教學會議')
    // 失敗後主鈕不再卡在 loading，可以再送
    expect(w.find('[data-test="form-dialog-submit"]').classes()).not.toContain('is-loading')
    await submitDialog(w)
    expect(api.createEvent).toHaveBeenCalledTimes(2)
    expect(w.find('.el-dialog-stub').exists()).toBe(false)
  })

  it('失敗訊息沒有後端說明時，用白話 fallback', async () => {
    api.createEvent.mockRejectedValueOnce(new Error('network'))
    const w = await mountView()
    await openCreate(w)
    await fillBasics(w)
    await w.findComponent({ name: 'ElRadioGroup' }).vm.$emit('update:modelValue', 'staff')
    await submitDialog(w)
    expect(msg.error).toHaveBeenCalledWith('儲存失敗，請稍後再試')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('編輯事件', () => {
  const openEdit = async (w: VueWrapper) => {
    await cardButton(w, '編輯').trigger('click')
    await flushPromises()
  }

  it('從事件列表編輯：先抓單筆完整資料；存檔 payload 完整且不含 requires_acknowledgment', async () => {
    const w = await mountView({ isMobile: true })
    await openEdit(w)
    expect(api.getEvent).toHaveBeenCalledWith(5)
    expect(w.find('[data-test="form-dialog-submit"]').text()).toBe('儲存')

    await submitDialog(w)

    expect(api.updateEvent).toHaveBeenCalledTimes(1)
    const [id, payload] = api.updateEvent.mock.calls[0] as [number, Record<string, unknown>]
    expect(id).toBe(5)
    expect(payload).toEqual({
      title: '主教會議',
      description: null,
      event_date: '2026-07-10',
      end_date: null,
      event_type: 'meeting',
      is_all_day: true,
      start_time: null,
      end_time: null,
      location: null,
      recurrence_rule: null,
      visibility: 'staff',
      category: 'teaching',
      academic_year: 115,
      semester: 'first',
      week_no: 3,
      owner_employee_id: 9,
    })
    expect('requires_acknowledgment' in payload).toBe(false)
    expect(msg.success).toHaveBeenCalledWith('事件已更新')
  })

  it('已經是家長可見的事件，改標題存檔不需再次確認發布', async () => {
    api.getCalendarFeed.mockResolvedValue({ data: { events: [feedRow({ visibility: 'parent' })], official_sync: null } })
    api.getEvent.mockResolvedValue({ data: detail({ visibility: 'parent' }) })
    const w = await mountView({ isMobile: true })
    await openEdit(w)
    await submitDialog(w)
    expect(confirm).not.toHaveBeenCalled()
    expect(api.updateEvent).toHaveBeenCalledTimes(1)
  })

  it('把教職員事件改成家長可見 → 需要發布確認；取消則不送出', async () => {
    confirm.mockRejectedValueOnce('cancel')
    const w = await mountView({ isMobile: true })
    await openEdit(w)
    await w.findComponent({ name: 'ElRadioGroup' }).vm.$emit('update:modelValue', 'parent')
    await flushPromises()
    await submitDialog(w)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(api.updateEvent).not.toHaveBeenCalled()
    expect(w.find('.el-dialog-stub').exists()).toBe(true)
  })

  it('更新失敗 → 顯示後端訊息、對話框不關', async () => {
    api.updateEvent.mockRejectedValueOnce(backendError('重複事件不支援直接改期，請從編輯對話框修改規則'))
    const w = await mountView({ isMobile: true })
    await openEdit(w)
    await submitDialog(w)
    expect(msg.error).toHaveBeenCalledWith('重複事件不支援直接改期，請從編輯對話框修改規則')
    expect(w.find('.el-dialog-stub').exists()).toBe(true)
  })

  it('單筆資料載入失敗 → 提示並且不開編輯表單', async () => {
    api.getEvent.mockRejectedValueOnce(backendError('事件不存在'))
    const w = await mountView({ isMobile: true })
    await openEdit(w)
    expect(msg.error).toHaveBeenCalledWith('事件不存在')
    expect(w.find('.el-dialog-stub').exists()).toBe(false)
  })

  it('官方（唯讀）事件只能查看，沒有編輯／刪除', async () => {
    api.getCalendarFeed.mockResolvedValue({
      data: { events: [feedRow({ id: 8, title: '國慶日', is_official: true, is_read_only: true, visibility: null })], official_sync: null },
    })
    const w = await mountView({ isMobile: true })
    const labels = w.findAll('.alc-card__actions button').map((b) => b.text())
    expect(labels).toEqual(['查看'])
    expect(w.find('.alc-card__actions').text()).toContain('唯讀')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('刪除', () => {
  it('家長可見事件：確認文字說明家長端也會消失；取消不刪', async () => {
    api.getCalendarFeed.mockResolvedValue({ data: { events: [feedRow({ visibility: 'parent' })], official_sync: null } })
    confirm.mockRejectedValueOnce('cancel')
    const w = await mountView({ isMobile: true })
    await cardButton(w, '刪除').trigger('click')
    await flushPromises()

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0][0]).toContain('「主教會議」')
    expect(confirm.mock.calls[0][0]).toContain('家長端也會一併消失')
    expect(confirm.mock.calls[0][2]).toMatchObject({ confirmButtonText: '刪除', cancelButtonText: '取消' })
    expect(api.deleteEvent).not.toHaveBeenCalled()
  })

  it('教職員可見事件：說明教師端也會消失', async () => {
    const w = await mountView({ isMobile: true })
    await cardButton(w, '刪除').trigger('click')
    await flushPromises()
    expect(confirm.mock.calls[0][0]).toContain('教師端也會一併消失')
    expect(api.deleteEvent).toHaveBeenCalledWith(5)
    expect(msg.success).toHaveBeenCalledWith('事件已刪除')
  })

  it('行政限定事件：確認文字不提家長／教師', async () => {
    api.getCalendarFeed.mockResolvedValue({ data: { events: [feedRow({ visibility: 'admin' })], official_sync: null } })
    const w = await mountView({ isMobile: true })
    await cardButton(w, '刪除').trigger('click')
    await flushPromises()
    expect(confirm.mock.calls[0][0]).not.toContain('家長端')
    expect(confirm.mock.calls[0][0]).not.toContain('教師端')
  })

  it('刪除失敗 → 顯示後端訊息，不顯示成功', async () => {
    api.deleteEvent.mockRejectedValueOnce(backendError('事件已被刪除'))
    const w = await mountView({ isMobile: true })
    await cardButton(w, '刪除').trigger('click')
    await flushPromises()
    expect(msg.error).toHaveBeenCalledWith('事件已被刪除')
    expect(msg.success).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('重複事件的場次（id 形如 "5@2026-07-10"）', () => {
  const RECURRING = feedRow({ id: '5@2026-07-10' })
  beforeEach(() => {
    api.getCalendarFeed.mockResolvedValue({ data: { events: [RECURRING], official_sync: null } })
  })

  it('點月曆上的重複場次 → 對得到列表中的同一場次，並以來源 pk 抓單筆資料（不是帶 "@" 的字串）', async () => {
    const w = await mountView()
    await clickEventOnCalendar(w, '5@2026-07-10')
    expect(msg.warning).not.toHaveBeenCalled()
    expect(api.getEvent).toHaveBeenCalledWith(5)
    expect(w.find('.el-dialog-stub').exists()).toBe(true)
  })

  it('列表上編輯重複場次 → 同樣以來源 pk 抓單筆資料', async () => {
    const w = await mountView({ isMobile: true })
    await cardButton(w, '編輯').trigger('click')
    await flushPromises()
    expect(api.getEvent).toHaveBeenCalledWith(5)
  })

  it('刪除重複場次 → 確認文字說明會刪掉整個系列；API 以來源 pk 呼叫', async () => {
    const w = await mountView({ isMobile: true })
    await cardButton(w, '刪除').trigger('click')
    await flushPromises()
    expect(confirm.mock.calls[0][0]).toContain('整個系列的所有場次')
    expect(api.deleteEvent).toHaveBeenCalledWith(5)
  })

  it('非重複事件的確認文字不提「整個系列」', async () => {
    api.getCalendarFeed.mockResolvedValue({ data: { events: [feedRow()], official_sync: null } })
    const w = await mountView({ isMobile: true })
    await cardButton(w, '刪除').trigger('click')
    await flushPromises()
    expect(confirm.mock.calls[0][0]).not.toContain('整個系列')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('拖拉改期', () => {
  const dropInfo = (revert = vi.fn()) => ({
    revert,
    event: {
      extendedProps: { layer: 'event', rawId: 5 },
      start: new Date(2026, 6, 12),
      end: null,
      allDay: true,
    },
  })

  it('家長可見事件：先確認；取消 → 彈回原位、不更新', async () => {
    api.getCalendarFeed.mockResolvedValue({ data: { events: [feedRow({ visibility: 'parent' })], official_sync: null } })
    confirm.mockRejectedValueOnce('cancel')
    const w = await mountView()
    const info = dropInfo()
    board(w).vm.$emit('event-drop', info)
    await flushPromises()

    expect(confirm.mock.calls[0][0]).toContain('2026-07-12')
    expect(info.revert).toHaveBeenCalledTimes(1)
    expect(api.updateEvent).not.toHaveBeenCalled()
  })

  it('家長可見事件確認後 → 照舊送出（payload 不變）', async () => {
    api.getCalendarFeed.mockResolvedValue({ data: { events: [feedRow({ visibility: 'parent' })], official_sync: null } })
    const w = await mountView()
    const info = dropInfo()
    board(w).vm.$emit('event-drop', info)
    await flushPromises()
    expect(api.updateEvent).toHaveBeenCalledWith(5, { event_date: '2026-07-12', end_date: null })
    expect(info.revert).not.toHaveBeenCalled()
  })

  it('非家長可見事件：不打擾，直接改期', async () => {
    const w = await mountView()
    board(w).vm.$emit('event-drop', dropInfo())
    await flushPromises()
    expect(confirm).not.toHaveBeenCalled()
    expect(api.updateEvent).toHaveBeenCalledWith(5, { event_date: '2026-07-12', end_date: null })
  })

  it('改期失敗 → 彈回原位並顯示後端訊息', async () => {
    api.updateEvent.mockRejectedValueOnce(backendError('重複事件不支援直接改期，請從編輯對話框修改規則'))
    const w = await mountView()
    const info = dropInfo()
    board(w).vm.$emit('event-drop', info)
    await flushPromises()
    expect(info.revert).toHaveBeenCalledTimes(1)
    expect(msg.error).toHaveBeenCalledWith('重複事件不支援直接改期，請從編輯對話框修改規則')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('≤768px：事件列表改任務卡片', () => {
  it('手機：渲染卡片、不渲染 8 欄表格；卡片含日期／類型／可見範圍／時間，操作在卡片上', async () => {
    api.getCalendarFeed.mockResolvedValue({
      data: {
        events: [feedRow({ is_all_day: false, start_time: '09:00', end_time: '10:30', location: '會議室A', description: '討論期末事項' })],
        official_sync: null,
      },
    })
    const w = await mountView({ isMobile: true })
    expect(w.find('[data-test="calendar-event-cards"]').exists()).toBe(true)
    expect(w.find('.table-stub').exists()).toBe(false)
    const card = w.find('.alc-card').text()
    for (const text of ['主教會議', '2026-07-10', '會議', '教職員', '09:00 - 10:30', '會議室A', '討論期末事項', '編輯', '刪除']) {
      expect(card).toContain(text)
    }
  })

  it('桌機：維持表格，不渲染卡片', async () => {
    const w = await mountView()
    expect(w.find('[data-test="calendar-event-cards"]').exists()).toBe(false)
    expect(w.find('.table-stub').exists()).toBe(true)
  })

  it('內部代碼不外露：未知的事件類型／可見範圍顯示白話，不顯示英文代碼', async () => {
    api.getCalendarFeed.mockResolvedValue({
      data: { events: [feedRow({ event_type: 'weird_type', event_type_label: undefined, visibility: 'secret_scope' })], official_sync: null },
    })
    const w = await mountView({ isMobile: true })
    const card = w.find('.alc-card').text()
    expect(card).toContain('其他')
    expect(card).not.toContain('weird_type')
    expect(card).not.toContain('secret_scope')
  })
})
