import { describe, it, expect } from 'vitest'
import {
  collectMetricKeys,
  failedTenants,
  formatMetric,
  isMetricArray,
  isMetricObject,
  metricLabel,
} from '../reportFormat'

describe('collectMetricKeys', () => {
  it('聯集全部分校的指標 key 並保留首次出現順序', () => {
    const rows = [
      { data: { total_income: 1, headcount: 2 } },
      { data: { headcount: 3, attendance_rate: 0.9 } },
    ]
    expect(collectMetricKeys(rows)).toEqual(['total_income', 'headcount', 'attendance_rate'])
  })

  it('沒有 data 的列不會炸', () => {
    expect(collectMetricKeys([{}, { data: {} }])).toEqual([])
  })
})

describe('formatMetric', () => {
  it('比率類：0~1 視為比例換算成百分比', () => {
    expect(formatMetric('attendance_rate', 0.925)).toBe('92.5%')
    expect(formatMetric('conversion_pct', 42)).toBe('42.0%')
  })

  it('金額類走千分位整數', () => {
    expect(formatMetric('total_income', 1234567)).toBe('1,234,567')
    // 小數金額不留半個位數（薪資成本合計常有 .5）
    expect(formatMetric('salary_cost', 1000.5)).toBe('1,001')
  })

  it('其他數字也走千分位', () => {
    expect(formatMetric('headcount', 1234)).toBe('1,234')
  })

  it('null / undefined / 空字串顯示破折號（不是 0，也不是 "null"）', () => {
    expect(formatMetric('x', null)).toBe('—')
    expect(formatMetric('x', undefined)).toBe('—')
    expect(formatMetric('x', '')).toBe('—')
  })

  it('布林不會渲染成 [object Object]', () => {
    expect(formatMetric('flag', true)).toBe('是')
    expect(formatMetric('flag', false)).toBe('否')
  })

  it('物件／陣列不再被 JSON.stringify，也不會變成 [object Object]（呼叫端應改用 isMetricObject/isMetricArray 判斷後走巢狀渲染）', () => {
    const objResult = formatMetric('detail', { a: 1 })
    expect(objResult).not.toBe('{"a":1}')
    expect(objResult).not.toContain('[object Object]')
    expect(objResult).not.toContain('{')

    const arrResult = formatMetric('detail', [1, 2, 3])
    expect(arrResult).not.toBe('[1,2,3]')
    expect(arrResult).not.toContain('[object Object]')
  })
})

describe('isMetricObject / isMetricArray', () => {
  it('純物件判為 object，陣列判為 array，原始型別與 null 兩者皆非', () => {
    expect(isMetricObject({ a: 1 })).toBe(true)
    expect(isMetricObject([1, 2])).toBe(false)
    expect(isMetricObject(null)).toBe(false)
    expect(isMetricObject(1)).toBe(false)

    expect(isMetricArray([1, 2])).toBe(true)
    expect(isMetricArray({ a: 1 })).toBe(false)
    expect(isMetricArray(null)).toBe(false)
  })
})

describe('metricLabel', () => {
  it('已知 key 回中文標籤（不是原始英文或底線轉空白）', () => {
    expect(metricLabel('total_revenue')).toBe('總收入')
    expect(metricLabel('net_cashflow')).toBe('淨現金流')
    expect(metricLabel('student_count')).toBe('學生數')
    expect(metricLabel('employee_count')).toBe('員工數')
    expect(metricLabel('rate')).toBe('出勤率')
    expect(metricLabel('visit_to_deposit_rate')).toBe('參觀→預繳率')
  })

  it('未知 key（後端未來新增／目前未收錄）fallback 底線轉空白', () => {
    expect(metricLabel('some_future_metric')).toBe('some future metric')
  })
})

describe('failedTenants', () => {
  it('挑出有 error 的分校（必須顯示，不能靜默略過）', () => {
    const rows = [
      { tenant_id: 1, name: 'A', error: null },
      { tenant_id: 2, name: 'B', error: 'timeout' },
    ]
    expect(failedTenants(rows).map((r) => r.name)).toEqual(['B'])
  })
})
