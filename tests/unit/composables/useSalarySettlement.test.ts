import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_THRESHOLDS,
  getThresholds,
  setThresholds,
  deriveStatus,
  detectAnomalies,
  sortByAttention,
  type SettlementRecord,
} from '@/composables/useSalarySettlement'

// 月結工作台最高風險的純邏輯（狀態推導 + 需注意判斷 + 注意度排序 + 門檻），
// 需注意判斷靜默回歸時結薪覆核會漏標停用員工／實領 0 → 表格驅動鎖各分支與門檻邊界。
// 2026-11-03 起不再與上月比較（業主裁定：覆核不看上月差距）。

function rec(over: Partial<SettlementRecord> = {}): SettlementRecord {
  return {
    id: 1,
    employee_id: 1,
    employee_name: '員工',
    version: 1,
    base_salary: 30000,
    gross_salary: 40000,
    net_salary: 35000,
    is_finalized: false,
    breakdown_stale: false,
    manual_overrides: [],
    employee_is_active: true,
    employee_resign_date: null,
    ...over,
  }
}

const OCT = { year: 2026, month: 10 }

describe('deriveStatus', () => {
  it('無紀錄 → not_calculated', () => {
    expect(deriveStatus([])).toBe('not_calculated')
  })

  it('全部封存 → finalized', () => {
    expect(deriveStatus([rec({ is_finalized: true }), rec({ id: 2, employee_id: 2, is_finalized: true })])).toBe(
      'finalized',
    )
  })

  it('有未封存且 breakdown_stale → needs_recalc', () => {
    expect(deriveStatus([rec({ breakdown_stale: true })])).toBe('needs_recalc')
  })

  it('有未封存但皆非 stale → reviewing', () => {
    expect(deriveStatus([rec(), rec({ id: 2, employee_id: 2, is_finalized: true })])).toBe('reviewing')
  })

  it('finalized 優先：全封存即使有 stale 仍 finalized', () => {
    expect(deriveStatus([rec({ is_finalized: true, breakdown_stale: true })])).toBe('finalized')
  })
})

describe('detectAnomalies 邊界表', () => {
  const cases: Array<[string, Partial<SettlementRecord>, string[]]> = [
    ['在職一般', {}, []],
    ['停用、無離職日', { employee_is_active: false }, ['inactive']],
    ['停用、離職日上月底', { employee_is_active: false, employee_resign_date: '2026-09-30' }, ['inactive']],
    ['停用、離職日本月 1 日', { employee_is_active: false, employee_resign_date: '2026-10-01' }, []],
    ['在職但離職日早於本月（資料矛盾）', { employee_resign_date: '2026-08-31' }, ['inactive']],
    ['實領 0', { net_salary: 0, base_transfer_amount: 0 }, ['zero']],
    ['實領 0 但有未休折現（主薪轉 > 0）', { net_salary: 0, base_transfer_amount: 1200 }, []],
    ['曠職剛好 10%', { absence_deduction: 3000 }, ['heavy']],
    ['曠職 9.99%', { absence_deduction: 2997 }, []],
    ['保費追溯不算扣款偏高', { insurance_adjustment: 9000 }, []],
    ['手動調整', { manual_overrides: ['festival_bonus'] }, ['manual']],
  ]
  it.each(cases)('%s', (_name, over, expected) => {
    const m = detectAnomalies([rec(over)], DEFAULT_THRESHOLDS, OCT)
    expect((m.get(1) ?? []).map((r) => r.type)).toEqual(expected)
  })
})

describe('sortByAttention', () => {
  it('被標記者依嚴重度排前、未標記排後，各自保序', () => {
    const list = [
      rec({ id: 1, employee_id: 1 }),
      rec({ id: 2, employee_id: 2, manual_overrides: ['x'] }),
      rec({ id: 3, employee_id: 3, net_salary: 0, base_transfer_amount: 0 }),
      rec({ id: 4, employee_id: 4 }),
    ]
    const sorted = sortByAttention(list, detectAnomalies(list, DEFAULT_THRESHOLDS, OCT))
    expect(sorted.map((r) => r.employee_id)).toEqual([3, 2, 1, 4])
  })

  it('無異常 → 原序不變', () => {
    const list = [rec({ id: 1, employee_id: 1 }), rec({ id: 2, employee_id: 2 })]
    expect(sortByAttention(list, new Map())).toEqual(list)
  })
})

describe('thresholds（localStorage per 裝置）', () => {
  beforeEach(() => localStorage.clear())

  it('DEFAULT_THRESHOLDS 鎖定常數', () => {
    expect(DEFAULT_THRESHOLDS).toEqual({ heavyPct: 0.1 })
  })

  it('無 localStorage → 回預設（且為複本，不可變更原常數）', () => {
    const t = getThresholds()
    t.heavyPct = 0.9
    expect(DEFAULT_THRESHOLDS.heavyPct).toBe(0.1)
  })

  it('set → get round-trip', () => {
    setThresholds({ heavyPct: 0.25 })
    expect(getThresholds()).toEqual({ heavyPct: 0.25 })
  })

  it('壞值（非物件 / 缺欄 / 超出範圍）→ 回預設', () => {
    for (const raw of ['123', '{"pct":0.2}', '{"heavyPct":"x"}', '{"heavyPct":0}', '{"heavyPct":2}']) {
      localStorage.setItem('ivy_salary_review_thresholds', raw)
      expect(getThresholds()).toEqual(DEFAULT_THRESHOLDS)
    }
  })
})
