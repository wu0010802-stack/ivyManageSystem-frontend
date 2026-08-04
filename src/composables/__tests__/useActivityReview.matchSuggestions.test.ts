/**
 * 待審核審核工作流：相似姓名建議 + 重新比對可改班級（2026-08-04）。
 *
 * 背景：比對鍵在 2026-08-03 收斂為「姓名 + 班級」，姓名成為唯一的自由輸入身分欄位。
 * 自動比對只認正規化後完全相等的姓名（誤綁 = 把 A 小孩的報名掛到 B 小孩身上），
 * 名冊拆字／異體字／漏複姓永遠不會自動配上，而搜尋框是 ilike 子字串比對，同樣撈
 * 不到「薛旆青 vs 薛斾青」。承辦因此得在名冊裡大海撈針。
 *
 * 兩項補強：
 * 1. 開啟手動匹配／逐筆審核時自動載入系統建議（依姓名相似度）
 * 2. 重新比對對話框補上班級欄位——後端 rematch 一直支援改班級，只是前端沒給欄位，
 *    導致「家長選錯班」的報名在後台沒有一步到位的修法
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const matchRegistration = vi.fn().mockResolvedValue({ data: {} })
const rematchRegistration = vi.fn().mockResolvedValue({ data: { matched: true } })
const searchActivityStudents = vi.fn().mockResolvedValue({ data: { items: [] } })
const fetchMatchSuggestions = vi.fn()

vi.mock('@/api/activity', () => ({
  matchRegistration: (...a: unknown[]) => matchRegistration(...a),
  rejectRegistration: vi.fn(),
  rematchRegistration: (...a: unknown[]) => rematchRegistration(...a),
  rematchAllPendingRegistrations: vi.fn(),
  forceAcceptRegistration: vi.fn().mockResolvedValue({ data: {} }),
  restoreRegistration: vi.fn(),
  searchActivityStudents: (...a: unknown[]) => searchActivityStudents(...a),
  fetchMatchSuggestions: (...a: unknown[]) => fetchMatchSuggestions(...a),
}))

vi.mock('element-plus', () => ({
  ElMessage: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
  ElMessageBox: { prompt: vi.fn(), confirm: vi.fn() },
}))

import { useActivityReview } from '@/composables/useActivityReview'

const SUGGESTIONS = [
  { id: 7, name: '薛旆青', classroom_name: '櫻花', similarity: 0.67, same_class: true },
  { id: 9, name: '薛旆菁', classroom_name: '蒲公英', similarity: 0.67, same_class: false },
]

function setup() {
  return useActivityReview({ onChanged: vi.fn(), clearSelection: vi.fn() })
}

const ROW = { id: 12, student_name: '薛斾青', class_name: '櫻花', birthday: '', parent_phone: '0912345678' }

beforeEach(() => {
  vi.clearAllMocks()
  fetchMatchSuggestions.mockResolvedValue({ data: { items: SUGGESTIONS } })
})

describe('手動匹配的系統建議', () => {
  it('開啟對話框時載入建議', async () => {
    const review = setup()
    review.openMatchDialog(ROW)
    await vi.waitFor(() => expect(review.matchDialog.suggestions.length).toBe(2))

    expect(fetchMatchSuggestions).toHaveBeenCalledWith(12)
    expect(review.matchDialog.suggestions[0].name).toBe('薛旆青')
    expect(review.matchDialog.suggestionsLoading).toBe(false)
  })

  it('建議載入失敗不打斷手動匹配（承辦仍可用搜尋框）', async () => {
    fetchMatchSuggestions.mockRejectedValueOnce(new Error('boom'))
    const review = setup()
    review.openMatchDialog(ROW)
    await vi.waitFor(() => expect(review.matchDialog.suggestionsLoading).toBe(false))

    expect(review.matchDialog.suggestions).toEqual([])
    expect(review.matchDialog.visible).toBe(true)
  })

  it('建議不會自動選取——綁定必須由人決定', async () => {
    const review = setup()
    review.openMatchDialog(ROW)
    await vi.waitFor(() => expect(review.matchDialog.suggestions.length).toBe(2))

    expect(review.matchDialog.selected).toBeNull()
    expect(matchRegistration).not.toHaveBeenCalled()
  })

  it('逐筆審核精靈同樣載入建議', async () => {
    const review = setup()
    review.openWizard([ROW])
    await vi.waitFor(() => expect(review.wizard.suggestions.length).toBe(2))

    expect(review.wizard.suggestions[0].name).toBe('薛旆青')
  })
})

describe('重新比對可修正班級', () => {
  it('班級變更會帶進 payload', async () => {
    const review = setup()
    review.openRematchDialog(ROW)
    review.editDialog.form.class_name = '蒲公英'
    await review.confirmEdit()

    expect(rematchRegistration).toHaveBeenCalledWith(12, expect.objectContaining({ class: '蒲公英' }))
  })

  it('班級未變更時不帶 class（避免無謂的 field_changed）', async () => {
    const review = setup()
    review.openRematchDialog(ROW)
    await review.confirmEdit()

    const payload = rematchRegistration.mock.calls[0][1]
    expect(payload).not.toHaveProperty('class')
  })

  it('開啟對話框時帶入報名現有班級', () => {
    const review = setup()
    review.openRematchDialog(ROW)
    expect(review.editDialog.form.class_name).toBe('櫻花')
  })
})
