import { describe, it, expect } from 'vitest'
import { capacityStatus, capacityPercent } from '@/utils/classroomCapacity'

describe('班級容量計算', () => {
  it('capacityStatus：滿載/接近額滿/正常 三態', () => {
    expect(capacityStatus(30, 30)).toBe('full')
    expect(capacityStatus(31, 30)).toBe('full')
    expect(capacityStatus(27, 30)).toBe('warning') // 27/30 = 90%
    expect(capacityStatus(26, 30)).toBe('normal')
    expect(capacityStatus(0, 30)).toBe('normal')
  })

  it('capacityStatus：容量缺失或 0 時視為單位容量，避免除以 0（0 學生不會是 full）', () => {
    expect(capacityStatus(0, 0)).toBe('normal')
    expect(capacityStatus(0, undefined)).toBe('normal')
    expect(capacityStatus(5, 0)).toBe('full') // 容量缺失但已有學生 → 視為超額
  })

  it('capacityPercent：回 0-100 整數百分比', () => {
    expect(capacityPercent(0, 30)).toBe(0)
    expect(capacityPercent(15, 30)).toBe(50)
    expect(capacityPercent(30, 30)).toBe(100)
  })

  it('capacityPercent：超額封頂 100、容量缺失回 0', () => {
    expect(capacityPercent(40, 30)).toBe(100)
    expect(capacityPercent(5, 0)).toBe(0)
    expect(capacityPercent(5, undefined)).toBe(0)
  })
})
