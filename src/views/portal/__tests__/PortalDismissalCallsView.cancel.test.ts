import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus'
import { ref } from 'vue'

const { mockAck, mockComplete, mockCancel } = vi.hoisted(() => ({
  mockAck: vi.fn(),
  mockComplete: vi.fn(),
  mockCancel: vi.fn(),
}))

vi.mock('@/api/dismissalCalls', () => ({
  acknowledgeDismissalCall: mockAck,
  completeDismissalCall: mockComplete,
  cancelPortalDismissalCall: mockCancel,
}))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual('element-plus')
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

// WS/音效由殼層與 module-singleton composable 管；view 測試只驗 action 邏輯
const activeCalls = ref<Array<Record<string, unknown>>>([])
vi.mock('@/composables/usePortalDismissalAlerts', () => ({
  usePortalDismissalAlerts: () => ({
    activeCalls,
    sortedCalls: activeCalls,
    loading: ref(false),
    liveAnnounce: ref(''),
    wsConnected: ref(true),
    connectionState: ref('normal'),
    connectionMessage: ref(''),
    muted: ref(true),
    audioUnlocked: ref(true),
    notificationSupported: ref(false),
    toggleMute: vi.fn(),
    unlockAudio: vi.fn(),
    unlockSpeech: vi.fn(),
    playAlert: vi.fn(),
    cancelPendingSpeech: vi.fn(),
    fetchCalls: vi.fn(),
    retryWebSocket: vi.fn(),
  }),
}))

import PortalDismissalCallsView from '@/views/portal/PortalDismissalCallsView.vue'

const PENDING_CALL = {
  id: 11,
  student_name: '小美',
  classroom_name: '太陽班',
  status: 'pending',
  requested_at: new Date().toISOString(),
}
const ACKNOWLEDGED_CALL = {
  id: 22,
  student_name: '小強',
  classroom_name: '月亮班',
  status: 'acknowledged',
  requested_at: new Date().toISOString(),
}

async function mountView() {
  const wrapper = mount(PortalDismissalCallsView, {
    global: {
      plugins: [ElementPlus],
      stubs: {
        DismissalCallCard: {
          props: ['call', 'now'],
          template: '<div class="card-stub"><slot name="action" /></div>',
        },
      },
    },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function buttonsByText(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').filter((b) => b.text().includes(text))
}

describe('PortalDismissalCallsView 取消通知', () => {
  beforeEach(() => {
    mockAck.mockReset()
    mockComplete.mockReset()
    mockCancel.mockReset()
    vi.mocked(ElMessageBox.confirm).mockReset()
    vi.mocked(ElMessage.success).mockReset()
    vi.mocked(ElMessage.error).mockReset()
    activeCalls.value = [{ ...PENDING_CALL }, { ...ACKNOWLEDGED_CALL }]
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('pending 與 acknowledged 通知都顯示取消按鈕', async () => {
    const wrapper = await mountView()
    expect(buttonsByText(wrapper, '取消通知')).toHaveLength(2)
    // 既有主要動作不受影響
    expect(buttonsByText(wrapper, '我收到了')).toHaveLength(1)
    // 教師端已無獨立「帶出去放學」按鈕：按「我收到了」即完成，家長預告尚未抵達者
    // 由 dismissal_call_arrived 事件自動完成（設計與守衛見
    // tests/unit/views/PortalDismissalCallsView.test.js 的檔頭說明）。
    expect(buttonsByText(wrapper, '帶出去放學')).toHaveLength(0)
  })

  it('確認後呼叫 cancel API 並將該筆移出清單', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    mockCancel.mockResolvedValue({ data: { ...PENDING_CALL, status: 'cancelled' } })
    const wrapper = await mountView()

    await buttonsByText(wrapper, '取消通知')[0].trigger('click')
    await flushPromises()

    expect(mockCancel).toHaveBeenCalledWith(11)
    expect(activeCalls.value.map((c) => c.id)).toEqual([22])
    expect(ElMessage.success).toHaveBeenCalled()
  })

  it('對話框按返回則不打 API、清單不變', async () => {
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
    const wrapper = await mountView()

    await buttonsByText(wrapper, '取消通知')[0].trigger('click')
    await flushPromises()

    expect(mockCancel).not.toHaveBeenCalled()
    expect(activeCalls.value).toHaveLength(2)
  })

  it('API 失敗時顯示後端 detail 且不移除清單項', async () => {
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    mockCancel.mockRejectedValue({
      response: { data: { detail: '狀態為 completed 的通知無法執行取消操作' } },
    })
    const wrapper = await mountView()

    await buttonsByText(wrapper, '取消通知')[0].trigger('click')
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith('狀態為 completed 的通知無法執行取消操作')
    expect(activeCalls.value).toHaveLength(2)
  })
})
