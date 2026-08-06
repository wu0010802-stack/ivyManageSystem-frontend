/**
 * POS 中文大寫金額 toChineseAmount（結帳成功／重印對話框 POSCheckoutPanel.vue 顯示用）
 *
 * 缺陷（2026-08-06 稽核）：
 * 「零」的判斷只在 4 位一組的組內做（zeroPending && segment），
 * 當某一組以 0 開頭時 segment 尚為空字串，該「零」被吞掉：
 *   10005 → 「壹萬伍元整」（會被櫃台讀成 15,000）
 * 修法：把補零提升到跨分組層級——高位已有輸出而本組以 0 開頭時，在 push 前補「零」。
 *
 * 下列跨段邊界值在修復前會失敗，修復後通過；另含正常值做回歸保護。
 */
import { describe, it, expect } from 'vitest'

import { toChineseAmount } from '@/constants/pos'

describe('toChineseAmount — 跨分組前導零補「零」', () => {
  it.each([
    [1005, '壹仟零伍元整'], // 組內補零（修復前已正確，防迴歸）
    [10005, '壹萬零伍元整'], // 修復前：壹萬伍元整（被讀成 15,000）
    [10050, '壹萬零伍拾元整'], // 修復前：壹萬伍拾元整
    [10500, '壹萬零伍佰元整'], // 修復前：壹萬伍佰元整
    [100500, '壹拾萬零伍佰元整'], // 修復前：壹拾萬伍佰元整
    [1000005, '壹佰萬零伍元整'], // 修復前：壹佰萬伍元整
  ])('%i → %s', (input, expected) => {
    expect(toChineseAmount(input)).toBe(expected)
  })

  it('中間整組為零時只補一個「零」（1 億 0000 萬 0005）', () => {
    expect(toChineseAmount(100000005)).toBe('壹億零伍元整')
  })

  it('負數沿用同一規則', () => {
    expect(toChineseAmount(-10005)).toBe('負壹萬零伍元整')
  })
})

describe('toChineseAmount — 既有正常值回歸保護', () => {
  it.each([
    [0, '零元整'],
    [8, '捌元整'],
    [108, '壹佰零捌元整'],
    [1500, '壹仟伍佰元整'],
    [15000, '壹萬伍仟元整'],
    [20000, '貳萬元整'], // 低位整組為零：不可補出「貳萬零元整」
    [10000, '壹萬元整'],
    [1000000, '壹佰萬元整'],
    [99999, '玖萬玖仟玖佰玖拾玖元整'],
    [123456789, '壹億貳仟參佰肆拾伍萬陸仟柒佰捌拾玖元整'],
  ])('%i → %s', (input, expected) => {
    expect(toChineseAmount(input)).toBe(expected)
  })

  it('小數無條件捨去至整數（結帳金額為整數元）', () => {
    expect(toChineseAmount(10005.9)).toBe('壹萬零伍元整')
  })

  it('非數值輸入視為 0', () => {
    expect(toChineseAmount(null)).toBe('零元整')
    expect(toChineseAmount(undefined)).toBe('零元整')
    expect(toChineseAmount('abc')).toBe('零元整')
  })
})
