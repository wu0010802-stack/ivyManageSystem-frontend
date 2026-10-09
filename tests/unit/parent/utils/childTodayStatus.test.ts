/**
 * 首頁孩子狀態卡的今日狀態判斷（utils/childTodayStatus.ts）。
 * 判斷順序沿用改版前 TodayView.childStatusLabel：已離園 > 在園 > 請假 >
 * 尚未到校（週末改為今天放假）。
 */
import { describe, it, expect } from 'vitest'
import { childTodayStatus, isOffDay } from '@/parent/utils/childTodayStatus'

// 2026-10-08 是星期四；2026-10-10 是星期六
const THURSDAY = new Date('2026-10-08T09:30:00+08:00')
const SATURDAY = new Date('2026-10-10T09:30:00+08:00')

describe('childTodayStatus', () => {
  it('在園：大字「在園中」，到校已完成、接送與離園未完成', () => {
    const s = childTodayStatus({ attendance: { status: '已入園' } }, THURSDAY)
    expect(s.label).toBe('在園中')
    expect(s.tone).toBe('ok')
    expect(s.detail).toBe('今天已到校')
    expect(s.steps?.map((x) => x.state)).toEqual(['done', 'todo', 'todo'])
  })

  it('在園但後端狀態是「遲到」：照實呈現，不吞掉細節', () => {
    const s = childTodayStatus({ attendance: { status: '遲到' } }, THURSDAY)
    expect(s.label).toBe('在園中')
    expect(s.detail).toBe('今天遲到')
    expect(s.steps?.[0].caption).toBe('遲到')
  })

  it('attendance 無 status 欄位：仍視為在園', () => {
    expect(childTodayStatus({ attendance: {} }, THURSDAY).label).toBe('在園中')
  })

  it('家長已預告接送：接送步驟為進行中，顯示台北時間的預計抵達', () => {
    const s = childTodayStatus({
      attendance: { status: '已入園' },
      dismissal: { status: 'pending', request_source: 'parent', expected_arrival_at: '2026-10-08T16:30:00' },
    }, THURSDAY)
    const pickup = s.steps?.find((x) => x.key === 'pickup')
    expect(pickup?.state).toBe('current')
    expect(pickup?.caption).toBe('預計 16:30')
  })

  it('家長已到門口：接送步驟顯示「已到門口」', () => {
    const s = childTodayStatus({
      attendance: { status: '已入園' },
      dismissal: { status: 'acknowledged', request_source: 'parent', arrived_at: '2026-10-08T16:31:00' },
    }, THURSDAY)
    expect(s.steps?.find((x) => x.key === 'pickup')?.caption).toBe('已到門口')
  })

  it('已離園優先於在園：三步驟全部完成，顯示接回時間', () => {
    const s = childTodayStatus({
      attendance: { status: '已入園' },
      dismissal: { status: 'completed', completed_at: '2026-10-08T08:35:00Z' },
    }, THURSDAY)
    expect(s.label).toBe('已離園')
    expect(s.detail).toBe('16:35 已接回家')
    expect(s.steps?.every((x) => x.state === 'done')).toBe(true)
  })

  it('請假：不顯示進度，說明帶假別，聯絡簿標記為請假無紀錄', () => {
    const s = childTodayStatus({ leave: { type: '病假' } }, THURSDAY)
    expect(s.label).toBe('請假')
    expect(s.detail).toBe('今天請病假')
    expect(s.steps).toBeNull()
    expect(s.noRecordReason).toBe('請假')
  })

  it('平日沒有任何紀錄：尚未到校，到校步驟為進行中', () => {
    const s = childTodayStatus(null, THURSDAY)
    expect(s.label).toBe('尚未到校')
    expect(s.steps?.[0].state).toBe('current')
    expect(s.noRecordReason).toBeNull()
  })

  it('週末沒有任何紀錄：今天放假，不顯示進度', () => {
    const s = childTodayStatus({}, SATURDAY)
    expect(s.label).toBe('今天放假')
    expect(s.steps).toBeNull()
    expect(s.noRecordReason).toBe('放假')
  })

  it('isOffDay：六日為放假日', () => {
    expect(isOffDay(THURSDAY)).toBe(false)
    expect(isOffDay(SATURDAY)).toBe(true)
  })
})
