import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_THRESHOLDS,
  getThresholds,
  setThresholds,
  deriveStatus,
  detectAnomalies,
  sortByAttention,
  type SettlementRecord,
  type Thresholds,
} from '@/composables/useSalarySettlement'

// 月結工作台最高風險的純邏輯（狀態推導 + 異常偵測 + 注意度排序 + 門檻），
// 異常偵測靜默回歸時月結畫面會漏標需重算薪資 → 表格驅動鎖各分支與門檻邊界。

function rec(over: Partial<SettlementRecord> = {}): SettlementRecord {
  return {
    id: 1,
    employee_id: 1,
    employee_name: '員工',
    version: 1,
    gross_salary: 40000,
    net_salary: 35000,
    is_finalized: false,
    breakdown_stale: false,
    manual_overrides: [],
    ...over,
  }
}

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
    expect(deriveStatus([rec({ is_finalized: false, breakdown_stale: true })])).toBe('needs_recalc')
  })

  it('有未封存但皆非 stale → reviewing', () => {
    expect(deriveStatus([rec({ is_finalized: false, breakdown_stale: false })])).toBe('reviewing')
  })

  it('finalized 優先：全封存即使有 stale 仍 finalized', () => {
    // every(is_finalized) 先判定；混合封存+未封存stale → needs_recalc
    expect(deriveStatus([rec({ is_finalized: true, breakdown_stale: true })])).toBe('finalized')
    expect(
      deriveStatus([
        rec({ id: 1, employee_id: 1, is_finalized: true }),
        rec({ id: 2, employee_id: 2, is_finalized: false, breakdown_stale: true }),
      ]),
    ).toBe('needs_recalc')
  })
})

describe('detectAnomalies', () => {
  const TH: Thresholds = { pct: 0.1, abs: 3000 }

  it('manual_overrides 非空 → 標 manual', () => {
    const map = detectAnomalies([rec({ employee_id: 7, manual_overrides: ['base_salary'] })], [], TH)
    expect(map.get(7)).toEqual([{ type: 'manual' }])
  })

  it('系統首月（previous 空）→ 不報 diff/new，但仍報 manual', () => {
    const map = detectAnomalies(
      [rec({ employee_id: 1 }), rec({ employee_id: 2, manual_overrides: ['x'] })],
      [],
      TH,
    )
    expect(map.has(1)).toBe(false)
    expect(map.get(2)).toEqual([{ type: 'manual' }])
  })

  it('本月新進（不在上月）→ 標 new', () => {
    const map = detectAnomalies([rec({ employee_id: 9 })], [rec({ employee_id: 1 })], TH)
    expect(map.get(9)).toEqual([{ type: 'new' }])
  })

  it('差異超過 pct 門檻 → diff', () => {
    // prev 10000 → cur 11500：abs=1500(<3000) 但 pct=0.15(>=0.1)
    const map = detectAnomalies(
      [rec({ employee_id: 1, net_salary: 11500, gross_salary: 11500 })],
      [rec({ employee_id: 1, net_salary: 10000, gross_salary: 11500 })],
      TH,
    )
    const reasons = map.get(1) || []
    expect(reasons.some((r) => r.type === 'diff' && r.field === 'net_salary')).toBe(true)
  })

  it('差異超過 abs 門檻 → diff（即使 pct 小）', () => {
    // prev 50000 → cur 56000：abs=6000(>=3000) 但 pct=0.12
    const map = detectAnomalies(
      [rec({ employee_id: 1, net_salary: 56000, gross_salary: 50000 })],
      [rec({ employee_id: 1, net_salary: 50000, gross_salary: 50000 })],
      TH,
    )
    const reasons = map.get(1) || []
    expect(reasons.some((r) => r.type === 'diff' && r.field === 'net_salary')).toBe(true)
  })

  it('差異在門檻內 → 不報', () => {
    // prev 50000 → cur 52000：abs=2000(<3000) 且 pct=0.04(<0.1)
    const map = detectAnomalies(
      [rec({ employee_id: 1, net_salary: 52000, gross_salary: 50000 })],
      [rec({ employee_id: 1, net_salary: 50000, gross_salary: 50000 })],
      TH,
    )
    expect(map.has(1)).toBe(false)
  })

  it('上月為 0、本月非 0 → pct=1 觸發 diff', () => {
    const map = detectAnomalies(
      [rec({ employee_id: 1, net_salary: 5000, gross_salary: 5000 })],
      [rec({ employee_id: 1, net_salary: 0, gross_salary: 0 })],
      TH,
    )
    const reasons = map.get(1) || []
    expect(reasons.some((r) => r.type === 'diff')).toBe(true)
  })

  it('manual + diff 可同筆並存', () => {
    const map = detectAnomalies(
      [rec({ employee_id: 1, net_salary: 56000, gross_salary: 50000, manual_overrides: ['x'] })],
      [rec({ employee_id: 1, net_salary: 50000, gross_salary: 50000 })],
      TH,
    )
    const types = (map.get(1) || []).map((r) => r.type)
    expect(types).toContain('manual')
    expect(types).toContain('diff')
  })
})

describe('sortByAttention', () => {
  it('被標記者排前、未標記排後，各自保序', () => {
    const records = [
      rec({ id: 1, employee_id: 1 }),
      rec({ id: 2, employee_id: 2 }),
      rec({ id: 3, employee_id: 3 }),
    ]
    const anomalies = new Map([[2, [{ type: 'manual' as const }]]])
    const sorted = sortByAttention(records, anomalies)
    expect(sorted.map((r) => r.employee_id)).toEqual([2, 1, 3])
  })

  it('無異常 → 原序不變', () => {
    const records = [rec({ employee_id: 1 }), rec({ employee_id: 2 })]
    expect(sortByAttention(records, new Map()).map((r) => r.employee_id)).toEqual([1, 2])
  })
})

describe('thresholds（localStorage per 裝置）', () => {
  beforeEach(() => localStorage.clear())

  it('DEFAULT_THRESHOLDS 鎖定常數', () => {
    expect(DEFAULT_THRESHOLDS).toEqual({ pct: 0.1, abs: 3000 })
  })

  it('無 localStorage → 回預設（且為複本，不可變更原常數）', () => {
    const t = getThresholds()
    expect(t).toEqual(DEFAULT_THRESHOLDS)
    t.pct = 0.5
    expect(DEFAULT_THRESHOLDS.pct).toBe(0.1)
  })

  it('set → get round-trip', () => {
    setThresholds({ pct: 0.2, abs: 5000 })
    expect(getThresholds()).toEqual({ pct: 0.2, abs: 5000 })
  })

  it('壞值（非物件 / 缺欄）→ 回預設', () => {
    localStorage.setItem('ivy_salary_anomaly_thresholds', 'not-json')
    expect(getThresholds()).toEqual(DEFAULT_THRESHOLDS)
    localStorage.setItem('ivy_salary_anomaly_thresholds', JSON.stringify({ pct: 0.2 }))
    expect(getThresholds()).toEqual(DEFAULT_THRESHOLDS)
  })
})
