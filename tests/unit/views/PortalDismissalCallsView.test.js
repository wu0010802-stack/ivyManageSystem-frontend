/**
 * tests/unit/views/PortalDismissalCallsView.test.js
 *
 * Task 2 重構（純消費者）：WS / beep / lifecycle 已移至 usePortalDismissalAlerts composable。
 * 此測試改為 mock composable，僅驗證 view 自身行為：
 *   - mount 時呼叫 fetchCalls（進頁補抓最新）
 *   - handleAcknowledge 更新 activeCalls
 *   - handleComplete 從 activeCalls 移除
 *
 * WS liveness / reconnect / ping-pong 行為已移至 composable 單元測試（若另建）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, computed } from 'vue'
import { nextTick } from 'vue'
import { flushPromises, shallowMount } from '@vue/test-utils'

import PortalDismissalCallsView from '@/views/portal/PortalDismissalCallsView.vue'

// ─── Mock API ────────────────────────────────────────────
const acknowledgeDismissalCall = vi.fn(() => Promise.resolve({ data: {} }))
const completeDismissalCall = vi.fn(() => Promise.resolve({ data: {} }))

vi.mock('@/api/dismissalCalls', () => ({
  acknowledgeDismissalCall: (...args) => acknowledgeDismissalCall(...args),
  completeDismissalCall: (...args) => completeDismissalCall(...args),
  getPortalDismissalCalls: vi.fn(() => Promise.resolve({ data: [] })),
}))

// ─── Mock usePortalDismissalAlerts（module-singleton）────
const activeCalls = ref([])
const fetchCallsMock = vi.fn()

vi.mock('@/composables/usePortalDismissalAlerts', () => ({
  usePortalDismissalAlerts: () => ({
    activeCalls,
    sortedCalls: computed(() => [...activeCalls.value]),
    pendingCount: computed(() => activeCalls.value.length),
    loading: ref(false),
    liveAnnounce: ref(''),
    wsConnected: ref(true),
    connectionState: computed(() => 'normal'),
    connectionMessage: computed(() => '網路可能暫時不穩'),
    muted: ref(false),
    audioUnlocked: ref(true),
    notificationSupported: ref(false),
    toggleMute: vi.fn(),
    unlockAudio: vi.fn(),
    playBeep: vi.fn(),
    triggerHaptic: vi.fn(),
    fetchCalls: fetchCallsMock,
    retryWebSocket: vi.fn(),
  }),
}))

// ─── Mock useDismissalUrgency（useNowClock 供計時）────────
vi.mock('@/composables/useDismissalUrgency', () => ({
  useNowClock: () => ({ now: ref(new Date()) }),
  sortByOldestFirst: (calls) => [...calls],
}))

// ─── Mock element-plus（ElMessageBox.confirm 給 handleComplete）
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    ElMessageBox: Object.assign(vi.fn(() => Promise.resolve()), {
      confirm: vi.fn(() => Promise.resolve()),
    }),
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

vi.stubGlobal('Notification', { permission: 'denied', requestPermission: vi.fn() })

// ─── Helpers ─────────────────────────────────────────────
const SAMPLE_CALL = {
  id: 1,
  student_id: 10,
  student_name: '小明',
  classroom_id: 5,
  classroom_name: '向日葵班',
  status: 'pending',
  requested_at: new Date().toISOString(),
  note: null,
}

function mountView() {
  return shallowMount(PortalDismissalCallsView, {
    global: {
      stubs: {
        'el-card': { template: '<div><slot /></div>' },
        'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
        'el-tag': { template: '<span><slot /></span>' },
        'el-empty': { template: '<div />' },
        DismissalCallCard: { template: '<div><slot name="action" /></div>' },
      },
    },
  })
}

// ─── Tests ───────────────────────────────────────────────
describe('PortalDismissalCallsView（純消費者）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    activeCalls.value = []
  })

  it('掛載後應呼叫 fetchCalls 補抓最新', async () => {
    mountView()
    await nextTick()
    expect(fetchCallsMock).toHaveBeenCalled()
  })

  it('handleAcknowledge: 確認後應更新 activeCalls 中的 status', async () => {
    activeCalls.value = [{ ...SAMPLE_CALL }]
    const wrapper = mountView()
    await nextTick()
    await wrapper.vm.handleAcknowledge({ ...SAMPLE_CALL })
    expect(acknowledgeDismissalCall).toHaveBeenCalledWith(SAMPLE_CALL.id)
    expect(activeCalls.value[0].status).toBe('acknowledged')
  })

  it('handleAcknowledge: API 失敗時 activeCalls 不變', async () => {
    activeCalls.value = [{ ...SAMPLE_CALL }]
    acknowledgeDismissalCall.mockRejectedValueOnce(new Error('fail'))
    const wrapper = mountView()
    await nextTick()
    await wrapper.vm.handleAcknowledge({ ...SAMPLE_CALL })
    expect(activeCalls.value[0].status).toBe('pending')
  })

  it('handleComplete: 完成後應從 activeCalls 移除', async () => {
    activeCalls.value = [{ ...SAMPLE_CALL }]
    const wrapper = mountView()
    await flushPromises()
    await wrapper.vm.handleComplete({ ...SAMPLE_CALL })
    expect(completeDismissalCall).toHaveBeenCalledWith(SAMPLE_CALL.id)
    expect(activeCalls.value).toHaveLength(0)
  })

  it('handleComplete: 使用者取消確認時 completeDismissalCall 不被呼叫', async () => {
    const { ElMessageBox } = await import('element-plus')
    ElMessageBox.confirm.mockRejectedValueOnce(new Error('cancel'))
    activeCalls.value = [{ ...SAMPLE_CALL }]
    const wrapper = mountView()
    await flushPromises()
    await wrapper.vm.handleComplete({ ...SAMPLE_CALL })
    expect(completeDismissalCall).not.toHaveBeenCalled()
    expect(activeCalls.value).toHaveLength(1)
  })
})
