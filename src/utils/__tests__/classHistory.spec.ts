import { describe, it, expect } from 'vitest'
import {
  formatSemester,
  formatSemesterShort,
  roleLabel,
  formatCoTeachers,
  formatHeadcount,
  formatNetChange,
  type ClassHistoryRow,
} from '../classHistory'

describe('classHistory formatters', () => {
  it('formatSemester', () => {
    expect(formatSemester(114, 1)).toBe('114 上學期')
    expect(formatSemester(114, 2)).toBe('114 下學期')
  })

  it('formatSemesterShort', () => {
    expect(formatSemesterShort(114, 1)).toBe('114上')
    expect(formatSemesterShort(114, 2)).toBe('114下')
  })

  it('roleLabel', () => {
    expect(roleLabel('head')).toBe('導師')
    expect(roleLabel('assistant')).toBe('助教')
    expect(roleLabel('art')).toBe('才藝')
    expect(roleLabel('admin')).toBe('admin')
    expect(roleLabel('')).toBe('')
  })

  it('formatCoTeachers', () => {
    expect(
      formatCoTeachers([
        { role: 'assistant', employee_id: 2, name: '李美' },
        { role: 'art', employee_id: 3, name: '陳華' },
      ]),
    ).toBe('助教 李美 · 才藝 陳華')
    expect(formatCoTeachers([])).toBe('—')
  })

  it('formatHeadcount: live current', () => {
    const row = { start_count: 25, end_count: 27, end_count_is_live: true } as ClassHistoryRow
    expect(formatHeadcount(row)).toBe('25 → 目前 27')
  })

  it('formatHeadcount: past complete', () => {
    const row = { start_count: 24, end_count: 25, end_count_is_live: false } as ClassHistoryRow
    expect(formatHeadcount(row)).toBe('24 → 25')
  })

  it('formatHeadcount: no data', () => {
    const row = { start_count: null, end_count: null, end_count_is_live: false } as ClassHistoryRow
    expect(formatHeadcount(row)).toBe('— 資料不足')
  })

  it('formatHeadcount: start missing, end present (past)', () => {
    const row = { start_count: null, end_count: 25, end_count_is_live: false } as ClassHistoryRow
    expect(formatHeadcount(row)).toBe('— → 25')
  })

  it('formatHeadcount: start present, end missing (past)', () => {
    const row = { start_count: 22, end_count: null, end_count_is_live: false } as ClassHistoryRow
    expect(formatHeadcount(row)).toBe('22 → —')
  })

  it('formatNetChange', () => {
    expect(formatNetChange(2)).toEqual({ text: '▲ +2', type: 'up' })
    expect(formatNetChange(-2)).toEqual({ text: '▼ -2', type: 'down' })
    expect(formatNetChange(0)).toEqual({ text: '±0', type: 'flat' })
    expect(formatNetChange(null)).toEqual({ text: '—', type: 'none' })
  })
})
