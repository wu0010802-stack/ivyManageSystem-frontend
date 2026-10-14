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
    // 單筆重試會真的打 API；這裡只驗證按鈕把哪一筆交給它
    retryParentOp: vi.fn().mockResolvedValue({
      succeeded: 0, needs_review: 0, kept: 1, auth_failed: false,
    }),
  }
})

import ParentOfflineIndicator from '../ParentOfflineIndicator.vue'
import { enqueueOp, OP_KINDS, OP_STATUS, updateOp, clearAll, listOps } from '@/utils/offlineQueue'
import { useParentAuthStore } from '@/parent/stores/parentAuth'
import { flushAllParent, retryParentOp } from '@/parent/utils/parentOfflineQueue'

/** 建一筆「無法同步」的請假 op。 */
async function seedReviewLeave(lastError: unknown = '這段期間已有請假紀錄') {
  const op = await enqueueOp({
    kind: OP_KINDS.PARENT_LEAVE_REQUEST,
    payload: { student_id: 3, leave_type: '病假', start_date: '2026-10-14', end_date: '2026-10-15' },
    userId: 7,
  })
  await updateOp(op.id, { status: OP_STATUS.NEEDS_REVIEW, last_error: lastError })
  return op
}

/** 對話框 teleport 到 body，查詢一律走 document。 */
function dialog(): HTMLElement | null {
  return document.querySelector('[data-testid="review-dialog"]')
}

async function openReview(wrapper: ReturnType<typeof mount>) {
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="open-review"]').exists()).toBe(true)
  })
  await wrapper.find('[data-testid="open-review"]').trigger('click')
  await vi.waitFor(() => expect(dialog()).not.toBeNull())
}

describe('ParentOfflineIndicator', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await clearAll()
    vi.mocked(useParentAuthStore).mockReturnValue({ user: { user_id: 7 } } as any)
    vi.mocked(flushAllParent).mockClear()
    vi.mocked(retryParentOp).mockClear()
  })

  it('0 pending + 0 needs_review → 不顯示', async () => {
    const wrapper = mount(ParentOfflineIndicator, {
      global: { plugins: [ElementPlus] },
    })
    await vi.waitFor(() => {
      expect(wrapper.text()).not.toContain('等待同步')
      expect(wrapper.text()).not.toContain('無法同步')
    })
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
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('3 筆等待同步')
    })
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
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('無法同步')
    })
  })

  it('review 對話框：kind 顯示中文名稱、內容摘要；last_error 以純文字呈現（C47 防 XSS）', async () => {
    await seedReviewLeave('<img src=x onerror=alert(1)>')
    const wrapper = mount(ParentOfflineIndicator, { attachTo: document.body })
    await openReview(wrapper)

    const text = dialog()!.textContent ?? ''
    expect(text).toContain('請假申請')
    expect(text).toContain('病假 2026-10-14～2026-10-15')
    expect(text).not.toContain('parent_leave_request')
    // HTML 不得被解析成元素，只能以文字出現
    expect(dialog()!.querySelector('img')).toBeNull()
    expect(document.querySelector('[data-testid="review-error"]')!.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('關閉／ESC 只關閉對話框，不導去聯絡簿', async () => {
    await seedReviewLeave()
    const before = window.location.href
    const wrapper = mount(ParentOfflineIndicator, { attachTo: document.body })
    await openReview(wrapper)

    ;(document.querySelector('[data-testid="close-review"]') as HTMLElement).click()
    await vi.waitFor(() => expect(dialog()).toBeNull())
    expect(window.location.href).toBe(before)

    await openReview(wrapper)
    const overlay = document.querySelector('.modal-overlay') as HTMLElement
    overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await vi.waitFor(() => expect(dialog()).toBeNull())
    expect(window.location.href).toBe(before)
  })

  it('逐筆重試：把該筆交給 retryParentOp', async () => {
    const op = await seedReviewLeave()
    const wrapper = mount(ParentOfflineIndicator, { attachTo: document.body })
    await openReview(wrapper)

    ;(document.querySelector('[data-testid="retry-one"]') as HTMLElement).click()
    await vi.waitFor(() => expect(retryParentOp).toHaveBeenCalled())
    expect(vi.mocked(retryParentOp).mock.calls[0][0]).toMatchObject({ id: op.id, kind: OP_KINDS.PARENT_LEAVE_REQUEST })
  })

  it('逐筆捨棄：要第二次確認才刪除；全部處理完對話框自動收起', async () => {
    await seedReviewLeave()
    const wrapper = mount(ParentOfflineIndicator, { attachTo: document.body })
    await openReview(wrapper)

    ;(document.querySelector('[data-testid="discard"]') as HTMLElement).click()
    await vi.waitFor(() => expect(document.querySelector('[data-testid="confirm-discard"]')).not.toBeNull())
    // 尚未確認前不得刪除
    expect(await listOps({ kind: OP_KINDS.PARENT_LEAVE_REQUEST, status: OP_STATUS.NEEDS_REVIEW, userId: 7 })).toHaveLength(1)

    ;(document.querySelector('[data-testid="confirm-discard"]') as HTMLElement).click()
    await vi.waitFor(async () => {
      expect(await listOps({ kind: OP_KINDS.PARENT_LEAVE_REQUEST, status: OP_STATUS.NEEDS_REVIEW, userId: 7 })).toHaveLength(0)
    })
    await vi.waitFor(() => expect(dialog()).toBeNull())
    expect(wrapper.text()).not.toContain('無法同步')
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
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="manual-flush"]').exists()).toBe(true)
    })
    await wrapper.find('[data-testid="manual-flush"]').trigger('click')
    expect(flushAllParent).toHaveBeenCalled()
  })
})
