import { describe, it, expect } from 'vitest'
import { formatAmount, formatSignedAmount, formatWan, methodLabel, monthRangeText } from '../reportFormat'

describe('formatAmount', () => {
  it('千分位、無幣別前綴、四捨五入；空值回空字串', () => {
    expect(formatAmount(1965811)).toBe('1,965,811')
    expect(formatAmount(-23000)).toBe('-23,000')
    expect(formatAmount(12.6)).toBe('13')
    expect(formatAmount(null)).toBe('')
    expect(formatAmount(Number.NaN)).toBe('')
  })
})

describe('formatSignedAmount', () => {
  it('正數帶 +、負數用全形減號、0 不帶號', () => {
    expect(formatSignedAmount(174550)).toBe('+174,550')
    expect(formatSignedAmount(-23000)).toBe('−23,000')
    expect(formatSignedAmount(0)).toBe('0')
  })
})

describe('formatWan（座標軸用「萬」）', () => {
  it('整數萬不帶小數，200 萬不能變成 2 萬', () => {
    expect(formatWan(0)).toBe('0')
    expect(formatWan(500000)).toBe('50 萬')
    expect(formatWan(2000000)).toBe('200 萬')
    expect(formatWan(1000000)).toBe('100 萬')
    expect(formatWan(250000)).toBe('25 萬')
  })
  it('不足一萬保留兩位、負數保留負號', () => {
    expect(formatWan(5000)).toBe('0.5 萬')
    expect(formatWan(1234)).toBe('0.12 萬')
    expect(formatWan(-250000)).toBe('-25 萬')
    expect(formatWan('150000')).toBe('15 萬')
  })
})

describe('monthRangeText', () => {
  it('連續月份壓成區間、亂序與重複可接受', () => {
    expect(monthRangeText([1, 2, 3, 5, 7, 8])).toBe('1–3、5、7–8 月')
    expect(monthRangeText([9, 8, 8, 10])).toBe('8–10 月')
    expect(monthRangeText([4])).toBe('4 月')
    expect(monthRangeText([])).toBe('')
  })
})

describe('methodLabel', () => {
  it('代碼轉中文；已是中文或未知值原樣', () => {
    expect(methodLabel('cash')).toBe('現金')
    expect(methodLabel('bank_transfer')).toBe('銀行匯款')
    expect(methodLabel('轉帳')).toBe('轉帳')
    expect(methodLabel(null)).toBe('')
  })
})
