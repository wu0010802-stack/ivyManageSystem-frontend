import { describe, it, expect } from 'vitest'
import {
  APPRAISAL_STEPS,
  deriveAppraisalStepStatuses,
  deriveCurrentAppraisalStep,
  type AppraisalStepInput,
} from '../appraisalSteps'

const base: AppraisalStepInput = {
  hasCycle: false, cycleStatus: null, participantCount: 0, hasNonParticipant: false,
  summaryCount: 0, pendingSignCount: 0, finalizedCount: 0, totalCount: 0,
}

describe('APPRAISAL_STEPS', () => {
  it('六步固定順序', () => {
    expect(APPRAISAL_STEPS.map(s => s.key)).toEqual(
      ['create', 'participants', 'manual', 'sync', 'recompute', 'sign'],
    )
  })
})

describe('deriveAppraisalStepStatuses', () => {
  it('無週期時只有 create 是 current，其餘 disabled', () => {
    const s = deriveAppraisalStepStatuses(base)
    expect(s.create).toBe('current')
    expect(s.participants).toBe('disabled')
    expect(s.sign).toBe('disabled')
  })

  it('有週期無成員時 create=done、participants=current', () => {
    const s = deriveAppraisalStepStatuses({
      ...base, hasCycle: true, cycleStatus: 'OPEN', participantCount: 0, hasNonParticipant: true,
    })
    expect(s.create).toBe('done')
    expect(s.participants).toBe('current')
  })

  it('成員齊全後 participants=done、manual 可進行', () => {
    const s = deriveAppraisalStepStatuses({
      ...base, hasCycle: true, cycleStatus: 'OPEN', participantCount: 10, hasNonParticipant: false,
    })
    expect(s.participants).toBe('done')
    expect(s.manual).not.toBe('disabled')
  })

  it('全員定稿後 sign=done', () => {
    const s = deriveAppraisalStepStatuses({
      ...base, hasCycle: true, cycleStatus: 'CLOSED', participantCount: 10, hasNonParticipant: false,
      summaryCount: 10, pendingSignCount: 0, finalizedCount: 10, totalCount: 10,
    })
    expect(s.sign).toBe('done')
  })
})

describe('deriveCurrentAppraisalStep', () => {
  it('無週期→create', () => {
    expect(deriveCurrentAppraisalStep(base)).toBe('create')
  })
  it('有成員未同步→sign 前的第一個未完成步驟', () => {
    const cur = deriveCurrentAppraisalStep({
      ...base, hasCycle: true, cycleStatus: 'OPEN', participantCount: 10, hasNonParticipant: false,
      summaryCount: 0,
    })
    expect(['manual', 'sync', 'recompute']).toContain(cur)
  })
})
