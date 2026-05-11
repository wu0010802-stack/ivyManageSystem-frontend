/**
 * tests/unit/api/govData.spec.js
 *
 * 確認 govData api wrapper 正確包裝 8 支政府資料同步端點：
 * listStaging / getBracketsDiff / promoteBrackets / dismissBrackets /
 * promoteMinimumWage / dismissMinimumWage / syncNow / listSnapshots
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}))

vi.mock('@/api/index', () => ({
  default: {
    get: mockGet,
    post: mockPost,
  },
}))

import * as govData from '@/api/govData'

describe('govData API', () => {
  beforeEach(() => {
    mockGet.mockClear()
    mockPost.mockClear()
  })

  it('listStaging GET /gov-data/staging', async () => {
    mockGet.mockResolvedValue({ data: { sources: [], brackets_pending: [], minimum_wage_pending: [] } })
    const r = await govData.listStaging()
    expect(mockGet).toHaveBeenCalledWith('/gov-data/staging')
    expect(r.sources).toEqual([])
  })

  it('promoteBrackets sends reason in body', async () => {
    mockPost.mockResolvedValue({ data: { status: 'promoted' } })
    await govData.promoteBrackets(7, '比對無異常 2027 套用')
    expect(mockPost).toHaveBeenCalledWith(
      '/gov-data/staging/brackets/7/promote',
      { reason: '比對無異常 2027 套用' }
    )
  })

  it('dismissBrackets', async () => {
    mockPost.mockResolvedValue({ data: { status: 'dismissed' } })
    await govData.dismissBrackets(7, '格式異常先忽略此版本等下次更新')
    expect(mockPost).toHaveBeenCalledWith(
      '/gov-data/staging/brackets/7/dismiss',
      { reason: '格式異常先忽略此版本等下次更新' }
    )
  })

  it('promoteMinimumWage', async () => {
    mockPost.mockResolvedValue({ data: { status: 'promoted' } })
    await govData.promoteMinimumWage(3, '2027 基本工資公告比對無異常套用')
    expect(mockPost).toHaveBeenCalledWith(
      '/gov-data/staging/minimum-wage/3/promote',
      { reason: '2027 基本工資公告比對無異常套用' }
    )
  })

  it('dismissMinimumWage', async () => {
    mockPost.mockResolvedValue({ data: { status: 'dismissed' } })
    await govData.dismissMinimumWage(3, '基本工資資料異常先忽略不採用')
    expect(mockPost).toHaveBeenCalledWith(
      '/gov-data/staging/minimum-wage/3/dismiss',
      { reason: '基本工資資料異常先忽略不採用' }
    )
  })

  it('syncNow', async () => {
    mockPost.mockResolvedValue({ data: {} })
    await govData.syncNow()
    expect(mockPost).toHaveBeenCalledWith('/gov-data/sync-now')
  })

  it('listSnapshots with source filter', async () => {
    mockGet.mockResolvedValue({ data: [] })
    await govData.listSnapshots({ source: 'mol_labor_brackets', limit: 30 })
    expect(mockGet).toHaveBeenCalledWith('/gov-data/snapshots', {
      params: { source: 'mol_labor_brackets', limit: 30 },
    })
  })

  it('getBracketsDiff', async () => {
    mockGet.mockResolvedValue({ data: { id: 7, brackets: [] } })
    await govData.getBracketsDiff(7)
    expect(mockGet).toHaveBeenCalledWith('/gov-data/staging/brackets/7/diff')
  })
})
