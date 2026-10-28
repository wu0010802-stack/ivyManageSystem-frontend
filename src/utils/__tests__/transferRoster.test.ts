import { describe, it, expect, vi, beforeEach } from 'vitest'

const downloadFileWithHeadersMock = vi.fn()
vi.mock('@/utils/download', () => ({
  downloadFileWithHeaders: (...a: unknown[]) => downloadFileWithHeadersMock(...a),
}))
const warningMock = vi.fn()
vi.mock('element-plus', () => ({ ElMessage: { warning: (...a: unknown[]) => warningMock(...a) } }))

import {
  appraisalTransferRosterPath,
  downloadTransferRoster,
  rosterExcludedCount,
  yearEndTransferRosterPath,
} from '@/utils/transferRoster'

describe('transferRoster', () => {
  beforeEach(() => {
    downloadFileWithHeadersMock.mockReset()
    warningMock.mockReset()
  })

  it('路徑不帶 /api（走 axios baseURL）', () => {
    expect(yearEndTransferRosterPath(3)).toBe('/year_end/cycles/3/transfer_roster.xlsx')
    expect(appraisalTransferRosterPath(4)).toBe('/appraisal/cycles/4/transfer_roster.xlsx')
  })

  it('rosterExcludedCount：缺 header／非數字／負數皆 0', () => {
    expect(rosterExcludedCount({ 'x-roster-excluded-count': '2' })).toBe(2)
    expect(rosterExcludedCount({})).toBe(0)
    expect(rosterExcludedCount(null)).toBe(0)
    expect(rosterExcludedCount({ 'x-roster-excluded-count': 'abc' })).toBe(0)
    expect(rosterExcludedCount({ 'x-roster-excluded-count': '-1' })).toBe(0)
  })

  it('有人被排除 → 成功並警示人數', async () => {
    downloadFileWithHeadersMock.mockResolvedValueOnce({ 'x-roster-excluded-count': '3' })
    expect(await downloadTransferRoster('/p', 'a.xlsx', { period: '2026-08' })).toBe(true)
    expect(downloadFileWithHeadersMock).toHaveBeenCalledWith('/p', 'a.xlsx', { period: '2026-08' })
    expect(warningMock).toHaveBeenCalledTimes(1)
    expect(warningMock.mock.calls[0][0]).toContain('3 人')
    expect(warningMock.mock.calls[0][0]).toContain('未列入名冊')
  })

  it('無人被排除 → 不警示', async () => {
    downloadFileWithHeadersMock.mockResolvedValueOnce({ 'x-roster-excluded-count': '0' })
    expect(await downloadTransferRoster('/p', 'a.xlsx')).toBe(true)
    expect(warningMock).not.toHaveBeenCalled()
  })

  it('下載失敗 → 回 false、不警示', async () => {
    downloadFileWithHeadersMock.mockResolvedValueOnce(null)
    expect(await downloadTransferRoster('/p', 'a.xlsx')).toBe(false)
    expect(warningMock).not.toHaveBeenCalled()
  })
})
