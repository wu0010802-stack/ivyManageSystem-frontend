import { describe, it, expect } from 'vitest'
import {
  MIN_TRIGGER_REASON_LENGTH,
  SUSPENSION_DAYS_THRESHOLD,
  daysInMonth,
  decisionHeadline,
  defaultSuspensionPeriod,
  isTriggerRegistration,
  reasonRequiredForSave,
  ruleStatusText,
  staleNotice,
  validateSuspendedDays,
  validateTriggerReason,
} from '../festivalSuspension'

describe('daysInMonth', () => {
  it('依西元年月給當月天數，閏年二月 29 天', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2026, 4)).toBe(30)
    expect(daysInMonth(2026, 12)).toBe(31)
  })
})

describe('validateSuspendedDays（對齊後端：0–31 且不可超過當月天數）', () => {
  it('合法值回 null，0 與當月最後一天都合法', () => {
    expect(validateSuspendedDays(0, 2026, 2)).toBeNull()
    expect(validateSuspendedDays(10, 2026, 2)).toBeNull()
    expect(validateSuspendedDays(28, 2026, 2)).toBeNull()
  })

  it('超過當月天數回說明，並點名年月與天數', () => {
    const msg = validateSuspendedDays(29, 2026, 2)
    expect(msg).toContain('2026-02')
    expect(msg).toContain('28')
  })

  it('空值、負數、小數、超過 31 都不合法', () => {
    expect(validateSuspendedDays(null, 2026, 3)).not.toBeNull()
    expect(validateSuspendedDays(undefined, 2026, 3)).not.toBeNull()
    expect(validateSuspendedDays(-1, 2026, 3)).not.toBeNull()
    expect(validateSuspendedDays(2.5, 2026, 3)).not.toBeNull()
    expect(validateSuspendedDays(32, 2026, 3)).not.toBeNull()
  })
})

describe('staleNotice', () => {
  it('沒有下游異動回 null（規則未開啟時登記不影響薪資）', () => {
    expect(staleNotice({ salary_records: 0, year_end_settlements: [], appraisal_summaries: [] })).toBeNull()
    expect(staleNotice(undefined)).toBeNull()
  })

  it('薪資待重算筆數與年終草稿編號都要講', () => {
    expect(staleNotice({ salary_records: 12, year_end_settlements: [], appraisal_summaries: [] })).toBe(
      '已將 12 筆未封存薪資標記為需重算',
    )
    expect(staleNotice({ salary_records: 0, year_end_settlements: [3, 7], appraisal_summaries: [] })).toBe(
      '有 2 份年終草稿需要重算（編號 3、7）',
    )
    expect(staleNotice({ salary_records: 5, year_end_settlements: [9], appraisal_summaries: [] })).toBe(
      '已將 5 筆未封存薪資標記為需重算；有 1 份年終草稿需要重算（編號 9）',
    )
  })

  it('舊資料缺欄位時不炸', () => {
    expect(staleNotice({ salary_records: 2 })).toBe('已將 2 筆未封存薪資標記為需重算')
  })
})

describe('defaultSuspensionPeriod', () => {
  it('取今天所在的年月', () => {
    expect(defaultSuspensionPeriod('2026-10-27')).toEqual({ year: 2026, month: 10 })
    expect(defaultSuspensionPeriod('2027-01-03')).toEqual({ year: 2027, month: 1 })
  })
})

describe('ruleStatusText', () => {
  it('規則開啟：說明判定會套用；未開啟：說明登記只是紀錄', () => {
    expect(ruleStatusText(true)).toContain('會套用')
    const off = ruleStatusText(false)
    expect(off).toContain('尚未開啟')
    expect(off).toContain('不會影響')
  })
})

describe('decisionHeadline', () => {
  it('全園停發優先，附原因', () => {
    expect(decisionHeadline({ school_reason: '停課 12 日', classes: [] })).toEqual({
      type: 'error',
      text: '全園停發：停課 12 日',
    })
  })

  it('部分班級停發：點出班數', () => {
    expect(
      decisionHeadline({ school_reason: null, classes: [{ classroom_id: 1, classroom_name: '向日葵班', reason: 'x' }] }),
    ).toEqual({ type: 'warning', text: '1 個班級會停發節慶獎金' })
  })

  it('都沒有：說明這個月沒有班級會被停發', () => {
    expect(decisionHeadline({ school_reason: null, classes: [] })).toEqual({
      type: 'success',
      text: '這個月沒有班級會被停發',
    })
  })
})

describe('常數', () => {
  it('停發門檻與後端 SUSPENSION_DAYS_THRESHOLD 一致（10 日）', () => {
    expect(SUSPENSION_DAYS_THRESHOLD).toBe(10)
  })
})

describe('isTriggerRegistration（會讓節慶獎金停發的登記）', () => {
  it('全園一律算，不論日數（含 0 日）', () => {
    expect(isTriggerRegistration(true, 0)).toBe(true)
    expect(isTriggerRegistration(true, 3)).toBe(true)
  })

  it('班級看門檻：9 日不算、10 日算（含本數）', () => {
    expect(isTriggerRegistration(false, 9)).toBe(false)
    expect(isTriggerRegistration(false, 10)).toBe(true)
    expect(isTriggerRegistration(false, 31)).toBe(true)
  })

  it('日數未填的班級不算', () => {
    expect(isTriggerRegistration(false, null)).toBe(false)
    expect(isTriggerRegistration(false, undefined)).toBe(false)
  })
})

describe('reasonRequiredForSave', () => {
  it('新增班級：只看新日數', () => {
    expect(reasonRequiredForSave({ schoolWide: false, afterDays: 5 })).toBe(false)
    expect(reasonRequiredForSave({ schoolWide: false, afterDays: 10 })).toBe(true)
  })

  it('新增全園：一律必填', () => {
    expect(reasonRequiredForSave({ schoolWide: true, afterDays: 1 })).toBe(true)
  })

  it('修改班級：改前或改後任一邊 >=10 都必填（10 日改 5 日也是在恢復發放）', () => {
    expect(reasonRequiredForSave({ schoolWide: false, beforeDays: 10, afterDays: 5 })).toBe(true)
    expect(reasonRequiredForSave({ schoolWide: false, beforeDays: 5, afterDays: 12 })).toBe(true)
    expect(reasonRequiredForSave({ schoolWide: false, beforeDays: 12, afterDays: 12 })).toBe(true)
  })

  it('修改班級：前後都 <10 不必填', () => {
    expect(reasonRequiredForSave({ schoolWide: false, beforeDays: 3, afterDays: 5 })).toBe(false)
  })

  it('修改全園：一律必填', () => {
    expect(reasonRequiredForSave({ schoolWide: true, beforeDays: 0, afterDays: 0 })).toBe(true)
  })
})

describe('validateTriggerReason（對齊後端 422）', () => {
  it('去除空白後 >=10 字合法', () => {
    expect(validateTriggerReason('颱風停課公告字號一一五之九', '登記')).toBeNull()
    expect(validateTriggerReason('  ' + '一二三四五六七八九十' + '  ', '登記')).toBeNull()
  })

  it('空白、空值、9 字都不合法，訊息帶動作與字數', () => {
    for (const bad of [null, undefined, '', '          ', '一二三四五六七八九', '  一二三  ']) {
      const msg = validateTriggerReason(bad, '修改')
      expect(msg).toContain('修改')
      expect(msg).toContain(String(MIN_TRIGGER_REASON_LENGTH))
      expect(msg).toContain('10 日')
    }
  })

  it('三種動作的用字', () => {
    expect(validateTriggerReason('', '登記')).toContain('登記須填寫')
    expect(validateTriggerReason('', '刪除')).toContain('刪除須填寫')
  })
})
