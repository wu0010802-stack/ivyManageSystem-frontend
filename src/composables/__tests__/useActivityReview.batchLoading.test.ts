import { describe, it, expect, vi } from 'vitest'

// P3-1（第六輪 bug hunt）：批量審核動作的 batchProcessing loading 態在 onChanged
// （= fetchList 重查）resolve 之前就於 finally 解除，短暫窗口內按鈕可再次點擊、
// 表格仍是舊資料。修法：批量 handler 於 finally 前 await opts.onChanged()。

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockResolvedValue('confirm'), prompt: vi.fn() },
}))

const rejectRegistration = vi.fn().mockResolvedValue({ data: {} })
const matchRegistration = vi.fn().mockResolvedValue({ data: {} })
const rematchRegistration = vi.fn().mockResolvedValue({ data: { matched: true } })
const rematchAllPendingRegistrations = vi.fn().mockResolvedValue({ data: { message: '完成', failed: [] } })
const forceAcceptRegistration = vi.fn().mockResolvedValue({ data: {} })
const restoreRegistration = vi.fn().mockResolvedValue({ data: {} })
vi.mock('@/api/activity', () => ({
  matchRegistration: (...a: unknown[]) => matchRegistration(...a),
  rejectRegistration: (...a: unknown[]) => rejectRegistration(...a),
  rematchRegistration: (...a: unknown[]) => rematchRegistration(...a),
  rematchAllPendingRegistrations: (...a: unknown[]) => rematchAllPendingRegistrations(...a),
  forceAcceptRegistration: (...a: unknown[]) => forceAcceptRegistration(...a),
  restoreRegistration: (...a: unknown[]) => restoreRegistration(...a),
  searchActivityStudents: vi.fn(),
}))

import { useActivityReview } from '@/composables/useActivityReview'

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('useActivityReview 批量 loading 態時序（P3-1）', () => {
  it('batchProcessing 維持 true 直到 onChanged (refetch) resolve', async () => {
    let resolveRefetch!: () => void
    const refetch = new Promise<void>((r) => {
      resolveRefetch = r
    })
    const onChanged = vi.fn(() => refetch)
    const clearSelection = vi.fn()
    const review = useActivityReview({ onChanged, clearSelection })

    const done = review.handleBatchForceAccept([{ id: 1 }])
    await flush() // 跑完 confirm + forceAccept + clearSelection，卡在 await onChanged

    expect(onChanged).toHaveBeenCalledTimes(1)
    // refetch 尚未 resolve → loading 態必須仍為 true（修前此處為 false）
    expect(review.batchProcessing.value).toBe(true)

    resolveRefetch()
    await done
    expect(review.batchProcessing.value).toBe(false)
  })

  it('四個批量動作皆在 refetch resolve 後才解除 loading', async () => {
    const handlers: Array<'handleBatchRematch' | 'handleBatchForceAccept' | 'handleBatchReject' | 'handleBatchRestore'> = [
      'handleBatchRematch',
      'handleBatchForceAccept',
      'handleBatchReject',
      'handleBatchRestore',
    ]
    const { ElMessageBox } = await import('element-plus')
    // handleBatchReject 走 prompt（需回傳 reason）
    ;(ElMessageBox.prompt as ReturnType<typeof vi.fn>).mockResolvedValue({ value: '原因測試' })

    for (const name of handlers) {
      let resolveRefetch!: () => void
      const refetch = new Promise<void>((r) => {
        resolveRefetch = r
      })
      const review = useActivityReview({ onChanged: () => refetch, clearSelection: vi.fn() })
      const done = review[name]([{ id: 1 }])
      await flush()
      expect(review.batchProcessing.value, `${name} 應在 refetch 前維持 loading`).toBe(true)
      resolveRefetch()
      await done
      expect(review.batchProcessing.value, `${name} 應在 refetch 後解除 loading`).toBe(false)
    }
  })
})

// 2026-07-23：報名管理頁工具列「重新比對」改為一鍵批次（不需勾選），呼叫新的
// POST /registrations/rematch-batch；沿用同款 P3-1 loading 時序規範。
describe('useActivityReview 工具列一鍵重新比對（rematchAllLoading）', () => {
  it('rematchAllLoading 維持 true 直到 onChanged (refetch) resolve', async () => {
    let resolveRefetch!: () => void
    const refetch = new Promise<void>((r) => {
      resolveRefetch = r
    })
    const onChanged = vi.fn(() => refetch)
    const review = useActivityReview({ onChanged, clearSelection: vi.fn() })

    const done = review.handleRematchAllPending({ school_year: 114, semester: 1 })
    await flush()

    expect(rematchAllPendingRegistrations).toHaveBeenCalledWith({ school_year: 114, semester: 1 })
    expect(review.rematchAllLoading.value).toBe(true)

    resolveRefetch()
    await done
    expect(review.rematchAllLoading.value).toBe(false)
  })

  it('使用者取消確認對話框時不呼叫 API、不進入 loading', async () => {
    rematchAllPendingRegistrations.mockClear()
    const { ElMessageBox } = await import('element-plus')
    ;(ElMessageBox.confirm as ReturnType<typeof vi.fn>).mockRejectedValueOnce('cancel')
    const review = useActivityReview({ onChanged: vi.fn(), clearSelection: vi.fn() })

    await review.handleRematchAllPending({ school_year: 114, semester: 1 })

    expect(rematchAllPendingRegistrations).not.toHaveBeenCalled()
    expect(review.rematchAllLoading.value).toBe(false)
  })
})

describe('useActivityReview 逐筆精靈送出競態', () => {
  it('匹配請求進行中略過不會讓索引前進兩次', async () => {
    let resolveMatch!: () => void
    matchRegistration.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveMatch = () => resolve({ data: {} })
      }),
    )
    const review = useActivityReview({ onChanged: vi.fn(), clearSelection: vi.fn() })
    review.openWizard([{ id: 1 }, { id: 2 }, { id: 3 }])
    review.wizard.selected = { id: 99 }

    const done = review.wizardMatch()
    await flush()
    expect(review.wizard.submitting).toBe(true)

    review.wizardSkip()
    expect(review.wizard.index).toBe(0)
    expect(review.wizard.done.skipped).toBe(0)

    resolveMatch()
    await done
    expect(review.wizard.index).toBe(1)
    expect(review.wizard.done.matched).toBe(1)
  })
})
