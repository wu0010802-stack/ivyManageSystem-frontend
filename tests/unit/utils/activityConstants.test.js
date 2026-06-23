import { describe, expect, it } from 'vitest'
import {
  PAYMENT_STATUS_TAG_TYPE,
  PAYMENT_STATUS_LABEL,
  COURSE_STATUS_TAG_TYPE,
  COURSE_STATUS_LABEL,
  PAYMENT_METHODS,
} from '@/constants/activity'

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
})
