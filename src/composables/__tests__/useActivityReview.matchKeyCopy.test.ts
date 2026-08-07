/**
 * 重新比對確認框的「比對鍵」文案必須與後端實際規則一致（2026-08-06 稽核）。
 *
 * 背景：批量重新比對的確認框長年寫「姓名 + 生日 + 家長手機」，但後端
 * services/activity_student_sync.py `_match_student_with_class` 早已改掉：
 * - 2026-07-19 家長電話完全退出比對
 * - 2026-08-02 名冊生日為 NULL 時退階為「姓名 + 班級」
 * - 2026-08-03 公開報名表移除生日欄，新報名根本沒有生日可比
 * 承辦照著舊文案去改家長手機或補生日，比對結果不會有任何變化，白做工。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api/activity', () => ({
  matchRegistration: vi.fn().mockResolvedValue({ data: {} }),
  rejectRegistration: vi.fn().mockResolvedValue({ data: {} }),
  rematchRegistration: vi.fn().mockResolvedValue({ data: { matched: true } }),
  rematchAllPendingRegistrations: vi.fn().mockResolvedValue({ data: { message: '完成', failed: [] } }),
  forceAcceptRegistration: vi.fn().mockResolvedValue({ data: {} }),
  restoreRegistration: vi.fn().mockResolvedValue({ data: {} }),
  searchActivityStudents: vi.fn().mockResolvedValue({ data: { items: [] } }),
  fetchMatchSuggestions: vi.fn().mockResolvedValue({ data: { items: [] } }),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn(), prompt: vi.fn() },
}))

import { ElMessageBox } from 'element-plus'
import { useActivityReview } from '@/composables/useActivityReview'

const confirmMock = ElMessageBox.confirm as unknown as ReturnType<typeof vi.fn>

/** 取本次 confirm 的訊息文字 */
function confirmMessage(): string {
  return String(confirmMock.mock.calls[0][0])
}

describe('useActivityReview 重新比對確認框文案', () => {
  beforeEach(() => {
    confirmMock.mockReset()
    confirmMock.mockResolvedValue('confirm')
  })

  it('批量重新比對：說明的比對鍵是「姓名 + 班級」，不得再宣稱家長手機／生日', async () => {
    const review = useActivityReview({ onChanged: vi.fn(), clearSelection: vi.fn() })

    await review.handleBatchRematch([{ id: 1 }, { id: 2 }])

    const msg = confirmMessage()
    expect(msg).toContain('姓名 + 班級')
    // 家長電話 2026-07-19 已退出比對；生日 2026-08-03 起公開表單根本不收
    expect(msg).not.toContain('家長手機')
    expect(msg).not.toContain('生日')
    // 原本就有的資訊不能被改掉：筆數與比對後的去向
    expect(msg).toContain('2 筆')
    expect(msg).toContain('其餘維持待審核')
  })

  it('工具列一鍵重新比對：比對鍵說明與批量版一致', async () => {
    const review = useActivityReview({ onChanged: vi.fn(), clearSelection: vi.fn() })

    await review.handleRematchAllPending({ school_year: 114, semester: 1 })

    const msg = confirmMessage()
    expect(msg).toContain('姓名 + 班級')
    expect(msg).not.toContain('家長手機')
    expect(msg).not.toContain('生日')
    expect(msg).toContain('目前學期')
  })
})
