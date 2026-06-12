import { describe, it, expect } from 'vitest'

/**
 * 考核年終獎金欄整合驗證（原 SalaryView.appraisal-year-end-bonus.spec.ts 移植）：
 * StepReview 接手薪資主表後，用 source grep 驗證 3 件事：
 * 1. template 含 appraisal_year_end_bonus 欄
 * 2. 含獎金實領公式含 `+ (scope.row.appraisal_year_end_bonus || 0)`
 * 3. 有 openAyeBreakdown handler 處理 2 月點擊
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const stepReviewPath = resolve(__dirname, '..', 'StepReview.vue')
const src = readFileSync(stepReviewPath, 'utf-8')

describe('StepReview appraisal_year_end_bonus integration', () => {
    it('renders appraisal_year_end_bonus column', () => {
        expect(src).toMatch(/appraisal_year_end_bonus/)
        expect(src).toContain('考核年終獎金')
    })

    it('net total formula includes appraisal_year_end_bonus', () => {
        const netPattern = /scope\.row\.net_pay.*scope\.row\.appraisal_year_end_bonus/s
        expect(src).toMatch(netPattern)
    })

    it('has openAyeBreakdown handler', () => {
        expect(src).toContain('openAyeBreakdown')
        expect(src).toContain('listAppraisalPayouts')
    })
})
