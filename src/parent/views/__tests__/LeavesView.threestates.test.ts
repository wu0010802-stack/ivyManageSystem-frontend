// @vitest-environment jsdom
/** 請假列表三態：載入中骨架 → 載入失敗可重試 → 空狀態；失敗不得畫成「尚無請假紀錄」。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'

const h = vi.hoisted(() => ({
  leaves: vi.fn(),
  toastError: vi.fn(),
  listQueued: vi.fn(),
  queueListeners: [] as ((c: { succeededByKind: Record<string, number> }) => void)[],
}))
const selectedId = ref<number | null>(1)
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/parent/stores/children', () => ({
  useChildrenStore: () => ({
    items: [{ student_id: 1, name: '合成孩子甲' }],
    load: vi.fn().mockResolvedValue(undefined),
  }),
}))
vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: () => ({ selectedId, ensureSelected: vi.fn(), setSelected: vi.fn() }),
}))
vi.mock('@/parent/utils/toast', () => ({
  toast: { error: h.toastError, success: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock('@/parent/utils/parentOfflineQueue', () => ({
  enqueueParent: vi.fn(),
  flushParentQueue: vi.fn().mockResolvedValue({}),
  listParentQueued: h.listQueued,
  onParentQueueChange: vi.fn((cb: (c: { succeededByKind: Record<string, number> }) => void) => {
    h.queueListeners.push(cb)
    return () => {}
  }),
}))
vi.mock('@/parent/api/leaves', () => ({
  listLeaves: h.leaves, createLeave: vi.fn(), cancelLeave: vi.fn(),
  uploadLeaveAttachment: vi.fn(), deleteLeaveAttachment: vi.fn(), getLeave: vi.fn(),
}))
vi.mock('@/parent/composables/useIncrementalRender', () => ({
  useIncrementalRender: (items: unknown) => ({ visible: items, sentinelRef: ref(null), hasMore: ref(false) }),
}))
import LeavesView from '../LeavesView.vue'

const wrappers: VueWrapper[] = []
function mountView() {
  const w = mount(LeavesView, { global: { stubs: {
    ChildContextHeader: true, ParentBottomSheet: true, ConfirmDialog: true,
    LeaveDetailSheet: true, LeaveForm: true,
    PullToRefresh: { template: '<div><slot /></div>' },
  } } })
  wrappers.push(w)
  return w
}

beforeEach(() => {
  h.leaves.mockReset()
  h.toastError.mockReset()
  h.listQueued.mockReset()
  h.listQueued.mockResolvedValue([])
  h.queueListeners.length = 0
})
afterEach(() => { wrappers.splice(0).forEach((w) => w.unmount()) })

describe('LeavesView 三態', () => {
  it('載入中顯示骨架，不先畫「尚無請假紀錄」', async () => {
    h.leaves.mockReturnValue(new Promise(() => {}))
    const w = mountView()
    await flushPromises()
    expect(w.text()).not.toContain('尚無請假紀錄')
    expect(w.find('.leaves-skeleton').exists()).toBe(true)
  })

  it('載入失敗顯示可重試錯誤態；重試成功後回到清單', async () => {
    h.leaves.mockRejectedValueOnce({ displayMessage: '網路連線異常，請檢查網路' })
    const w = mountView()
    await flushPromises()
    expect(w.text()).not.toContain('尚無請假紀錄')
    expect(w.find('[role="alert"]').text()).toContain('網路連線異常')

    h.leaves.mockResolvedValueOnce({ data: { items: [] } })
    await w.find('.mobile-error-retry__btn').trigger('click')
    await flushPromises()
    expect(w.find('[role="alert"]').exists()).toBe(false)
    expect(w.text()).toContain('尚無請假紀錄')
  })

  it('真的沒有紀錄才顯示空狀態', async () => {
    h.leaves.mockResolvedValue({ data: { items: [] } })
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('尚無請假紀錄')
    expect(w.find('[role="alert"]').exists()).toBe(false)
  })
})

describe('LeavesView 離線暫存的請假', () => {
  const queuedOp = {
    id: 'op-1',
    kind: 'parent_leave_request',
    status: 'pending',
    payload: { student_id: 1, leave_type: '病假', start_date: '2026-10-14', end_date: '2026-10-15' },
  }

  it('佇列裡的請假顯示「待送出」佔位卡，不畫成「尚無請假紀錄」', async () => {
    h.leaves.mockResolvedValue({ data: { items: [] } })
    h.listQueued.mockResolvedValue([queuedOp])
    const w = mountView()
    await flushPromises()
    const card = w.find('[data-testid="queued-leave"]')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('待送出')
    expect(card.text()).toContain('合成孩子甲 病假')
    expect(card.text()).toContain('2026-10-14 ~ 2026-10-15')
    expect(w.text()).not.toContain('尚無請假紀錄')
  })

  it('無法同步的那筆標「無法送出」並指引去處理', async () => {
    h.leaves.mockResolvedValue({ data: { items: [] } })
    h.listQueued.mockResolvedValue([{ ...queuedOp, status: 'needs_review' }])
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-testid="queued-leave"]').text()).toContain('無法送出')
    expect(w.find('[data-testid="queued-leave"]').text()).toContain('無法同步')
  })

  it('背景補送成功 → 佔位卡消失並重抓清單', async () => {
    h.leaves.mockResolvedValue({ data: { items: [] } })
    h.listQueued.mockResolvedValueOnce([queuedOp])
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-testid="queued-leave"]').exists()).toBe(true)
    const callsBefore = h.leaves.mock.calls.length

    h.listQueued.mockResolvedValue([])
    h.queueListeners.forEach((cb) => cb({ succeededByKind: { parent_leave_request: 1 } }))
    await flushPromises()
    expect(w.find('[data-testid="queued-leave"]').exists()).toBe(false)
    expect(h.leaves.mock.calls.length).toBe(callsBefore + 1)
  })
})
