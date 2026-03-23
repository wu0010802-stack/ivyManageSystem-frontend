import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { shallowMount } from '@vue/test-utils'
import DismissalQueueView from '@/views/DismissalQueueView.vue'

// ─── Mock API ────────────────────────────────────────────
const getDismissalCalls = vi.fn(() => Promise.resolve({ data: [] }))
const cancelDismissalCall = vi.fn(() => Promise.resolve({ data: {} }))
const createDismissalCall = vi.fn(() => Promise.resolve({ data: {} }))
const getClassrooms = vi.fn(() => Promise.resolve({ data: [] }))
const getStudents = vi.fn(() => Promise.resolve({ data: { items: [], total: 0 } }))

vi.mock('@/api/dismissalCalls', () => ({
  getDismissalCalls: (...args) => getDismissalCalls(...args),
  cancelDismissalCall: (...args) => cancelDismissalCall(...args),
  createDismissalCall: (...args) => createDismissalCall(...args),
}))

vi.mock('@/api/classrooms', () => ({
  getClassrooms: (...args) => getClassrooms(...args),
}))

vi.mock('@/api/students', () => ({
  getStudents: (...args) => getStudents(...args),
}))

vi.mock('@/utils/auth', () => ({
  getUserInfo: () => ({ role: 'admin', permissions: -1 }),
}))

// ─── Mock WebSocket（不連線）─────────────────────────────
const mockWs = {
  readyState: 1, // OPEN
  close: vi.fn(),
  onopen: null,
  onmessage: null,
  onerror: null,
  onclose: null,
}
vi.stubGlobal('WebSocket', vi.fn(function () { return mockWs }))

// ─── Helpers ─────────────────────────────────────────────
const SAMPLE_CALL = {
  id: 1,
  student_id: 10,
  student_name: '小明',
  classroom_id: 5,
  classroom_name: '向日葵班',
  status: 'pending',
  requested_at: new Date().toISOString(),
  requested_by_name: '管理員',
  acknowledged_at: null,
  completed_at: null,
  note: null,
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
      },
    },
  })
}

// ─── Tests ───────────────────────────────────────────────
describe('DismissalQueueView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDismissalCalls.mockResolvedValue({ data: [] })
    getClassrooms.mockResolvedValue({ data: [] })
  })

  it('掛載後應呼叫 getDismissalCalls 與 getClassrooms', async () => {
    mountView()
    await nextTick()
    expect(getDismissalCalls).toHaveBeenCalled()
    expect(getClassrooms).toHaveBeenCalled()
  })

  it('fetchCalls 成功後 calls 陣列應更新', async () => {
    getDismissalCalls.mockResolvedValue({ data: [SAMPLE_CALL] })
    const wrapper = mountView()
    await nextTick()
    // filter=active 會分兩次查 pending + acknowledged
    expect(getDismissalCalls).toHaveBeenCalledTimes(2)
  })

  it('filterStatus 為 all 時只呼叫一次 getDismissalCalls', async () => {
    getDismissalCalls.mockResolvedValue({ data: [SAMPLE_CALL] })
    const wrapper = mountView()
    await nextTick()
    vi.clearAllMocks()
    getDismissalCalls.mockResolvedValue({ data: [SAMPLE_CALL] })

    wrapper.vm.filterStatus = 'all'
    await wrapper.vm.fetchCalls()
    expect(getDismissalCalls).toHaveBeenCalledTimes(1)
  })

  it('statusLabel 對應正確中文標籤', () => {
    const wrapper = mountView()
    expect(wrapper.vm.statusLabel('pending')).toBe('待老師確認')
    expect(wrapper.vm.statusLabel('acknowledged')).toBe('老師已收到')
    expect(wrapper.vm.statusLabel('completed')).toBe('已放學')
    expect(wrapper.vm.statusLabel('cancelled')).toBe('已取消')
  })

  it('statusType 對應正確 Element Plus tag type', () => {
    const wrapper = mountView()
    expect(wrapper.vm.statusType('pending')).toBe('warning')
    expect(wrapper.vm.statusType('acknowledged')).toBe('primary')
    expect(wrapper.vm.statusType('completed')).toBe('success')
    expect(wrapper.vm.statusType('cancelled')).toBe('info')
  })

  it('handleWsEvent: dismissal_call_created 應插入 calls 陣列', async () => {
    getDismissalCalls.mockResolvedValue({ data: [] })
    const wrapper = mountView()
    await nextTick()
    wrapper.vm.filterStatus = 'active'
    wrapper.vm.calls = []

    wrapper.vm.handleWsEvent({ type: 'dismissal_call_created', payload: SAMPLE_CALL })
    expect(wrapper.vm.calls).toHaveLength(1)
    expect(wrapper.vm.calls[0].id).toBe(SAMPLE_CALL.id)
  })

  it('handleWsEvent: dismissal_call_updated 應更新現有 call', async () => {
    getDismissalCalls.mockResolvedValue({ data: [] })
    const wrapper = mountView()
    await nextTick()
    wrapper.vm.calls = [{ ...SAMPLE_CALL }]

    wrapper.vm.handleWsEvent({
      type: 'dismissal_call_updated',
      payload: { ...SAMPLE_CALL, status: 'acknowledged' },
    })
    expect(wrapper.vm.calls[0].status).toBe('acknowledged')
  })

  it('handleWsEvent: dismissal_call_cancelled 應從 active 列表移除', async () => {
    getDismissalCalls.mockResolvedValue({ data: [] })
    const wrapper = mountView()
    await nextTick()
    wrapper.vm.filterStatus = 'active'
    wrapper.vm.calls = [{ ...SAMPLE_CALL }]

    wrapper.vm.handleWsEvent({ type: 'dismissal_call_cancelled', payload: SAMPLE_CALL })
    expect(wrapper.vm.calls).toHaveLength(0)
  })
})
