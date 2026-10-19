import { describe, it, expect } from 'vitest'
import {
  formatRegistered,
  denominatorCaption,
  autoEnrollmentCaption,
  sumRegistered,
} from '@/utils/headcountLabels'

// 註冊口徑（spec C1/C8/C10，2026-10-19）的顯示文字：null 一律是「沒有註冊數可報」
// （舊口徑、非當期、該月尚無月費單），畫面顯示「—」，不得當成 0。

describe('formatRegistered', () => {
  it('null／undefined 顯示「—」，不顯示 0', () => {
    expect(formatRegistered(null)).toBe('—')
    expect(formatRegistered(undefined)).toBe('—')
  })
  it('數字原樣顯示（含 0）', () => {
    expect(formatRegistered(0)).toBe('0')
    expect(formatRegistered(189)).toBe('189')
  })
})

describe('denominatorCaption', () => {
  it('註冊口徑且已過基準日：註冊（M/D）', () => {
    expect(denominatorCaption('registered', '2026-09-15', false)).toBe('註冊（9/15）')
    expect(denominatorCaption('registered', '2027-03-15', false)).toBe('註冊（3/15）')
  })
  it('註冊口徑但未到基準日：註冊（今天，暫估）', () => {
    expect(denominatorCaption('registered', '2026-09-10', true)).toBe('註冊（今天，暫估）')
  })
  it('舊口徑：在籍', () => {
    expect(denominatorCaption('enrolled', '2026-09-15', false)).toBe('在籍')
    expect(denominatorCaption('enrolled', '2026-10-19', true)).toBe('在籍')
  })
})

describe('autoEnrollmentCaption', () => {
  it('以考核基準日標示自動帶入來源', () => {
    expect(autoEnrollmentCaption('2026-09-15')).toBe('自動（9/15 註冊數）')
    expect(autoEnrollmentCaption('2027-03-15')).toBe('自動（3/15 註冊數）')
  })
  it('基準日缺漏時不編造日期', () => {
    expect(autoEnrollmentCaption(null)).toBe('自動（基準日註冊數）')
  })
})

describe('sumRegistered', () => {
  it('全部有值才加總', () => {
    expect(sumRegistered([10, 0, 5])).toBe(15)
  })
  it('任一為 null／undefined 整組回 null（殘缺加總會像真值）', () => {
    expect(sumRegistered([10, null, 5])).toBeNull()
    expect(sumRegistered([10, undefined])).toBeNull()
  })
  it('空清單回 null', () => {
    expect(sumRegistered([])).toBeNull()
  })
})
