/**
 * DismissalQueueView 整合到 T-011 DismissalPosBoard 後的端到端行為（T-015）。
 *
 * 比照既有 DismissalQueueView.roster.test.ts 的 mock/mount 慣例，但這裡用
 * `mount`（非 shallowMount）讓 DismissalPosBoard 整棵樹（T-005/T-007/T-010）
 * 都真的渲染，才能驗證從「點卡片」到「真的打 createDismissalCall」這條完整
 * 使用者流程，以及 5 秒倒數期間 swipe 取消 / 卸載元件不留殭屍呼叫。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// vi.mock 的 factory 會被 hoist 到檔案最頂端，早於一般 const 宣告初始化，
// 兩份測資因此要用 vi.hoisted() 包起來才能在下方 factory 內被引用。
const { CLASSROOMS, STUDENTS } = vi.hoisted(() => ({
  CLASSROOMS: [
    { id: 1, name: '陽光班', school_year: 115, semester: 1, semester_label: '115學年度上學期' },
    { id: 2, name: '星星班', school_year: 115, semester: 1, semester_label: '115學年度上學期' },
  ],
  STUDENTS: [
    { id: 101, name: '王小明', classroom_id: 1 },
    { id: 201, name: '林小美', classroom_id: 2 },
  ],
}))

vi.mock('@/api/classrooms', () => ({
  getClassrooms: vi.fn().mockResolvedValue({ data: CLASSROOMS }),
}))

vi.mock('@/api/students', () => ({
  getStudents: vi.fn().mockResolvedValue({ data: { items: STUDENTS, total: STUDENTS.length } }),
}))

vi.mock('@/api/dismissalCalls', () => ({
  getDismissalCalls: vi.fn().mockResolvedValue({ data: [] }),
  cancelDismissalCall: vi.fn().mockResolvedValue({ data: {} }),
  createDismissalCall: vi.fn().mockResolvedValue({ data: {} }),
}))

vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  readyState = FakeWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {}
  send() { /* no-op：測試不需要真的送出任何訊息 */ }
  close() {
    this.readyState = FakeWebSocket.CLOSED
  }
}
vi.stubGlobal('WebSocket', FakeWebSocket)

import DismissalQueueView from '@/views/DismissalQueueView.vue'
import { createDismissalCall, cancelDismissalCall, getDismissalCalls } from '@/api/dismissalCalls'

// 歷史表格/篩選列/建立通知 Dialog 三塊本輪不動（D7），這裡不是測試重點，
// 用最小 stub 避免這些元件的渲染細節干擾本檔關注的 POS 三欄流程。
const globalConfig = {
  stubs: {
    teleport: true,
    'el-table': { template: '<div class="calls-table-stub"><slot /></div>' },
    'el-table-column': { template: '<div />' },
    'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
    'el-form': { template: '<form><slot /></form>' },
    'el-form-item': { template: '<div><slot /></div>' },
  },
}

async function mountView() {
  const wrapper = mount(DismissalQueueView, { global: globalConfig })
  await flushPromises()
  return wrapper
}

/** 讓 swipe body 元素有非零寬度，模擬真實 layout，讓 useSwipeToCancel 的閾值計算生效（比照 DismissalPosQueueCard.test.ts 慣例）。 */
function withMeasuredWidth(body: HTMLElement, width = 200) {
  Object.defineProperty(body, 'offsetWidth', { value: width, configurable: true })
  body.setPointerCapture = vi.fn()
  body.releasePointerCapture = vi.fn()
  return body
}

describe('DismissalQueueView POS 整合測試', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('預設選第一班：左欄第一項選中態，中欄渲染該班學生', async () => {
    const wrapper = await mountView()
    const railItems = wrapper.findAll('.pos-classroom-rail__item')
    expect(railItems[0].classes()).toContain('is-active')
    expect(railItems[1].classes()).not.toContain('is-active')

    const names = wrapper.findAll('.pos-student-card__name').map(n => n.text())
    expect(names).toEqual(['王小明']) // 陽光班（classroom_id=1），不含星星班的林小美
  })

  it('點卡片到真正呼叫 createDismissalCall 之間有 5 秒延遲', async () => {
    const wrapper = await mountView()
    vi.useFakeTimers()

    await wrapper.find('.pos-student-card').trigger('click')
    // 立即出現 staging 佇列卡（含倒數條），但還不能打 API
    expect(wrapper.findAll('.pos-queue-card')).toHaveLength(1)
    expect(createDismissalCall).not.toHaveBeenCalled()

    // 未到 5 秒：仍不打 API
    await vi.advanceTimersByTimeAsync(4000)
    expect(createDismissalCall).not.toHaveBeenCalled()

    // 滿 5 秒：才真正呼叫，且參數正確（陽光班 id=1）
    await vi.advanceTimersByTimeAsync(1000)
    expect(createDismissalCall).toHaveBeenCalledTimes(1)
    expect(createDismissalCall).toHaveBeenCalledWith({ student_id: 101, classroom_id: 1 })
  })

  it('倒數中 swipe 取消不殘留呼叫：滿 5 秒後仍不會打 createDismissalCall', async () => {
    const wrapper = await mountView()
    vi.useFakeTimers()

    await wrapper.find('.pos-student-card').trigger('click')
    const body = withMeasuredWidth(
      wrapper.find('[data-testid="pos-queue-card-body"]').element as HTMLElement,
    )

    await body.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, pointerId: 1 }))
    await body.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, pointerId: 1 })) // 100/200=50%>40% 閾值
    await body.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, pointerId: 1 }))
    await flushPromises()

    // 佇列卡已消失，且取消動作本身不打任何 API（D1：staging 純前端丟棄）
    expect(wrapper.findAll('.pos-queue-card')).toHaveLength(0)
    expect(cancelDismissalCall).not.toHaveBeenCalled()

    // 就算等滿原本的 5 秒，也不會再冒出一次 createDismissalCall（timer 已隨 cancel 清除）
    await vi.advanceTimersByTimeAsync(5000)
    expect(createDismissalCall).not.toHaveBeenCalled()
  })

  it('倒數中卸載元件（模擬重整頁面）不留殭屍計時器：滿 5 秒後不會呼叫 createDismissalCall', async () => {
    const wrapper = await mountView()
    vi.useFakeTimers()

    await wrapper.find('.pos-student-card').trigger('click')
    expect(wrapper.findAll('.pos-queue-card')).toHaveLength(1)

    wrapper.unmount() // 模擬使用者離開頁面／重整
    await vi.advanceTimersByTimeAsync(5000)

    expect(createDismissalCall).not.toHaveBeenCalled()
  })

  it('D5：待處理檢視下 completed 記錄會驅動中欄「家長已接送」徽章，但不計入待接送計數／不出現在右欄佇列', async () => {
    vi.mocked(getDismissalCalls).mockResolvedValueOnce({
      data: [
        {
          id: 999,
          student_id: 101,
          student_name: '王小明',
          classroom_name: '陽光班',
          status: 'completed',
          requested_at: '2026-08-21T07:00:00+08:00',
        },
      ],
    })
    const wrapper = await mountView()

    // active 檢視不帶 status 篩選（拿到今日全狀態，含 completed）
    expect(getDismissalCalls).toHaveBeenCalledWith({})

    // 中欄：王小明的卡片顯示「家長已接送」徽章，且視覺降階（不可再點擊發起）
    const card = wrapper.find('.pos-student-card')
    expect(card.text()).toContain('家長已接送')
    expect(card.classes()).toContain('is-resolved')

    // 頁首「待接送」計數與右欄佇列都不應把這筆 completed 記錄算進去
    expect(wrapper.find('.page-header__count').exists()).toBe(false)
    expect(wrapper.findAll('.pos-queue-card')).toHaveLength(0)
  })

  it('篩選狀態切到非「待處理」時，歷史表格分支不受影響（POS 佈局消失、表格出現）', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('.pos-classroom-rail__item').exists()).toBe(true)
    expect(wrapper.find('.calls-table-stub').exists()).toBe(false)

    wrapper.vm.filterStatus = 'completed'
    await flushPromises()

    expect(wrapper.find('.pos-classroom-rail__item').exists()).toBe(false)
    expect(wrapper.find('.calls-table-stub').exists()).toBe(true)
  })
})
