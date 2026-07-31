import { describe, it, expect } from 'vitest'
import { serverClockOffsetMs, serverNowIso } from '@/utils/serverClock'

// 伺服器 `Date` header 的標準形式（RFC 9110 IMF-fixdate，一律 GMT）
const GMT = 'Wed, 29 Jul 2026 01:23:45 GMT'
const GMT_MS = Date.UTC(2026, 6, 29, 1, 23, 45)

describe('serverClockOffsetMs', () => {
  it('回傳「伺服器時間 − 本機時間」的毫秒差', () => {
    expect(serverClockOffsetMs(GMT, GMT_MS - 5000)).toBe(5000)
  })

  it('本機快於伺服器時偏差為負', () => {
    expect(serverClockOffsetMs(GMT, GMT_MS + 250)).toBe(-250)
  })

  it('兩者一致時為 0（而非 null）', () => {
    // 0 是有效偏差，不可被當成「取不到」而回 null——否則呼叫端會誤以為沒同步過
    expect(serverClockOffsetMs(GMT, GMT_MS)).toBe(0)
  })

  it('裝置時鐘系統性錯誤（差一年）也如實回報，不做上限夾擠', () => {
    const oneYearMs = 365 * 24 * 60 * 60 * 1000
    expect(serverClockOffsetMs(GMT, GMT_MS + oneYearMs)).toBe(-oneYearMs)
  })

  it.each([
    ['缺 header', undefined],
    ['null', null],
    ['空字串', ''],
    ['只有空白', '   '],
    ['非日期字串', 'not-a-date'],
    ['數字型別', 1690000000000],
    // 這兩個是「型別檢查」與「解析失敗檢查」的分水嶺：數字 2026 與字串陣列被
    // Date.parse 強制轉字串後都會解析成合法日期，只有先擋型別才回得了 null
    ['數字剛好像年份', 2026],
    ['字串陣列（axios 多值 header）', [GMT]],
    ['物件型別', { date: GMT }],
  ])('%s 一律回 null（呼叫端維持既有本機時鐘）', (_label, header) => {
    expect(serverClockOffsetMs(header, GMT_MS)).toBeNull()
  })

  it('本機時間非有限數時回 null', () => {
    expect(serverClockOffsetMs(GMT, Number.NaN)).toBeNull()
    expect(serverClockOffsetMs(GMT, Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('serverNowIso', () => {
  it('把本機毫秒加上偏差後輸出 ISO 字串', () => {
    expect(serverNowIso(GMT_MS - 5000, 5000)).toBe('2026-07-29T01:23:45.000Z')
  })

  it('偏差為 0 時等同本機時間', () => {
    expect(serverNowIso(GMT_MS, 0)).toBe('2026-07-29T01:23:45.000Z')
  })

  it('負偏差往前推', () => {
    expect(serverNowIso(GMT_MS, -1000)).toBe('2026-07-29T01:23:44.000Z')
  })
})
