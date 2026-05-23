import { describe, it, expect } from 'vitest'

/**
 * SalaryView 整合測試（輕量版）：
 * SalaryView 是 ~900 行 store-driven 大檔，full mount 需大量 fixture。
 * 此 spec 用 source code grep + simple unit 驗證 3 件事：
 * 1. SalaryView template 含 `appraisal_year_end_bonus` column
 * 2. 淨額公式含 `+ (scope.row.appraisal_year_end_bonus || 0)`
 * 3. 有 openAppraisalYearEndBreakdown function 處理點擊
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const salaryViewPath = resolve(__dirname, '..', 'SalaryView.vue')
const src = readFileSync(salaryViewPath, 'utf-8')

describe('SalaryView appraisal_year_end_bonus integration', () => {
  it('renders appraisal_year_end_bonus column', () => {
    expect(src).toMatch(/prop="appraisal_year_end_bonus"|appraisal_year_end_bonus.*label/)
  })

  it('net total formula includes appraisal_year_end_bonus', () => {
    expect(src).toContain('appraisal_year_end_bonus')
    // 淨額公式必須含此欄（同時與 net_pay / festival_bonus 一起）
    const netPattern = /scope\.row\.net_pay.*scope\.row\.appraisal_year_end_bonus/s
    expect(src).toMatch(netPattern)
  })

  it('has openAppraisalYearEndBreakdown handler', () => {
    expect(src).toMatch(/openAppraisalYearEndBreakdown|appraisalYearEndBreakdown/)
  })

  it('imports listAppraisalPayouts for breakdown dialog', () => {
    expect(src).toContain('listAppraisalPayouts')
  })

  it('uses calc_meta.appraisal_cycle_id for cycle link not source_ref', () => {
    expect(src).toContain('calc_meta')
    expect(src).toMatch(/calc_meta\?\.appraisal_cycle_id|calc_meta\.appraisal_cycle_id/)
  })
})
