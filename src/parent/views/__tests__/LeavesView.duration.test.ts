// @vitest-environment jsdom
/** F08：請假概況天數——優先用 duration_days，缺欄時 fallback 為期間內週一～週五天數。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'

const h = vi.hoisted(() => ({ leaves: vi.fn() }))
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
vi.mock('@/parent/utils/toast', () => ({ toast: { error: vi.fn(), success: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/parent/utils/parentOfflineQueue', () => ({
  enqueueParent: vi.fn(), flushParentQueue: vi.fn().mockResolvedValue({}),
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
function leave(id: number, start: string, end: string, extra: Record<string, unknown> = {}) {
  return {
    id, student_id: 1, leave_type: '病假', start_date: start, end_date: end,
    status: 'approved', reason: null, review_note: null, reviewed_at: null,
    created_at: `${start}T09:00:00`, updated_at: `${start}T09:00:00`, attachments: [], ...extra,
  }
}
async function total(items: unknown[]) {
  h.leaves.mockResolvedValue({ data: { items } })
  const w = mount(LeavesView, { global: { stubs: {
    ChildContextHeader: true, ParentBottomSheet: true, ConfirmDialog: true,
    LeaveDetailSheet: true, LeaveForm: true,
    PullToRefresh: { template: '<div><slot /></div>' },
  } } })
  wrappers.push(w)
  await flushPromises()
  return w.find('.leave-hero-num-val').text()
}
beforeEach(() => {
  h.leaves.mockReset()
  // 2026-10-05（週一）：學年度 115 內；只偽造 Date，避免干擾 promise／timer。
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 5, 10, 0, 0))
})
afterEach(() => { wrappers.splice(0).forEach((w) => w.unmount()); vi.useRealTimers() })

describe('LeavesView 請假天數（F08）', () => {
  it('後端未回 duration_days：一日請假算 1 天', async () => {
    expect(await total([leave(1, '2026-10-05', '2026-10-05')])).toBe('1')
  })
  it('缺欄 fallback 只算週一到週五（週五到下週一＝2 天）', async () => {
    expect(await total([leave(1, '2026-10-02', '2026-10-05')])).toBe('2')
  })
  it('整段落在週末＝0 天', async () => {
    expect(await total([leave(1, '2026-10-03', '2026-10-04')])).toBe('0')
  })
  it('duration_days 是有限數字時優先採用（含字串數字）', async () => {
    expect(await total([
      leave(1, '2026-10-05', '2026-10-09', { duration_days: 3 }),
      leave(2, '2026-10-12', '2026-10-12', { duration_days: '1' }),
    ])).toBe('4')
  })
})
