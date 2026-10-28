import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMessage } from 'element-plus'
import { ref } from 'vue'

// 2026-10-28 bug hunt #10：後端對仍有 active 授權的委託接送（proxy）通知拒絕直接 complete（409），
// 必須以取件碼核銷交接。教師按「我收到了」時只標記已收到，不再呼叫 complete。
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
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
    ElMessageBox: { confirm: vi.fn() },
  }
})

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

const PROXY_ARRIVED_CALL = {
  id: 33,
  student_name: '小明',
  classroom_name: '星星班',
  status: 'pending',
  request_source: 'proxy',
  pickup_authorization_id: 7,
  arrived_at: new Date().toISOString(),
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

describe('PortalDismissalCallsView 委託接送按「我收到了」', () => {
  beforeEach(() => {
    mockAck.mockReset().mockResolvedValue({ data: {} })
    mockComplete.mockReset().mockResolvedValue({ data: {} })
    vi.mocked(ElMessage.error).mockReset()
    vi.mocked(ElMessage.info).mockReset()
    activeCalls.value = [{ ...PROXY_ARRIVED_CALL }]
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('只標記已收到、不呼叫 complete，並提示以取件碼核銷', async () => {
    const wrapper = await mountView()
    const btn = wrapper.findAll('button').find((b) => b.text().includes('我收到了'))
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    await flushPromises()

    expect(mockAck).toHaveBeenCalledWith(33)
    expect(mockComplete).not.toHaveBeenCalled()
    expect(ElMessage.error).not.toHaveBeenCalled()
    expect(ElMessage.info).toHaveBeenCalled()
    expect(activeCalls.value.map((c) => c.status)).toEqual(['acknowledged'])
  })
})
