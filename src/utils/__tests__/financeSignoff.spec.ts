import { describe, it, expect } from 'vitest'
import {
  resolveNextAction,
  isRecordEditable,
  recordLockReason,
  extractApiErrorMessage,
  settlementStatusLabel,
  evidenceStatusLabel,
} from '../financeSignoff'

const rec = (over: Partial<Record<string, string>> = {}) => ({
  status: 'pending',
  approval_status: 'draft',
  settlement_status: 'unsettled',
  reconciliation_status: 'unreconciled',
  ...over,
})

describe('resolveNextAction', () => {
  it('草稿 → 送審（WRITE）', () => {
    const a = resolveNextAction(rec(), 'vendor')
    expect(a).toEqual({
      key: 'submit',
      label: '送審',
      permission: 'VENDOR_PAYMENT_WRITE',
    })
  })

  it('送審中 → 核准（APPROVE）', () => {
    const a = resolveNextAction(rec({ approval_status: 'pending_approval' }), 'misc')
    expect(a?.key).toBe('approve')
    expect(a?.permission).toBe('MISC_RECEIPT_APPROVE')
  })

  it('已核准未付款 → 確認付款／登記收款（SETTLE，方向化文案）', () => {
    const v = resolveNextAction(rec({ approval_status: 'approved' }), 'vendor')
    expect(v?.key).toBe('settle')
    expect(v?.label).toBe('確認付款')
    const m = resolveNextAction(rec({ approval_status: 'approved' }), 'misc')
    expect(m?.label).toBe('登記收款')
    expect(m?.permission).toBe('MISC_RECEIPT_SETTLE')
  })

  it('被駁回 → 修改重送', () => {
    const a = resolveNextAction(rec({ approval_status: 'rejected' }), 'vendor')
    expect(a?.key).toBe('edit_resubmit')
  })

  it('已收付＋未附憑證 → 補憑證（WRITE）', () => {
    const a = resolveNextAction(
      rec({ approval_status: 'approved', settlement_status: 'settled' }),
      'vendor',
    )
    expect(a?.key).toBe('sign')
    expect(a?.label).toBe('補憑證')
  })

  it('已收付＋已附憑證 → 對帳（RECONCILE）', () => {
    const a = resolveNextAction(
      rec({
        approval_status: 'approved',
        settlement_status: 'settled',
        status: 'signed',
      }),
      'vendor',
    )
    expect(a?.key).toBe('reconcile')
    expect(a?.permission).toBe('VENDOR_PAYMENT_RECONCILE')
  })

  it('misc 先收款未送審 → 下一步是送審而非補憑證', () => {
    const a = resolveNextAction(
      rec({ approval_status: 'draft', settlement_status: 'settled' }),
      'misc',
    )
    expect(a?.key).toBe('submit')
  })

  it('legacy 已收付未簽收 → 補憑證', () => {
    const a = resolveNextAction(
      rec({ approval_status: 'legacy', settlement_status: 'settled' }),
      'misc',
    )
    expect(a?.key).toBe('sign')
  })

  it('exception → 處理異常；reconciled → 無動作', () => {
    expect(
      resolveNextAction(
        rec({ settlement_status: 'settled', reconciliation_status: 'exception' }),
        'vendor',
      )?.key,
    ).toBe('resolve_exception')
    expect(
      resolveNextAction(
        rec({ settlement_status: 'settled', reconciliation_status: 'reconciled' }),
        'vendor',
      ),
    ).toBeNull()
  })
})

describe('isRecordEditable / recordLockReason', () => {
  it('草稿與被駁回可編輯', () => {
    expect(isRecordEditable(rec())).toBe(true)
    expect(isRecordEditable(rec({ approval_status: 'rejected' }))).toBe(true)
  })

  it('送審中／已核准／已收付／已簽收／legacy 都鎖定，且有文字說明', () => {
    for (const over of [
      { approval_status: 'pending_approval' },
      { approval_status: 'approved' },
      { approval_status: 'legacy', settlement_status: 'settled' },
      { settlement_status: 'settled', approval_status: 'approved' },
      { status: 'signed' },
    ]) {
      const r = rec(over)
      expect(isRecordEditable(r)).toBe(false)
      expect(recordLockReason(r, 'vendor')).toBeTruthy()
    }
  })

  it('已收付的鎖定說明指向沖銷流程', () => {
    expect(
      recordLockReason(
        rec({ settlement_status: 'settled', approval_status: 'legacy' }),
        'vendor',
      ),
    ).toContain('沖銷')
  })
})

describe('extractApiErrorMessage', () => {
  const wrap = (detail: unknown) => ({ response: { data: { detail } } })

  it('字串 detail 原樣返回', () => {
    expect(extractApiErrorMessage(wrap('已簽收不可編輯'))).toBe('已簽收不可編輯')
  })

  it('結構化 {code,message} 取 message', () => {
    expect(
      extractApiErrorMessage(
        wrap({ code: 'SELF_APPROVAL_FORBIDDEN', message: '不可核准自己' }),
      ),
    ).toBe('不可核准自己')
  })

  it('422 validation array 取第一筆 msg；無法解析回 fallback', () => {
    expect(extractApiErrorMessage(wrap([{ msg: '欄位必填' }]))).toBe('欄位必填')
    expect(extractApiErrorMessage({}, '預設')).toBe('預設')
  })
})

describe('狀態文案', () => {
  it('settlement 方向化；憑證軸改稱待補憑證', () => {
    expect(settlementStatusLabel('settled', 'vendor')).toBe('已付款')
    expect(settlementStatusLabel('unsettled', 'misc')).toBe('未收款')
    expect(evidenceStatusLabel('pending')).toBe('待補憑證')
    expect(evidenceStatusLabel('signed')).toBe('已附憑證')
  })
})
