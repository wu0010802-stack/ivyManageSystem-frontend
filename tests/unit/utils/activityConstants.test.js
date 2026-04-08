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
  })

  describe('PAYMENT_STATUS_LABEL', () => {
    it('paid → 已繳費', () => expect(PAYMENT_STATUS_LABEL.paid).toBe('已繳費'))
    it('partial → 部分繳費', () => expect(PAYMENT_STATUS_LABEL.partial).toBe('部分繳費'))
    it('overpaid → 超繳', () => expect(PAYMENT_STATUS_LABEL.overpaid).toBe('超繳'))
    it('unpaid → 未繳費', () => expect(PAYMENT_STATUS_LABEL.unpaid).toBe('未繳費'))
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
    it('包含現金、轉帳、其他', () => {
      expect(PAYMENT_METHODS).toContain('現金')
      expect(PAYMENT_METHODS).toContain('轉帳')
      expect(PAYMENT_METHODS).toContain('其他')
    })
  })
})
