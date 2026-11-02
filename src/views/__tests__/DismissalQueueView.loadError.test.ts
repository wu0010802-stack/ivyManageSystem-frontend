/**
 * UAT S-13：放學佇列點名單／接送通知列表載入失敗時，必須顯示持久錯誤態＋重試鈕，
 * 不可落入 POS 看板「這個班級目前沒有在籍學生」的空狀態（toast 12 秒後消失）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

const { rosterMock, callsMock } = vi.hoisted(() => ({
  rosterMock: vi.fn(),
  callsMock: vi.fn(),
}))

vi.mock('@/api/dismissalCalls', () => ({
  getDismissalRoster: rosterMock,
  getDismissalCalls: callsMock,
  getDismissalCallsFresh: callsMock,
  cancelDismissalCall: vi.fn(),
  createDismissalCall: vi.fn(),
}))
vi.mock('@/stores/classroom', () => ({
  useClassroomStore: () => ({ classrooms: [], fetchClassrooms: vi.fn().mockResolvedValue(undefined) }),
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
  readyState = 0
  onopen = null
  onmessage = null
  onclose = null
  onerror = null
  constructor(public url: string) {}
  close() { this.readyState = 3 }
}
vi.stubGlobal('WebSocket', FakeWebSocket)

import DismissalQueueView from '@/views/DismissalQueueView.vue'
import DismissalPosBoard from '@/components/dismissal/pos/DismissalPosBoard.vue'

const ROSTER_OK = { data: { students: [{ id: 1, name: '王小明', classroom_id: 13 }], classrooms: [{ id: 13, name: '天堂鳥', school_year: 115, semester: 1 }] } }
const err500 = () => Object.assign(new Error('boom'), { response: { status: 500, data: {} } })

const mountView = async () => {
  const wrapper = shallowMount(DismissalQueueView, {
    global: { stubs: { teleport: true, 'el-table-column': { template: '<span />' } } },
  })
  await flushPromises()
  return wrapper
}

describe('DismissalQueueView 載入失敗不偽裝空狀態（S-13）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    callsMock.mockResolvedValue({ data: [] })
    rosterMock.mockResolvedValue(ROSTER_OK)
  })

  it('點名單 500：顯示持久錯誤態與重試鈕，不渲染 POS 看板', async () => {
    rosterMock.mockRejectedValue(err500())
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="dismissal-load-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="dismissal-load-retry"]').exists()).toBe(true)
    expect(wrapper.findComponent(DismissalPosBoard).exists()).toBe(false)
  })

  it('接送通知列表 500（點名單成功）：同樣顯示錯誤態，不落入空看板', async () => {
    callsMock.mockRejectedValue(err500())
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="dismissal-load-error"]').exists()).toBe(true)
    expect(wrapper.findComponent(DismissalPosBoard).exists()).toBe(false)
  })

  it('按重試會重打失敗的 API，成功後錯誤態消失並出現看板', async () => {
    rosterMock.mockRejectedValueOnce(err500())
    const wrapper = await mountView()
    expect(rosterMock).toHaveBeenCalledTimes(1)
    await wrapper.find('[data-testid="dismissal-load-retry"]').trigger('click')
    await flushPromises()
    expect(rosterMock).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="dismissal-load-error"]').exists()).toBe(false)
    expect(wrapper.findComponent(DismissalPosBoard).exists()).toBe(true)
  })

  it('兩支都成功時不顯示錯誤態', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="dismissal-load-error"]').exists()).toBe(false)
    expect(wrapper.findComponent(DismissalPosBoard).exists()).toBe(true)
  })
})
