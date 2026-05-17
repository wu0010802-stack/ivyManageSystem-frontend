/**
 * tests/api/appraisal.spec.js
 *
 * 驗證 appraisal.js Phase 1 Calibrate 新增的 6 個 wrapper：
 *   listScoringRules / getScoringRuleHistory / createScoringRule
 *   getManualEventCounts / batchUpsertManualEventCounts / previewAppraisalScore
 *
 * 註：src/api/appraisal.js 採 `import api from './index'` 慣例，
 * 與 fees-templates.spec.js 同樣 pattern：mock 的是 @/api/index 模組
 * （baseURL=/api 已由 axios instance 處理，url 不重複前綴）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGet, mockPost, mockPut } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPut: vi.fn(),
}))

vi.mock('@/api/index', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
  },
}))

import {
  listScoringRules,
  getScoringRuleHistory,
  createScoringRule,
  getManualEventCounts,
  batchUpsertManualEventCounts,
  previewAppraisalScore,
} from '@/api/appraisal'

describe('appraisal.js — Phase 1 Calibrate endpoints', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
  })

  it('listScoringRules GET /appraisal/scoring_rules with effective_on', async () => {
    mockGet.mockResolvedValueOnce({ data: [] })
    await listScoringRules('2026-06-01')
    expect(mockGet).toHaveBeenCalledWith('/appraisal/scoring_rules', {
      params: { effective_on: '2026-06-01' },
    })
  })

  it('getScoringRuleHistory GET /appraisal/scoring_rules/history with item_code', async () => {
    mockGet.mockResolvedValueOnce({ data: [] })
    await getScoringRuleHistory('LATE_EARLY')
    expect(mockGet).toHaveBeenCalledWith('/appraisal/scoring_rules/history', {
      params: { item_code: 'LATE_EARLY' },
    })
  })

  it('createScoringRule POST /appraisal/scoring_rules with payload', async () => {
    mockPost.mockResolvedValueOnce({ data: {} })
    const payload = {
      item_code: 'LATE_EARLY',
      effective_from: '2026-08-01',
      rule_type: 'PER_UNIT',
      rule_config: { per_unit_delta: -0.25 },
    }
    await createScoringRule(payload)
    expect(mockPost).toHaveBeenCalledWith('/appraisal/scoring_rules', payload)
  })

  it('getManualEventCounts GET /appraisal/cycles/:id/manual_event_counts', async () => {
    mockGet.mockResolvedValueOnce({ data: [] })
    await getManualEventCounts(3)
    expect(mockGet).toHaveBeenCalledWith('/appraisal/cycles/3/manual_event_counts')
  })

  it('batchUpsertManualEventCounts PUT to :batch endpoint', async () => {
    mockPut.mockResolvedValueOnce({ data: { ok: true } })
    await batchUpsertManualEventCounts(3, [
      { participant_id: 1, item_code: 'OTHER', count: 2 },
    ])
    expect(mockPut).toHaveBeenCalledWith(
      '/appraisal/cycles/3/manual_event_counts:batch',
      { entries: [{ participant_id: 1, item_code: 'OTHER', count: 2 }] },
    )
  })

  it('previewAppraisalScore POST /appraisal/cycles/:id/score_preview', async () => {
    mockPost.mockResolvedValueOnce({ data: { participants: [] } })
    await previewAppraisalScore(3)
    expect(mockPost).toHaveBeenCalledWith('/appraisal/cycles/3/score_preview')
  })
})
