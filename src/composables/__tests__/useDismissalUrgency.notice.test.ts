/**
 * 家長預告接送（pnotice01）——等候/ETA 純函式測試。
 *
 * 規格：
 * - parent 預告且 arrived_at=null：顯示「預計 HH:MM」「還有 N 分／預計時間已過 N 分」，
 *   不套 3/8 分鐘等候警示。
 * - arrived_at 非空：從 arrived_at 起算等候，3/8 門檻沿用既有常數。
 * - staff 舊流程 arrived_at=requested_at → 行為與改造前逐字相同。
 * - active queue 排序：已抵達優先（arrived_at 舊→新）→ 未抵達依 expected_arrival_at 近→遠。
 */
import { describe, it, expect } from 'vitest'
import {
  isPreArrivalNotice,
  waitAnchorIso,
  etaDeltaMinutes,
  etaRelativeText,
  formatExpectedArrival,
  sortActiveQueue,
  elapsedMinutes,
  urgencyLevel,
} from '@/composables/useDismissalUrgency'

const T = (s: string) => new Date(`${s}+08:00`).getTime()

describe('isPreArrivalNotice', () => {
  it('parent 來源且未抵達 → true', () => {
    expect(
      isPreArrivalNotice({ id: 1, request_source: 'parent', arrived_at: null }),
    ).toBe(true)
  })
  it('parent 已抵達 → false', () => {
    expect(
      isPreArrivalNotice({
        id: 1,
        request_source: 'parent',
        arrived_at: '2026-08-14T15:40:00',
      }),
    ).toBe(false)
  })
  it('staff 來源 → false（含防禦性缺欄位）', () => {
    expect(
      isPreArrivalNotice({ id: 1, request_source: 'staff', arrived_at: '2026-08-14T15:00:00' }),
    ).toBe(false)
    expect(isPreArrivalNotice({ id: 1 })).toBe(false)
  })
})

describe('waitAnchorIso（等候起算點）', () => {
  it('有 arrived_at 用 arrived_at', () => {
    expect(
      waitAnchorIso({
        id: 1,
        requested_at: '2026-08-14T15:00:00',
        arrived_at: '2026-08-14T15:40:00',
      }),
    ).toBe('2026-08-14T15:40:00')
  })
  it('無 arrived_at fallback requested_at（防禦：migration 已回填 staff 舊資料）', () => {
    expect(
      waitAnchorIso({ id: 1, requested_at: '2026-08-14T15:00:00', arrived_at: null }),
    ).toBe('2026-08-14T15:00:00')
  })
})

describe('抵達後等候計算（從 arrived_at 起算，沿用 3/8 門檻）', () => {
  it('arrived 2 分鐘 → warning 未觸發', () => {
    const call = {
      id: 1,
      request_source: 'parent',
      requested_at: '2026-08-14T15:00:00',
      arrived_at: '2026-08-14T15:40:00',
    }
    const now = T('2026-08-14T15:42:00')
    const mins = elapsedMinutes(waitAnchorIso(call), now)
    expect(mins).toBe(2)
    expect(urgencyLevel(mins)).toBe('normal')
  })
  it('arrived 9 分鐘 → critical（即使 requested_at 已 50 分鐘前）', () => {
    const call = {
      id: 1,
      request_source: 'parent',
      requested_at: '2026-08-14T15:00:00',
      arrived_at: '2026-08-14T15:41:00',
    }
    const now = T('2026-08-14T15:50:00')
    const mins = elapsedMinutes(waitAnchorIso(call), now)
    expect(mins).toBe(9)
    expect(urgencyLevel(mins)).toBe('critical')
  })
})

describe('ETA 顯示', () => {
  it('formatExpectedArrival → 預計 HH:MM', () => {
    expect(formatExpectedArrival('2026-08-14T15:40:00')).toBe('預計 15:40')
    expect(formatExpectedArrival(null)).toBe('')
  })
  it('etaDeltaMinutes：未到為正、已過為負', () => {
    expect(etaDeltaMinutes('2026-08-14T15:40:00', T('2026-08-14T15:28:00'))).toBe(12)
    expect(etaDeltaMinutes('2026-08-14T15:40:00', T('2026-08-14T15:43:00'))).toBe(-3)
  })
  it('etaRelativeText：還有 N 分 / 即將抵達 / 預計時間已過 N 分', () => {
    expect(etaRelativeText('2026-08-14T15:40:00', T('2026-08-14T15:28:00'))).toBe('還有 12 分')
    expect(etaRelativeText('2026-08-14T15:40:00', T('2026-08-14T15:40:20'))).toBe('即將抵達')
    expect(etaRelativeText('2026-08-14T15:40:00', T('2026-08-14T15:43:00'))).toBe(
      '預計時間已過 3 分',
    )
    expect(etaRelativeText(null, T('2026-08-14T15:43:00'))).toBe('')
  })
})

describe('sortActiveQueue（管理端與教師端共用）', () => {
  it('已抵達優先（arrived_at 舊→新），未抵達依 expected_arrival_at 近→遠', () => {
    const calls = [
      // 未抵達、ETA 較遠
      { id: 1, request_source: 'parent', requested_at: '2026-08-14T15:00:00', expected_arrival_at: '2026-08-14T15:50:00', arrived_at: null },
      // 已抵達（較晚到）
      { id: 2, request_source: 'parent', requested_at: '2026-08-14T15:05:00', expected_arrival_at: '2026-08-14T15:20:00', arrived_at: '2026-08-14T15:22:00' },
      // 已抵達（最早到，staff 舊流程 arrived=requested）
      { id: 3, request_source: 'staff', requested_at: '2026-08-14T15:10:00', expected_arrival_at: '2026-08-14T15:10:00', arrived_at: '2026-08-14T15:10:00' },
      // 未抵達、已超過 ETA（expected 最早 → 未抵達組第一）
      { id: 4, request_source: 'parent', requested_at: '2026-08-14T15:01:00', expected_arrival_at: '2026-08-14T15:15:00', arrived_at: null },
    ]
    expect(sortActiveQueue(calls).map((c) => c.id)).toEqual([3, 2, 4, 1])
  })
  it('不變動輸入陣列', () => {
    const calls = [
      { id: 1, expected_arrival_at: '2026-08-14T15:50:00', arrived_at: null },
      { id: 2, expected_arrival_at: '2026-08-14T15:20:00', arrived_at: '2026-08-14T15:22:00' },
    ]
    const snapshot = calls.map((c) => c.id)
    sortActiveQueue(calls)
    expect(calls.map((c) => c.id)).toEqual(snapshot)
  })
  it('staff 舊資料（全部 arrived=requested）排序等價於 requested_at FIFO', () => {
    const calls = [
      { id: 1, request_source: 'staff', requested_at: '2026-08-14T15:30:00', expected_arrival_at: '2026-08-14T15:30:00', arrived_at: '2026-08-14T15:30:00' },
      { id: 2, request_source: 'staff', requested_at: '2026-08-14T15:10:00', expected_arrival_at: '2026-08-14T15:10:00', arrived_at: '2026-08-14T15:10:00' },
    ]
    expect(sortActiveQueue(calls).map((c) => c.id)).toEqual([2, 1])
  })
})
