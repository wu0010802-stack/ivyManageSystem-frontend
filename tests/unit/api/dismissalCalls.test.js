/**
 * tests/unit/api/dismissalCalls.test.js
 *
 * 驗證 src/api/dismissalCalls.ts wrapper（HTTP 端點 + WS_CLOSE 常數）。
 * 不測 createDismissalWebSocket 本體（涉及 WebSocket / location 依賴）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGet, mockPost, mockPut, mockDelete, mockPatch } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPut: vi.fn(),
  mockDelete: vi.fn(),
  mockPatch: vi.fn(),
}))

vi.mock('@/api/index', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete,
    patch: mockPatch,
  },
}))

import * as mod from '@/api/dismissalCalls'

describe('dismissalCalls api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDelete.mockReset()
    mockPatch.mockReset()
    mockGet.mockResolvedValue({ data: {} })
    mockPost.mockResolvedValue({ data: {} })
  })

  it('createDismissalCall POST /dismissal-calls', async () => {
    const payload = { student_id: 1 }
    await mod.createDismissalCall(payload)
    expect(mockPost).toHaveBeenCalledWith('/dismissal-calls', payload)
  })

  it('getDismissalCalls GET /dismissal-calls with params', async () => {
    await mod.getDismissalCalls({ status: 'pending' })
    expect(mockGet).toHaveBeenCalledWith('/dismissal-calls', { params: { status: 'pending' } })
  })

  it('cancelDismissalCall POST /dismissal-calls/:id/cancel', async () => {
    await mod.cancelDismissalCall(42)
    expect(mockPost).toHaveBeenCalledWith('/dismissal-calls/42/cancel')
  })

  it('getPortalDismissalCalls GET /portal/dismissal-calls', async () => {
    await mod.getPortalDismissalCalls()
    expect(mockGet).toHaveBeenCalledWith('/portal/dismissal-calls')
  })

  it('getPortalPendingCount GET /portal/dismissal-calls/pending-count', async () => {
    await mod.getPortalPendingCount()
    expect(mockGet).toHaveBeenCalledWith('/portal/dismissal-calls/pending-count')
  })

  it('acknowledgeDismissalCall POST /portal/dismissal-calls/:id/acknowledge', async () => {
    await mod.acknowledgeDismissalCall(42)
    expect(mockPost).toHaveBeenCalledWith('/portal/dismissal-calls/42/acknowledge')
  })

  it('completeDismissalCall POST /portal/dismissal-calls/:id/complete', async () => {
    await mod.completeDismissalCall(42)
    expect(mockPost).toHaveBeenCalledWith('/portal/dismissal-calls/42/complete')
  })

  it('WS_CLOSE 常數對應後端定義', () => {
    expect(mod.WS_CLOSE).toEqual({
      MISSING_TOKEN: 4001,
      INVALID_TOKEN: 4003,
      FORBIDDEN: 4007,
    })
  })

  it('createDismissalWebSocket 為 function export', () => {
    expect(typeof mod.createDismissalWebSocket).toBe('function')
  })
})
