/**
 * 學費退費申請（FIN-F2）共用判斷：何時改走「送出退費申請」、本人申請判定。
 */
import { describe, it, expect } from 'vitest'
import {
  isOwnRefundRequest,
  isRefundApprovalRequired,
  refundApprovalMessage,
} from '../refundApproval'

const err = (status: number, detail: unknown) => ({ response: { status, data: { detail } } })

describe('isRefundApprovalRequired', () => {
  it('409 REFUND_APPROVAL_REQUIRED（有簽核權者跨門檻）→ true', () => {
    expect(isRefundApprovalRequired(err(409, { code: 'REFUND_APPROVAL_REQUIRED', message: 'x' }))).toBe(true)
  })

  it('403 審批閾值（無簽核權者跨門檻）→ true', () => {
    expect(isRefundApprovalRequired(err(403,
      '學費累積退款 NT$1,500 超過 NT$1,000 審批閾值，需由具備『金流簽核』權限者（ACTIVITY_PAYMENT_APPROVE）執行',
    ))).toBe(true)
  })

  it('其他 409／403（冪等衝突、班級權限）與無 response → false', () => {
    expect(isRefundApprovalRequired(err(409, '請求識別碼衝突，請使用新的識別碼重試'))).toBe(false)
    expect(isRefundApprovalRequired(err(403, '無權存取此學生'))).toBe(false)
    expect(isRefundApprovalRequired(err(400, { code: 'REFUND_APPROVAL_REQUIRED' }))).toBe(false)
    expect(isRefundApprovalRequired(new Error('network'))).toBe(false)
    expect(isRefundApprovalRequired(null)).toBe(false)
  })
})

describe('refundApprovalMessage', () => {
  it('優先取結構化 message，其次字串 detail，最後 fallback', () => {
    expect(refundApprovalMessage(err(409, { code: 'REFUND_APPROVAL_REQUIRED', message: '達門檻' }))).toBe('達門檻')
    expect(refundApprovalMessage(err(403, '超過審批閾值'))).toBe('超過審批閾值')
    expect(refundApprovalMessage({})).toBe('本次退費累計已達簽核門檻')
  })
})

describe('isOwnRefundRequest', () => {
  it('username 相同才算本人；缺值一律不判定為本人', () => {
    expect(isOwnRefundRequest('acct', 'acct')).toBe(true)
    expect(isOwnRefundRequest('acct', 'owner')).toBe(false)
    expect(isOwnRefundRequest(null, 'acct')).toBe(false)
    expect(isOwnRefundRequest('acct', undefined)).toBe(false)
    expect(isOwnRefundRequest('', '')).toBe(false)
  })
})
