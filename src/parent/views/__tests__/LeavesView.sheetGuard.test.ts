// @vitest-environment jsdom
/** 請假 sheet：改過內容後點背景先在 sheet 內確認放棄，沒改過直接關。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'

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
  enqueueParent: vi.fn(),
  flushParentQueue: vi.fn().mockResolvedValue({}),
  listParentQueued: vi.fn().mockResolvedValue([]),
  onParentQueueChange: vi.fn(() => () => {}),
}))
vi.mock('@/parent/api/leaves', () => ({
  listLeaves: vi.fn().mockResolvedValue({ data: { items: [] } }),
  createLeave: vi.fn(), cancelLeave: vi.fn(),
  uploadLeaveAttachment: vi.fn(), deleteLeaveAttachment: vi.fn(), getLeave: vi.fn(),
}))
vi.mock('@/parent/composables/useIncrementalRender', () => ({
  useIncrementalRender: (items: unknown) => ({ visible: items, sentinelRef: ref(null), hasMore: ref(false) }),
}))
import LeavesView from '../LeavesView.vue'

const wrappers: VueWrapper[] = []
async function openSheet() {
  const w = mount(LeavesView, {
    attachTo: document.body,
    global: {
      stubs: {
        teleport: true,
        ChildContextHeader: true, ConfirmDialog: true, LeaveDetailSheet: true,
        PullToRefresh: { template: '<div><slot /></div>' },
      },
    },
  })
  wrappers.push(w)
  await flushPromises()
  await w.find('.hero-cta').trigger('click')
  await flushPromises()
  return w
}

beforeEach(() => { selectedId.value = 1 })
afterEach(() => { wrappers.splice(0).forEach((w) => w.unmount()) })

describe('請假 sheet 關閉保護', () => {
  it('沒改過內容：點背景直接關閉', async () => {
    const w = await openSheet()
    expect(w.find('.leave-form').exists()).toBe(true)
    await w.find('.pt-bsheet-overlay').trigger('click')
    await flushPromises()
    expect(w.find('.leave-form').exists()).toBe(false)
  })

  it('填了原因後點背景：不關閉，改在 sheet 內問是否放棄；按「繼續填寫」保留內容', async () => {
    const w = await openSheet()
    await w.find('#leave-reason').setValue('發燒')
    await w.find('.pt-bsheet-overlay').trigger('click')
    await flushPromises()
    expect(w.find('.leave-form').exists()).toBe(true)
    expect(w.find('[data-testid="discard-prompt"]').exists()).toBe(true)

    await w.find('[data-testid="discard-keep"]').trigger('click')
    expect(w.find('[data-testid="discard-prompt"]').exists()).toBe(false)
    expect((w.find('#leave-reason').element as HTMLTextAreaElement).value).toBe('發燒')
  })

  it('按「放棄」才關閉；表單的「取消」鈕也走同一套確認', async () => {
    const w = await openSheet()
    await w.find('#leave-reason').setValue('發燒')
    await w.find('.leave-form .secondary-btn').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="discard-prompt"]').exists()).toBe(true)
    await w.find('[data-testid="discard-confirm"]').trigger('click')
    await flushPromises()
    expect(w.find('.leave-form').exists()).toBe(false)
  })
})
