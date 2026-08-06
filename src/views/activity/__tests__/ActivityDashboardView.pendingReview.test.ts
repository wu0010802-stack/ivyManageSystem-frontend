/**
 * 才藝儀表板統計表「待審核人次」（2026-08-06 業主需求）。
 *
 * 統計表的每一格與所有比率原本只算 enrolled + promoted_pending，公開報名尚未
 * 通過身分審核的 pending_review 完全不顯示；同一時間課程管理頁的「已報名／
 * 剩餘名額」卻含 pending_review，兩張畫面因此對不上。
 *
 * 本次做法：格子顯示「12 (+3)」（+3 為待審核）並新增一欄「待審核人次」，
 * **參與率與達標判定維持現狀不動**——身分未確認前計入會讓班級參加率虛高、
 * 誤發 NT$1000/班學期紅利。
 *
 * ⚠ 測試策略同 enrollmentRatio 那支：本 view 無法在 happy-dom 掛載，欄位定義
 * 以 SFC 原始碼斷言，數值正確性由後端
 * tests/test_activity_dashboard_pending_review_2026_08_06.py 覆蓋。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildCourseCell } from '../activityDashboardTable'

const SFC_SOURCE = readFileSync(
  resolve(process.cwd(), 'src/views/activity/ActivityDashboardView.vue'),
  'utf-8',
)

describe('課程格子的待審核標記', () => {
  it('有正式報名也有待審核時顯示「12」與「+3」兩段', () => {
    expect(buildCourseCell(12, 3)).toEqual({ count: '12', pending: '+3' })
  })

  it('沒有待審核時只顯示報名數', () => {
    expect(buildCourseCell(12, 0)).toEqual({ count: '12', pending: '' })
  })

  it('只有待審核時仍顯示 0 讓待審核有依附的數字', () => {
    // 空字串 + 「+3」會變成孤零零的「+3」，讀者無從判斷基數是 0 還是沒資料。
    expect(buildCourseCell(0, 3)).toEqual({ count: '0', pending: '+3' })
  })

  it('兩者皆為 0 時整格留白（維持既有視覺清爽）', () => {
    expect(buildCourseCell(0, 0)).toEqual({ count: '', pending: '' })
  })

  it('後端未回傳欄位時視為 0，不得渲染 undefined', () => {
    expect(buildCourseCell(undefined, undefined)).toEqual({ count: '', pending: '' })
    expect(buildCourseCell(5, undefined)).toEqual({ count: '5', pending: '' })
  })
})

describe('統計表待審核欄位定義', () => {
  it('新增綁定 total_pending_review 的「待審核人次」欄', () => {
    expect(SFC_SOURCE).toContain('prop="total_pending_review"')
    expect(SFC_SOURCE).toContain('待審核人次')
  })

  it('待審核欄不套達標紅綠著色（達標一律看參與率）', () => {
    const start = SFC_SOURCE.indexOf('prop="total_pending_review"')
    expect(start).toBeGreaterThan(-1) // 欄位不存在時不得靜默通過
    const end = SFC_SOURCE.indexOf('</el-table-column>', start)
    const columnBlock = SFC_SOURCE.slice(start, end)

    expect(columnBlock).not.toContain('text-danger')
    expect(columnBlock).not.toContain('text-success')
  })

  it('比率欄的分子維持不含待審核', () => {
    // 釘住「參與率／人次比率不得改用待審核」——這是本需求的紅線。
    const ratioStart = SFC_SOURCE.indexOf('prop="ratio"')
    expect(ratioStart).toBeGreaterThan(-1)
    const ratioEnd = SFC_SOURCE.indexOf('</el-table-column>', ratioStart)
    expect(SFC_SOURCE.slice(ratioStart, ratioEnd)).not.toContain('pending')

    const erStart = SFC_SOURCE.indexOf('prop="enrollment_ratio"')
    expect(erStart).toBeGreaterThan(-1)
    const erEnd = SFC_SOURCE.indexOf('</el-table-column>', erStart)
    expect(SFC_SOURCE.slice(erStart, erEnd)).not.toContain('pending')
  })

  it('課程格子改走 buildCourseCell 而非只印報名數', () => {
    expect(SFC_SOURCE).toContain('getCourseCell')
  })
})
