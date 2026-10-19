import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import PortalScheduleView from '@/views/portal/PortalScheduleView.vue'
import ScheduleSwapDialog from '@/views/portal/components/schedule/ScheduleSwapDialog.vue'
import ScheduleSwapTable from '@/views/portal/components/schedule/ScheduleSwapTable.vue'
import ScheduleCalendarGrid from '@/views/portal/components/schedule/ScheduleCalendarGrid.vue'

const api = vi.hoisted(() => ({
  getMySchedule: vi.fn(),
  getSwapRequests: vi.fn(),
  createSwapRequest: vi.fn(),
  respondToSwap: vi.fn(),
  cancelSwapRequest: vi.fn(),
  getSwapCandidates: vi.fn(),
  getDayRoster: vi.fn(),
}))
vi.mock('@/api/portal', () => api)

const msg = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  confirm: vi.fn(),
}))
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return {
    ...actual,
    ElMessage: { success: msg.success, error: msg.error, warning: msg.warning },
    ElMessageBox: { confirm: msg.confirm },
  }
})
// 手機：換班入口改走日格底部抽屜
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: ref(true) }) }))

const STUBS = {
  PortalPageHeader: true,
  ScheduleMonthHeader: true,
  ScheduleCalendarGrid: true,
  ScheduleSwapTable: true,
  ScheduleSwapDialog: true,
  // 抽屜只在開啟時渲染 slot，不依賴 teleport
  ElDrawer: {
    props: ['modelValue', 'title'],
    template: '<div v-if="modelValue" data-test="day-sheet"><slot /></div>',
  },
  ElCard: { template: '<div><slot name="header" /><slot /></div>' },
  ElButton: { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' },
  ElTag: true,
}

async function mountView() {
  api.getMySchedule.mockResolvedValue({ data: { days: [] } })
  api.getSwapRequests.mockResolvedValue({ data: [] })
  api.getSwapCandidates.mockResolvedValue({ data: [] })
  api.getDayRoster.mockResolvedValue({ data: [] })
  const w = mount(PortalScheduleView, { global: { stubs: STUBS, directives: { loading: {} } } })
  await flushPromises()
  return w
}

const submitPayload = { swap_date: '2020-01-06', target_id: 7, reason: '臨時對調' }

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset())
  Object.values(msg).forEach((fn) => fn.mockReset())
})

describe('PortalScheduleView 補登換班（SPEC-026 3-3 T6）', () => {
  it('回應 mode=backdated：提示已改為補登並指向「出勤確認」', async () => {
    const w = await mountView()
    api.createSwapRequest.mockResolvedValue({
      data: { message: 'x', id: null, mode: 'backdated', confirmation_item_id: 9 },
    })
    w.findComponent(ScheduleSwapDialog).vm.$emit('submit', submitPayload)
    await flushPromises()
    expect(api.createSwapRequest).toHaveBeenCalledWith({
      target_id: 7,
      swap_date: '2020-01-06',
      reason: '臨時對調',
    })
    expect(msg.success).toHaveBeenCalledWith('已送出補登，等對方同意後由行政套用；可在「出勤確認」查看')
  })

  it('回應 mode=immediate：維持「換班申請已送出」', async () => {
    const w = await mountView()
    api.createSwapRequest.mockResolvedValue({
      data: { message: 'ok', id: 3, mode: 'immediate', confirmation_item_id: null },
    })
    w.findComponent(ScheduleSwapDialog).vm.$emit('submit', { ...submitPayload, swap_date: '2099-01-05' })
    await flushPromises()
    expect(msg.success).toHaveBeenCalledWith('換班申請已送出')
  })

  it('今天已打卡被後端改判補登：前端沒預知，也靠 mode 提示', async () => {
    const w = await mountView()
    api.createSwapRequest.mockResolvedValue({
      data: { message: 'x', id: null, mode: 'backdated', confirmation_item_id: 10 },
    })
    // 送出的是「今天」，對話框無從得知是否已打卡
    w.findComponent(ScheduleSwapDialog).vm.$emit('submit', { ...submitPayload, swap_date: '2099-01-05' })
    await flushPromises()
    expect(msg.success).toHaveBeenCalledWith('已送出補登，等對方同意後由行政套用；可在「出勤確認」查看')
  })

  it('補登成功後重抓換班申請列表（補登不會出現在列表，但狀態要刷新）', async () => {
    const w = await mountView()
    api.getSwapRequests.mockClear()
    api.createSwapRequest.mockResolvedValue({
      data: { message: 'x', id: null, mode: 'backdated', confirmation_item_id: 9 },
    })
    w.findComponent(ScheduleSwapDialog).vm.$emit('submit', submitPayload)
    await flushPromises()
    expect(api.getSwapRequests).toHaveBeenCalledTimes(1)
  })

  it('接受時被擋（409 字串）：顯示後端說明，不顯示「已接受」', async () => {
    const w = await mountView()
    msg.confirm.mockResolvedValue('confirm')
    api.respondToSwap.mockRejectedValue({
      response: { status: 409, data: { detail: '換班日已過或已有打卡或請假紀錄，請重新以補登方式登記' } },
    })
    w.findComponent(ScheduleSwapTable).vm.$emit('respond', 5, 'accept')
    await flushPromises()
    expect(msg.error).toHaveBeenCalledWith('換班日已過或已有打卡或請假紀錄，請重新以補登方式登記')
    expect(msg.success).not.toHaveBeenCalled()
  })

  it('接受時被擋：原申請已轉取消，重抓列表讓狀態同步', async () => {
    const w = await mountView()
    msg.confirm.mockResolvedValue('confirm')
    api.respondToSwap.mockRejectedValue({ response: { status: 409, data: { detail: '換班日已過' } } })
    api.getSwapRequests.mockClear()
    w.findComponent(ScheduleSwapTable).vm.$emit('respond', 5, 'accept')
    await flushPromises()
    expect(api.getSwapRequests).toHaveBeenCalledTimes(1)
  })

  it('錯誤走 apiError：攔截器正規化的 displayMessage 與結構化 detail 都能顯示', async () => {
    const w = await mountView()
    msg.confirm.mockResolvedValue('confirm')
    api.respondToSwap.mockRejectedValueOnce({ displayMessage: '對方已取消申請' })
    w.findComponent(ScheduleSwapTable).vm.$emit('respond', 5, 'accept')
    await flushPromises()
    expect(msg.error).toHaveBeenLastCalledWith('對方已取消申請')

    api.respondToSwap.mockRejectedValueOnce({ response: { data: { detail: { code: 'X', message: '結構化說明' } } } })
    w.findComponent(ScheduleSwapTable).vm.$emit('respond', 5, 'reject')
    await flushPromises()
    expect(msg.error).toHaveBeenLastCalledWith('結構化說明')
  })

  it('撤銷失敗同樣走 apiError；沒有任何訊息時才用預設文字', async () => {
    const w = await mountView()
    msg.confirm.mockResolvedValue('confirm')
    api.cancelSwapRequest.mockRejectedValueOnce({ displayMessage: '申請已被處理' })
    w.findComponent(ScheduleSwapTable).vm.$emit('cancel', 5)
    await flushPromises()
    expect(msg.error).toHaveBeenLastCalledWith('申請已被處理')

    api.cancelSwapRequest.mockRejectedValueOnce(new Error('network'))
    w.findComponent(ScheduleSwapTable).vm.$emit('cancel', 5)
    await flushPromises()
    expect(msg.error).toHaveBeenLastCalledWith('撤銷失敗')
  })

  it('使用者按「取消」確認框：不顯示錯誤', async () => {
    const w = await mountView()
    msg.confirm.mockRejectedValue('cancel')
    w.findComponent(ScheduleSwapTable).vm.$emit('respond', 5, 'accept')
    await flushPromises()
    expect(msg.error).not.toHaveBeenCalled()
    expect(api.respondToSwap).not.toHaveBeenCalled()
  })
})

describe('PortalScheduleView 手機日格抽屜（過去日期可補登）', () => {
  const dayCell = (over: Record<string, unknown> = {}) => ({
    day: 6,
    date: '2020-01-06',
    shift_name: '早班',
    work_start: '08:00',
    work_end: '17:00',
    is_weekend: false,
    ...over,
  })

  async function openSheet(day: Record<string, unknown>) {
    const w = await mountView()
    w.findComponent(ScheduleCalendarGrid).vm.$emit('cell-click', day)
    await flushPromises()
    return w
  }
  const cta = (w: Awaited<ReturnType<typeof mountView>>) => w.get('[data-test="day-sheet"] button')

  it('過去的平日且有班別：申請鈕可按，並提示會以補登方式送出', async () => {
    const w = await openSheet(dayCell())
    expect(cta(w).attributes('disabled')).toBeUndefined()
    expect(w.get('[data-test="day-sheet"]').text()).toContain('過去日期會以補登方式送出')
    expect(w.text()).not.toContain('換班僅限今日（含）之後的日期')
  })

  it('未來日期：可按且不顯示補登提示', async () => {
    const w = await openSheet(dayCell({ date: '2099-01-05' }))
    expect(cta(w).attributes('disabled')).toBeUndefined()
    expect(w.get('[data-test="day-sheet"]').text()).not.toContain('補登')
  })

  it('沒有班別／週末：過去日期仍不可按，原因照舊', async () => {
    const noShift = await openSheet(dayCell({ shift_name: null }))
    expect(cta(noShift).attributes('disabled')).toBeDefined()
    expect(noShift.get('[data-test="day-sheet"]').text()).toContain('此日無排班，不需申請換班')

    const weekend = await openSheet(dayCell({ is_weekend: true }))
    expect(cta(weekend).attributes('disabled')).toBeDefined()
    expect(weekend.get('[data-test="day-sheet"]').text()).toContain('週末無排班，不需申請換班')
  })
})

describe('PortalScheduleView 國定假日不能換班（QA #11 前端）', () => {
  it('手機點國定假日格：寫出假日名稱、申請換班停用', async () => {
    const w = await mountView()
    w.findComponent(ScheduleCalendarGrid).vm.$emit('cell-click', {
      day: 10, date: '2099-10-10', is_weekend: false, shift_name: '早車', work_start: '07:00', work_end: '16:30',
      is_override: false, is_holiday: true, holiday_name: '國慶日',
    })
    await flushPromises()
    const sheet = w.get('[data-test="day-sheet"]')
    expect(sheet.text()).toContain('國慶日')
    expect(sheet.text()).toContain('國定假日不需申請換班')
    const btn = sheet.findAll('button').find((b) => b.text() === '申請換班')!
    expect(btn.attributes('disabled')).toBeDefined()
  })
})
