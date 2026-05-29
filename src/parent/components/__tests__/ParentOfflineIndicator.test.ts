import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import 'fake-indexeddb/auto'
import ElementPlus from 'element-plus'

// Mock at top level（避免 vitest hoisting issue）
vi.mock('@/parent/stores/parentAuth', () => ({
  useParentAuthStore: vi.fn(),
}))

vi.mock('@/parent/utils/parentOfflineQueue', async () => {
  const actual = await vi.importActual<typeof import('@/parent/utils/parentOfflineQueue')>('@/parent/utils/parentOfflineQueue')
  return {
    ...actual,
    flushAllParent: vi.fn().mockResolvedValue({
      succeeded: 1, needs_review: 0, kept: 0, auth_failed: false,
    }),
  }
})

import ParentOfflineIndicator from '../ParentOfflineIndicator.vue'
import { enqueueOp, OP_KINDS, OP_STATUS, updateOp, clearAll } from '@/utils/offlineQueue'
import { useParentAuthStore } from '@/parent/stores/parentAuth'
import { flushAllParent } from '@/parent/utils/parentOfflineQueue'

describe('ParentOfflineIndicator', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await clearAll()
    vi.mocked(useParentAuthStore).mockReturnValue({ user: { user_id: 7 } } as any)
    vi.mocked(flushAllParent).mockClear()
  })

  it('0 pending + 0 needs_review → 不顯示', async () => {
    const wrapper = mount(ParentOfflineIndicator, {
      global: { plugins: [ElementPlus] },
    })
    await new Promise((r) => setTimeout(r, 100))
    expect(wrapper.text()).not.toContain('等待同步')
    expect(wrapper.text()).not.toContain('無法同步')
  })

  it('N pending → 顯示「N 筆等待同步」', async () => {
    for (let i = 0; i < 3; i++) {
      await enqueueOp({
        kind: OP_KINDS.PARENT_MESSAGE,
        payload: { content: 'x' },
        userId: 7,
      })
    }
    const wrapper = mount(ParentOfflineIndicator, {
      global: { plugins: [ElementPlus] },
    })
    await new Promise((r) => setTimeout(r, 100))
    expect(wrapper.text()).toContain('3 筆等待同步')
  })

  it('K needs_review → 顯示「K 筆無法同步」', async () => {
    const op = await enqueueOp({
      kind: OP_KINDS.PARENT_MESSAGE,
      payload: { content: 'x' },
      userId: 7,
    })
    await updateOp(op.id, { status: OP_STATUS.NEEDS_REVIEW })
    const wrapper = mount(ParentOfflineIndicator, {
      global: { plugins: [ElementPlus] },
    })
    await new Promise((r) => setTimeout(r, 100))
    expect(wrapper.text()).toContain('無法同步')
  })

  it('點按 pending banner 觸 flushAllParent', async () => {
    await enqueueOp({
      kind: OP_KINDS.PARENT_MESSAGE,
      payload: { content: 'x' },
      userId: 7,
    })
    const wrapper = mount(ParentOfflineIndicator, {
      global: { plugins: [ElementPlus] },
    })
    await new Promise((r) => setTimeout(r, 100))
    await wrapper.find('[data-testid="manual-flush"]').trigger('click')
    expect(flushAllParent).toHaveBeenCalled()
  })
})
