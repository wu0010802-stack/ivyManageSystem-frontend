import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useRecruitmentCharts, displayChartLabel } from '@/composables/useRecruitmentCharts'

type StatsArg = Parameters<typeof useRecruitmentCharts>[0]['stats']

const makeStats = (over: Record<string, unknown> = {}) => ({
  monthly: [],
  by_grade: [],
  month_grade: {},
  by_source: [],
  by_referrer: [],
  ...over,
})

const setup = (statsOver: Record<string, unknown> = {}) =>
  useRecruitmentCharts({
    stats: ref(makeStats(statsOver)) as unknown as StatsArg,
    marketSnapshot: ref({}),
    drillToDetail: null,
  })

describe('displayChartLabel', () => {
  it('空字串與空白字串顯示為「未填寫」', () => {
    expect(displayChartLabel('')).toBe('未填寫')
    expect(displayChartLabel('  ')).toBe('未填寫')
  })

  it('有值時原樣返回', () => {
    expect(displayChartLabel('官網')).toBe('官網')
  })
})

describe('useRecruitmentCharts 空值 label 對應', () => {
  it('sourceBarData 空來源 label 顯示「未填寫」', () => {
    const { sourceBarData } = setup({ by_source: [{ source: '', visit: 2, deposit: 1 }] })
    expect(sourceBarData.value?.labels).toEqual(['未填寫'])
  })

  it('staffBarData 空接待人員 label 顯示「未填寫」', () => {
    const { staffBarData } = setup({ by_referrer: [{ referrer: '', visit: 2, deposit: 1 }] })
    expect(staffBarData.value?.labels).toEqual(['未填寫'])
  })
})

describe('useRecruitmentCharts 空資料回 null（供 template 顯示空狀態）', () => {
  it('classBarData / classRateData 無班別資料時為 null', () => {
    const { classBarData, classRateData } = setup()
    expect(classBarData.value).toBeNull()
    expect(classRateData.value).toBeNull()
  })

  it('classBarData 有班別資料時非 null', () => {
    const { classBarData } = setup({ by_grade: [{ grade: '小班', visit: 1, deposit: 1 }] })
    expect(classBarData.value).not.toBeNull()
  })

  it('noDepositGradeBarData 各年級全為零時為 null', () => {
    const { noDepositGradeBarData } = setup({
      no_deposit_reasons: [{ reason: '未分類', count: 1, by_grade: {} }],
    })
    expect(noDepositGradeBarData.value).toBeNull()
  })

  it('noDepositGradeBarData 任一年級有值時非 null', () => {
    const { noDepositGradeBarData } = setup({
      no_deposit_reasons: [{ reason: '費用考量', count: 1, by_grade: { 小班: 1 } }],
    })
    expect(noDepositGradeBarData.value).not.toBeNull()
  })
})

describe('useRecruitmentCharts 圖表 options', () => {
  it('人數軸使用整數刻度、限制 bar 厚度', () => {
    const { barOptions, horizBarOptions } = setup()
    const bar = barOptions as { scales?: { y?: { ticks?: { precision?: number } } }; datasets?: { bar?: { maxBarThickness?: number } } }
    const horiz = horizBarOptions as { scales?: { x?: { ticks?: { precision?: number } } }; datasets?: { bar?: { maxBarThickness?: number } } }
    expect(bar.scales?.y?.ticks?.precision).toBe(0)
    expect(bar.datasets?.bar?.maxBarThickness).toBeGreaterThan(0)
    expect(horiz.scales?.x?.ticks?.precision).toBe(0)
    expect(horiz.datasets?.bar?.maxBarThickness).toBeGreaterThan(0)
  })
})
