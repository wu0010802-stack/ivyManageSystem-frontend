import { describe, expect, it } from 'vitest'

import {
  buildSaveConfirmLines,
  computeGateStatus,
  taipeiNowMinuteString,
} from '../registrationSettingsConfirm'

const NOW = '2026-07-08T10:00'

describe('buildSaveConfirmLines（純時間窗語意，2026-07-31 起無開關）', () => {
  it('顯示實際報名期間（錯誤年份在確認框可見）', () => {
    const lines = buildSaveConfirmLines(
      { open_at: '2021-01-05T00:00', close_at: '2029-12-01T21:54' },
      NOW,
    )
    expect(lines).toContain('報名期間：2021-01-05 00:00 ～ 2029-12-01 21:54')
  })

  it('截止時間已過 → 顯示已截止警告', () => {
    const lines = buildSaveConfirmLines(
      { open_at: '2026-07-01T00:00', close_at: '2026-07-07T23:59' },
      NOW,
    )
    expect(lines.some((l) => l.includes('報名已截止'))).toBe(true)
  })

  it('開放時間未到 → 顯示尚未開始警告', () => {
    const lines = buildSaveConfirmLines(
      { open_at: '2026-07-10T09:00', close_at: '2026-07-20T18:00' },
      NOW,
    )
    expect(lines.some((l) => l.includes('報名尚未開始'))).toBe(true)
  })

  it('期間內 → 無警告行', () => {
    const lines = buildSaveConfirmLines(
      { open_at: '2026-07-01T00:00', close_at: '2026-07-20T18:00' },
      NOW,
    )
    expect(lines.some((l) => l.includes('⚠'))).toBe(false)
  })

  it('未設起訖（雙空）→ 明講前台不開放（取代舊開關 OFF）', () => {
    const lines = buildSaveConfirmLines({ open_at: null, close_at: null }, NOW)
    expect(lines).toContain('報名期間：未設定 ～ 未設定')
    expect(lines.some((l) => l.includes('報名尚未開放'))).toBe(true)
    expect(lines.some((l) => l.includes('立即開放'))).toBe(false)
  })

  it('只設開放時間、未設截止 → 提示將持續開放', () => {
    const lines = buildSaveConfirmLines({ open_at: '2026-07-01T00:00', close_at: null }, NOW)
    expect(lines.some((l) => l.includes('未設定截止時間'))).toBe(true)
  })

  it('只設截止、未設開放 → 提示立即開放至截止', () => {
    const lines = buildSaveConfirmLines({ open_at: null, close_at: '2026-07-20T18:00' }, NOW)
    expect(lines.some((l) => l.includes('立即開放'))).toBe(true)
  })

  it('截止=當下（邊界）視為已截止（與後端 now > close_at 語意對齊：等值仍可報名，但存檔當下即將截止，給警告較安全）', () => {
    const lines = buildSaveConfirmLines(
      { open_at: '2026-07-01T00:00', close_at: NOW },
      NOW,
    )
    expect(lines.some((l) => l.includes('報名已截止'))).toBe(true)
  })

  it('不再出現總開關字樣', () => {
    const lines = buildSaveConfirmLines(
      { open_at: '2026-07-01T00:00', close_at: '2026-07-20T18:00' },
      NOW,
    )
    expect(lines.some((l) => l.includes('總開關'))).toBe(false)
  })
})

describe('computeGateStatus — 報名 tab 常駐狀態（純時間窗）', () => {
  it('雙空（未設定期間）→ unscheduled，前台不開放', () => {
    const s = computeGateStatus({ open_at: null, close_at: null }, NOW)
    expect(s.state).toBe('unscheduled')
    expect(s.type).toBe('info')
    expect(s.title).toContain('報名尚未開放')
    expect(s.description).toContain('時間')
  })

  it('期間內 → open，描述含截止時間與自動截止', () => {
    const s = computeGateStatus(
      { open_at: '2026-07-01T00:00', close_at: '2026-07-20T18:00' },
      NOW,
    )
    expect(s.state).toBe('open')
    expect(s.type).toBe('success')
    expect(s.title).toContain('開放報名中')
    expect(s.description).toContain('2026-07-20 18:00')
    expect(s.description).toContain('自動')
  })

  it('只設截止且未過 → open（未設開放時間＝立即開放）', () => {
    const s = computeGateStatus({ open_at: null, close_at: '2026-07-20T18:00' }, NOW)
    expect(s.state).toBe('open')
  })

  it('開放時間未到 → not_started，描述含開放時間與自動開放', () => {
    const s = computeGateStatus(
      { open_at: '2026-07-10T09:00', close_at: '2026-07-20T18:00' },
      NOW,
    )
    expect(s.state).toBe('not_started')
    expect(s.type).toBe('warning')
    expect(s.title).toContain('尚未開始')
    expect(s.description).toContain('2026-07-10 09:00')
    expect(s.description).toContain('自動')
  })

  it('截止已過 → closed，描述導向「調整截止時間」', () => {
    const s = computeGateStatus(
      { open_at: '2026-07-01T00:00', close_at: '2026-07-07T23:59' },
      NOW,
    )
    expect(s.state).toBe('closed')
    expect(s.type).toBe('error')
    expect(s.title).toContain('已截止')
    expect(s.description).toContain('截止時間')
  })

  it('截止=當下（邊界）視為已截止，與 buildSaveConfirmLines 同語意', () => {
    const s = computeGateStatus({ open_at: null, close_at: NOW }, NOW)
    expect(s.state).toBe('closed')
  })

  it('只設開放且已到、未設截止 → open，描述明講持續開放', () => {
    const s = computeGateStatus({ open_at: '2026-07-01T00:00', close_at: null }, NOW)
    expect(s.state).toBe('open')
    expect(s.description).toContain('未設定截止時間')
  })
})

describe('taipeiNowMinuteString', () => {
  it('輸出 YYYY-MM-DDTHH:mm 形狀', () => {
    expect(taipeiNowMinuteString()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })
})

describe('buildSaveConfirmLines — 開放學期（2026-07-31）', () => {
  it('指定學期 → 攤開學年度與上/下學期', () => {
    const lines = buildSaveConfirmLines(
      {
        open_at: '2026-07-01T00:00',
        close_at: '2026-07-20T18:00',
        school_year: 115,
        semester: 1,
      },
      NOW,
    )
    expect(lines).toContain('開放學期：115 學年度 上學期')
  })

  it('semester=2 → 下學期', () => {
    const lines = buildSaveConfirmLines(
      { open_at: null, close_at: null, school_year: 114, semester: 2 },
      NOW,
    )
    expect(lines).toContain('開放學期：114 學年度 下學期')
  })

  it('未指定學期 → 明講會依系統日期判斷，可能顯示到另一學期的課程／用品', () => {
    const lines = buildSaveConfirmLines({ open_at: null, close_at: null }, NOW)
    const termLine = lines.find((l) => l.startsWith('開放學期：'))
    expect(termLine).toBeDefined()
    expect(termLine).toContain('未指定')
    expect(termLine).toContain('系統日期')
  })
})
