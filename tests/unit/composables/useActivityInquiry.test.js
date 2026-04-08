import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── API mocks ──────────────────────────────────────────────────────────────
const publicCreateInquiry = vi.fn()

vi.mock('@/api/activityPublic', () => ({
  publicCreateInquiry: (...a) => publicCreateInquiry(...a),
}))

// ── Element Plus mocks ─────────────────────────────────────────────────────
const ElMessageSuccess = vi.fn()
const ElMessageError = vi.fn()

vi.mock('element-plus', () => ({
  ElMessage: {
    success: (...a) => ElMessageSuccess(...a),
    error: (...a) => ElMessageError(...a),
  },
}))

// ────────────────────────────────────────────────────────────────── //

import { useActivityInquiry } from '@/composables/useActivityInquiry'

describe('useActivityInquiry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    publicCreateInquiry.mockResolvedValue({ data: {} })
  })

  it('openInquiryDrawer 預填 name 並清空 phone/question', () => {
    const { inquiry, inquiryDrawer, openInquiryDrawer } = useActivityInquiry()
    inquiry.phone = '0912345678'
    inquiry.question = '舊問題'

    openInquiryDrawer('王小明')

    expect(inquiry.name).toBe('王小明')
    expect(inquiry.phone).toBe('')
    expect(inquiry.question).toBe('')
    expect(inquiryDrawer.value).toBe(true)
  })

  it('openInquiryDrawer 無 prefillName 時 name 為空字串', () => {
    const { inquiry, openInquiryDrawer } = useActivityInquiry()

    openInquiryDrawer()

    expect(inquiry.name).toBe('')
  })

  it('submitInquiry 成功後關閉 drawer', async () => {
    const { inquiryDrawer, inquiry, submitInquiry, openInquiryDrawer } = useActivityInquiry()
    openInquiryDrawer('王小明')
    inquiry.phone = '0912345678'
    inquiry.question = '請問課程內容？'

    await submitInquiry()

    expect(ElMessageSuccess).toHaveBeenCalledWith('提問已送出，我們會盡快回覆')
    expect(inquiryDrawer.value).toBe(false)
  })

  it('submitInquiry 失敗後不關閉 drawer', async () => {
    const err = { response: { data: { detail: '送出失敗' } } }
    publicCreateInquiry.mockRejectedValue(err)

    const { inquiryDrawer, openInquiryDrawer, submitInquiry } = useActivityInquiry()
    openInquiryDrawer('王小明')

    await submitInquiry()

    expect(ElMessageError).toHaveBeenCalledWith('送出失敗')
    expect(inquiryDrawer.value).toBe(true)
  })
})
