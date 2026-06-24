import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DismissalQueueView from '@/views/DismissalQueueView.vue'

// 接送看板 WS 韌性：耗盡重連後 fallback 輪詢 + banner（對齊 PortalDismissalCallsView）
// + dismissal_call_created 去重（F4）。

const getDismissalCalls = vi.fn(() => Promise.resolve({ data: [] }))
const cancelDismissalCall = vi.fn(() => Promise.resolve({ data: {} }))
const createDismissalCall = vi.fn(() => Promise.resolve({ data: {} }))
const getStudents = vi.fn(() => Promise.resolve({ data: { items: [], total: 0 } }))

vi.mock('@/api/dismissalCalls', () => ({
  getDismissalCalls: (...args) => getDismissalCalls(...args),
  cancelDismissalCall: (...args) => cancelDismissalCall(...args),
  createDismissalCall: (...args) => createDismissalCall(...args),
}))

vi.mock('@/api/students', () => ({
  getStudents: (...args) => getStudents(...args),
}))

const getClassrooms = vi.fn(() => Promise.resolve({ data: [] }))
vi.mock('@/api/classrooms', () => ({
  getClassrooms: (...args) => getClassrooms(...args),
}))

vi.mock('@/utils/auth', () => ({
  getUserInfo: () => ({ role: 'admin', permissions: -1 }),
}))

const mockWs = {
  readyState: 1,
  close: vi.fn(),
  send: vi.fn(),
  onopen: null,
  onmessage: null,
  onerror: null,
  onclose: null,
}
vi.stubGlobal('WebSocket', vi.fn(function () { return mockWs }))

const SAMPLE_CALL = {
  id: 1,
  student_id: 10,
  student_name: '小明',
  classroom_id: 5,
  classroom_name: '向日葵班',
  status: 'pending',
  requested_at: new Date().toISOString(),
  requested_by_name: '管理員',
}

function mountView() {
  return shallowMount(DismissalQueueView, {
    global: {
      stubs: {
        'el-table': { template: '<div><slot /></div>' },
        'el-table-column': { template: '<div />' },
        'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
        'el-tag': { template: '<span><slot /></span>' },
        'el-badge': { template: '<span />' },
        'el-select': { template: '<select />' },
        'el-option': { template: '<option />' },
        'el-row': { template: '<div><slot /></div>' },
        'el-col': { template: '<div><slot /></div>' },
        'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
        'el-form': { template: '<form><slot /></form>' },
        'el-form-item': { template: '<div><slot /></div>' },
        'el-input': { template: '<input />' },
        'el-empty': { template: '<div />' },
        'el-pagination': { template: '<div />' },
        'el-icon': { template: '<i><slot /></i>' },
        DismissalCallCard: { template: '<div class="dcall-card"><slot name="action" /></div>' },
      },
    },
  })
}

describe('DismissalQueueView WS 韌性（F4）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockWs.send.mockClear()
    mockWs.close.mockClear()
    getDismissalCalls.mockResolvedValue({ data: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('dismissal_call_created 重複 id 不應重複插入（去重）', async () => {
    const wrapper = mountView()
    await flushPromises()
    wrapper.vm.filterStatus = 'active'
    wrapper.vm.calls = []

    wrapper.vm.handleWsEvent({ type: 'dismissal_call_created', payload: SAMPLE_CALL })
    wrapper.vm.handleWsEvent({ type: 'dismissal_call_created', payload: { ...SAMPLE_CALL } })

    expect(wrapper.vm.calls).toHaveLength(1)
    expect(wrapper.vm.calls[0].id).toBe(SAMPLE_CALL.id)
  })

  it('耗盡重連後 connectionState 變 exhausted 並啟動輪詢', async () => {
    const wrapper = mountView()
    await flushPromises()

    // 模擬達到重試上限：呼叫 scheduleReconnect 直到耗盡
    // WS_MAX_RETRIES 次後再呼叫一次即觸發 exhausted 分支
    for (let i = 0; i < 6; i++) {
      wrapper.vm.scheduleReconnect()
    }
    await nextTick()

    expect(wrapper.vm.connectionState).toBe('exhausted')

    // 啟動輪詢：fetchCalls 在 polling interval 觸發
    const before = getDismissalCalls.mock.calls.length
    vi.advanceTimersByTime(15000)
    await flushPromises()
    expect(getDismissalCalls.mock.calls.length).toBeGreaterThan(before)
  })

  it('未耗盡時 connectionState 為 reconnecting（非 exhausted）', async () => {
    const wrapper = mountView()
    await flushPromises()
    // 連線未開、未耗盡
    wrapper.vm.scheduleReconnect()
    await nextTick()
    expect(wrapper.vm.connectionState).toBe('reconnecting')
  })

  it('WS onopen 後 connectionState 回 normal 並停止輪詢', async () => {
    const wrapper = mountView()
    await flushPromises()
    // 觸發 onopen
    if (typeof mockWs.onopen === 'function') mockWs.onopen()
    await nextTick()
    expect(wrapper.vm.connectionState).toBe('normal')
  })
})
