import { describe, it, expect } from 'vitest'
import { deriveNextStep, type WorkbenchStats } from '../nextStep'

const base: WorkbenchStats = {
  appraisalCycle: { id: 1, label: '115 學年上學期', status: 'OPEN' },
  yearEndCycle: { id: 9, label: '114 學年度', status: 'OPEN' },
  blockingExceptions: 0,
  yearEndPendingSign: 0,
  appraisalPendingSign: 0,
  payoutReadyCount: 0,
  canAppraisal: true,
  canYearEnd: true,
  payoutYear: 2026,
}

describe('deriveNextStep 優先序', () => {
  it('任一統計未到齊（undefined）回 null', () => {
    expect(deriveNextStep({ ...base, blockingExceptions: undefined })).toBeNull()
  })
  it('阻斷例外最優先', () => {
    const s = deriveNextStep({ ...base, blockingExceptions: 2, yearEndPendingSign: 5 })
    expect(s?.key).toBe('exceptions')
    expect(s?.to).toBe('/appraisal-year-end/exceptions')
  })
  it('年終待簽（週期 OPEN）優於考核待簽', () => {
    const s = deriveNextStep({ ...base, yearEndPendingSign: 5, appraisalPendingSign: 3 })
    expect(s?.key).toBe('year-end-sign')
    expect(s?.to).toBe('/appraisal-year-end/year-end/cycles/9')
  })
  it('年終週期非 OPEN 時年終待簽不觸發，落到考核待簽', () => {
    const s = deriveNextStep({
      ...base,
      yearEndCycle: { id: 9, label: '114 學年度', status: 'LOCKED' },
      yearEndPendingSign: 5,
      appraisalPendingSign: 3,
    })
    expect(s?.key).toBe('appraisal-sign')
  })
  it('可發放次於簽核', () => {
    const s = deriveNextStep({ ...base, payoutReadyCount: 4 })
    expect(s?.key).toBe('payout')
    expect(s?.to).toBe('/appraisal-year-end/year-end/payout?year=2026')
  })
  it('缺考核週期時引導建立', () => {
    const s = deriveNextStep({ ...base, appraisalCycle: null })
    expect(s?.key).toBe('create-appraisal')
  })
  it('考核週期已建立但缺年終週期時引導建立年終', () => {
    const s = deriveNextStep({ ...base, yearEndCycle: null })
    expect(s?.key).toBe('create-year-end')
  })
  it('全部完成回 done', () => {
    expect(deriveNextStep(base)?.key).toBe('done')
  })
  it('缺考核週期但使用者無 APPRAISAL_READ 權限（考核卡未 render）時不應誤導去建立考核週期', () => {
    const s = deriveNextStep({ ...base, appraisalCycle: null, canAppraisal: false })
    expect(s?.key).not.toBe('create-appraisal')
    expect(s?.key).toBe('done')
  })
  it('缺年終週期但使用者無 YEAR_END_READ 權限（年終卡未 render）時不應誤導去建立年終週期', () => {
    const s = deriveNextStep({ ...base, yearEndCycle: null, canYearEnd: false })
    expect(s?.key).not.toBe('create-year-end')
    expect(s?.key).toBe('done')
  })
})
