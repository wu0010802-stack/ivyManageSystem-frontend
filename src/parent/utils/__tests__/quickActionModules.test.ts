import { describe, it, expect } from 'vitest'
import { DEFAULT_SLOTS, QUICK_ACTION_CATALOG, resolveQuickActionSlots } from '../quickActionModules'

describe('resolveQuickActionSlots — 統一配置值驗證（2026-08-16 改版）', () => {
  it('undefined／null：退回預設三格（後端欄位尚未串接時的行為）', () => {
    expect(resolveQuickActionSlots(undefined)).toEqual(DEFAULT_SLOTS)
    expect(resolveQuickActionSlots(null)).toEqual(DEFAULT_SLOTS)
  })

  it('合法設定值：原樣採用（園所後台可以配置成任意 3 個目錄內模組）', () => {
    expect(resolveQuickActionSlots(['bus', 'fees', 'calendar'])).toEqual(['bus', 'fees', 'calendar'])
  })

  it('長度不是 3：退回預設', () => {
    expect(resolveQuickActionSlots(['pickup', 'proxy'])).toEqual(DEFAULT_SLOTS)
    expect(resolveQuickActionSlots(['pickup', 'proxy', 'announce', 'bus'])).toEqual(DEFAULT_SLOTS)
    expect(resolveQuickActionSlots([])).toEqual(DEFAULT_SLOTS)
  })

  it('含目錄外的 key：退回預設', () => {
    expect(resolveQuickActionSlots(['pickup', 'nope', 'announce'])).toEqual(DEFAULT_SLOTS)
  })

  it('有重複 key：退回預設（同一模組不該同時出現在兩格）', () => {
    expect(resolveQuickActionSlots(['pickup', 'pickup', 'announce'])).toEqual(DEFAULT_SLOTS)
  })

  it('型別不是陣列：退回預設', () => {
    expect(resolveQuickActionSlots('pickup,proxy,announce')).toEqual(DEFAULT_SLOTS)
    expect(resolveQuickActionSlots({ 0: 'pickup', 1: 'proxy', 2: 'announce' })).toEqual(DEFAULT_SLOTS)
  })

  it('陣列內含非字串元素：退回預設', () => {
    expect(resolveQuickActionSlots(['pickup', 1, 'announce'])).toEqual(DEFAULT_SLOTS)
  })
})

describe('QUICK_ACTION_CATALOG — 目錄完整性', () => {
  it('預設三格的 key 都在目錄內', () => {
    DEFAULT_SLOTS.forEach((key) => {
      expect(QUICK_ACTION_CATALOG[key]).toBeTruthy()
    })
  })

  it('每個模組都有非空 label／route／icon', () => {
    Object.values(QUICK_ACTION_CATALOG).forEach((m) => {
      expect(m.label).toBeTruthy()
      expect(m.route.startsWith('/')).toBe(true)
      expect(m.icon).toBeTruthy()
    })
  })
})
