import { describe, expect, it } from 'vitest'
import {
  PAYMENT_STATUS_TAG_TYPE,
  PAYMENT_STATUS_LABEL,
  COURSE_STATUS_TAG_TYPE,
  COURSE_STATUS_LABEL,
  PAYMENT_METHODS,
  FIELD_RULES,
  REFUND_REASON_PATTERN,
  VOID_REASON_PATTERN,
  forceRefundReasonPromptOptions,
} from '@/constants/activity'

// 14 字 / 15 字樣本（後端 MIN_REFUND_REASON_LENGTH=15、MIN_VOID_REASON_LENGTH=5）
const REASON_14 = '一二三四五六七八九十一二三四'
const REASON_15 = '一二三四五六七八九十一二三四五'
const REASON_5 = '一二三四五'
const REASON_4 = '一二三四'

describe('activity constants', () => {
  describe('PAYMENT_STATUS_TAG_TYPE', () => {
    it('paid → success', () => expect(PAYMENT_STATUS_TAG_TYPE.paid).toBe('success'))
    it('partial → warning', () => expect(PAYMENT_STATUS_TAG_TYPE.partial).toBe('warning'))
    it('overpaid → danger', () => expect(PAYMENT_STATUS_TAG_TYPE.overpaid).toBe('danger'))
    it('unpaid → danger', () => expect(PAYMENT_STATUS_TAG_TYPE.unpaid).toBe('danger'))
    it('no_fee → info（免繳中性色）', () => expect(PAYMENT_STATUS_TAG_TYPE.no_fee).toBe('info'))
  })

  describe('PAYMENT_STATUS_LABEL', () => {
    it('paid → 已繳費', () => expect(PAYMENT_STATUS_LABEL.paid).toBe('已繳費'))
    it('partial → 部分繳費', () => expect(PAYMENT_STATUS_LABEL.partial).toBe('部分繳費'))
    it('overpaid → 超繳', () => expect(PAYMENT_STATUS_LABEL.overpaid).toBe('超繳'))
    it('unpaid → 未繳費', () => expect(PAYMENT_STATUS_LABEL.unpaid).toBe('未繳費'))
    it('no_fee → 免繳（0 元/全候補，業主裁定 B 口徑不算結清）', () =>
      expect(PAYMENT_STATUS_LABEL.no_fee).toBe('免繳'))
  })

  describe('COURSE_STATUS_TAG_TYPE', () => {
    it('enrolled → success', () => expect(COURSE_STATUS_TAG_TYPE.enrolled).toBe('success'))
    it('waitlist → info', () => expect(COURSE_STATUS_TAG_TYPE.waitlist).toBe('info'))
  })

  describe('COURSE_STATUS_LABEL', () => {
    it('enrolled → 正式', () => expect(COURSE_STATUS_LABEL.enrolled).toBe('正式'))
    it('waitlist → 候補', () => expect(COURSE_STATUS_LABEL.waitlist).toBe('候補'))
  })

  describe('PAYMENT_METHODS', () => {
    // Finding (P2)：後端才藝 POS 為 cash-only（payment_method: Literal["現金"]）。
    // 前端原本提供「轉帳/其他」，使用者選非現金送出會 422。收斂成只剩現金，
    // 與後端契約對齊；未來後端支援多付款方式時再加回。
    it('cash-only：只含現金', () => {
      expect(PAYMENT_METHODS).toEqual(['現金'])
    })
    it('不再提供轉帳/其他（後端會 422）', () => {
      expect(PAYMENT_METHODS).not.toContain('轉帳')
      expect(PAYMENT_METHODS).not.toContain('其他')
    })
  })

  // 退費原因字數：後端 require_refund_reason / BatchPaymentUpdate / AddPaymentRequest
  // 都要求 ≥ MIN_REFUND_REASON_LENGTH=15；而軟刪 payment（VoidPaymentRequest）只要
  // MIN_VOID_REASON_LENGTH=5。前端沖帳/退費 prompt 過去誤用 voidReasonMin(5)，5-14 字
  // 會過前端、被後端 422。
  describe('退費原因字數常數（對齊後端 15 字）', () => {
    it('FIELD_RULES.refundReasonMin === 15', () => {
      expect(FIELD_RULES.refundReasonMin).toBe(15)
    })
    it('FIELD_RULES.refundReasonMax === 200', () => {
      expect(FIELD_RULES.refundReasonMax).toBe(200)
    })
    it('voidReasonMin 維持 5（軟刪 payment 仍只要 5 字，不可被連動改大）', () => {
      expect(FIELD_RULES.voidReasonMin).toBe(5)
    })

    it('REFUND_REASON_PATTERN 拒 14 字、收 15 字', () => {
      expect(REFUND_REASON_PATTERN.test(REASON_14)).toBe(false)
      expect(REFUND_REASON_PATTERN.test(REASON_15)).toBe(true)
    })
    it('VOID_REASON_PATTERN 仍收 5 字（軟刪門檻不變）', () => {
      expect(VOID_REASON_PATTERN.test(REASON_5)).toBe(true)
      expect(VOID_REASON_PATTERN.test(REASON_4)).toBe(false)
    })
  })

  describe('forceRefundReasonPromptOptions（沖帳 prompt 共用設定）', () => {
    it('inputPattern 採 15 字規則：拒 14、收 15', () => {
      const opts = forceRefundReasonPromptOptions('確認退課並沖帳')
      expect(opts.inputPattern.test(REASON_14)).toBe(false)
      expect(opts.inputPattern.test(REASON_15)).toBe(true)
    })
    it('帶入 confirmButtonText 且 inputErrorMessage 提到 15', () => {
      const opts = forceRefundReasonPromptOptions('確認移除並沖帳')
      expect(opts.confirmButtonText).toBe('確認移除並沖帳')
      expect(opts.inputErrorMessage).toContain('15')
    })
  })
})
