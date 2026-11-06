import { describe, it, expect } from 'vitest'
import {
  FORCE_OVERLAP_REASON_MIN_LENGTH,
  forceOverlapReasonLength,
  friendlyForceOverlapText,
  isForceOverlapForbidden,
  isLeaveOverlapConflict,
  leaveOverlapConflictText,
} from '@/utils/leaveOverlap'

const SINGLE_409 =
  '該員工在 2026-11-03 ~ 2026-11-03 已有另一筆已核准的請假（ID: 112），'
  + '若確認仍要核准請帶 force_overlap=true 並填寫 force_overlap_reason'
const FORBIDDEN_403 = "force_overlap=True 需具備『金流簽核』權限（ACTIVITY_PAYMENT_APPROVE），請改由具該權限者執行"
const BATCH_REASON =
  '與已核准假單 #12（2026-11-03~2026-11-03）重疊；批次核准不支援強制過，請改用單筆核准並帶 force_overlap'

const err = (status: number, detail: unknown, extra: Record<string, unknown> = {}) => ({
  response: { status, data: { detail } },
  ...extra,
})

describe('isLeaveOverlapConflict', () => {
  it('409 且訊息含 force_overlap → true', () => {
    expect(isLeaveOverlapConflict(err(409, SINGLE_409))).toBe(true)
  })

  it('優先採 interceptor 正規化後的 displayMessage', () => {
    expect(isLeaveOverlapConflict({ response: { status: 409 }, displayMessage: SINGLE_409 })).toBe(true)
  })

  it('其他 409（不含參數名）→ false', () => {
    expect(isLeaveOverlapConflict(err(409, '此假單已被他人處理'))).toBe(false)
  })

  it('同樣訊息但狀態碼不是 409 → false', () => {
    expect(isLeaveOverlapConflict(err(400, SINGLE_409))).toBe(false)
    expect(isLeaveOverlapConflict(err(403, SINGLE_409))).toBe(false)
  })

  it('非 axios 錯誤／空值 → false，不丟例外', () => {
    expect(isLeaveOverlapConflict(new Error('Network Error'))).toBe(false)
    expect(isLeaveOverlapConflict(null)).toBe(false)
    expect(isLeaveOverlapConflict(undefined)).toBe(false)
  })
})

describe('isForceOverlapForbidden', () => {
  it('403 且訊息含 force_overlap → true', () => {
    expect(isForceOverlapForbidden(err(403, FORBIDDEN_403))).toBe(true)
  })

  it('一般 403（不含參數名）→ false', () => {
    expect(isForceOverlapForbidden(err(403, '您沒有審核此假單的權限'))).toBe(false)
  })

  it('409 重疊不算 → false', () => {
    expect(isForceOverlapForbidden(err(409, SINGLE_409))).toBe(false)
  })
})

describe('friendlyForceOverlapText', () => {
  it('單筆 409：拿掉結尾的參數名那句，只留衝突描述，ID 改成「假單 #」', () => {
    const out = friendlyForceOverlapText(SINGLE_409)
    expect(out).toBe('該員工在 2026-11-03 ~ 2026-11-03 已有另一筆已核准的請假（假單 #112）')
    expect(out).not.toContain('force_overlap')
  })

  it('批次原因：「並帶 force_overlap」改成白話，其餘保留', () => {
    const out = friendlyForceOverlapText(BATCH_REASON)
    expect(out).toBe('與已核准假單 #12（2026-11-03~2026-11-03）重疊；批次核准不支援強制過，請改用單筆核准並確認強制核准')
  })

  it('不含參數名的文字原樣回傳（含空字串）', () => {
    expect(friendlyForceOverlapText('本月薪資已封存')).toBe('本月薪資已封存')
    expect(friendlyForceOverlapText('')).toBe('')
  })

  it('整句都是參數名（無可保留的描述）→ 回空字串，由呼叫端補通用說明', () => {
    expect(friendlyForceOverlapText('請帶 force_overlap=true')).toBe('')
  })
})

describe('leaveOverlapConflictText', () => {
  it('回對話框用的衝突描述，不含參數名', () => {
    const out = leaveOverlapConflictText(err(409, SINGLE_409))
    expect(out).toContain('2026-11-03')
    expect(out).toContain('#112')
    expect(out).not.toContain('force_overlap')
  })

  it('後端文字全被濾掉時退回通用說明', () => {
    const out = leaveOverlapConflictText(err(409, '請帶 force_overlap=true'))
    expect(out).toBe('此假單與該員工已核准的假單時間重疊')
  })
})

describe('forceOverlapReasonLength', () => {
  it('去前後空白後計字', () => {
    expect(forceOverlapReasonLength('  一二三  ')).toBe(3)
    expect(forceOverlapReasonLength('   ')).toBe(0)
  })

  it('emoji 以字元計（對齊後端 Python len），不是 UTF-16 單元', () => {
    expect(forceOverlapReasonLength('😀😀😀')).toBe(3)
  })

  it('門檻與後端 validator 一致為 10', () => {
    expect(FORCE_OVERLAP_REASON_MIN_LENGTH).toBe(10)
  })
})
