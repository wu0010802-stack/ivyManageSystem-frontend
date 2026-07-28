import { describe, it, expect } from 'vitest'

/**
 * 考核年終獎金欄「已移除」驗證（取代原欄位存在性 spec）：
 *
 * 決策⑥B（2026-06-02）後考核年終走年終 E化獨立轉帳、表外，engine 對
 * SalaryRecord.appraisal_year_end_bonus 恆填 0，且該欄不在
 * SalaryRecordItemOut response schema——StepReview 的考核年終欄是
 * 資料源被 response_model 濾掉的殭屍 UI（恆顯示「—」、dialog 靜默失敗）。
 * 用 source grep 釘住三件事，防止欄位被誤搬回來：
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const stepReviewPath = resolve(__dirname, '..', 'StepReview.vue')
const src = readFileSync(stepReviewPath, 'utf-8')

describe('StepReview appraisal_year_end_bonus removal', () => {
    it('不再渲染 appraisal_year_end_bonus 欄（決策⑥B 後為殭屍 UI）', () => {
        expect(src).not.toMatch(/appraisal_year_end_bonus/)
        expect(src).not.toContain('考核年終獎金')
    })

    it('含獎金實領公式透過共用 helper 納入未休折現，且不納入考核年終', () => {
        expect(src).toContain('computeTotalTakeHomeAmount(scope.row)')
        expect(src).toContain('computeBaseTransferAmount(scope.row)')
        expect(src).not.toMatch(/net_pay.*appraisal_year_end_bonus/s)
    })

    it('openAyeBreakdown handler 與 listAppraisalPayouts 依賴已移除', () => {
        expect(src).not.toContain('openAyeBreakdown')
        expect(src).not.toContain('listAppraisalPayouts')
    })
})
