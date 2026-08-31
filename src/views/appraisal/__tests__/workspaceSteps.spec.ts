import { describe, it, expect } from 'vitest'
import { APPRAISAL_WORKSPACE_STEPS, DEFAULT_APPRAISAL_STEP, normalizeAppraisalStep } from '../workspaceSteps'

describe('appraisal workspaceSteps', () => {
  it('三步驟依序為 準備資料/審查例外/簽核完成', () => {
    expect(APPRAISAL_WORKSPACE_STEPS.map((s) => s.key)).toEqual(['prepare', 'exceptions', 'sign'])
    expect(APPRAISAL_WORKSPACE_STEPS.map((s) => s.label)).toEqual(['準備資料', '審查例外', '簽核完成'])
  })
  it('預設步驟為 prepare', () => {
    expect(DEFAULT_APPRAISAL_STEP).toBe('prepare')
  })
  it('normalizeAppraisalStep 對合法值原樣回傳', () => {
    expect(normalizeAppraisalStep('prepare')).toBe('prepare')
    expect(normalizeAppraisalStep('exceptions')).toBe('exceptions')
    expect(normalizeAppraisalStep('sign')).toBe('sign')
  })
  it('normalizeAppraisalStep 對非法值/undefined/null/number 回傳預設值', () => {
    expect(normalizeAppraisalStep('bogus')).toBe('prepare')
    expect(normalizeAppraisalStep(undefined)).toBe('prepare')
    expect(normalizeAppraisalStep(null)).toBe('prepare')
    expect(normalizeAppraisalStep(123)).toBe('prepare')
  })
})
