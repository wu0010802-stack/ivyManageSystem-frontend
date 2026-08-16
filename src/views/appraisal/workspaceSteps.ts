/** 考核工作區左導軌步驟（單一來源，shell 與測試共用）。仿 src/views/yearEnd/workspaceSteps.ts 慣例。 */
export type AppraisalStepKey = 'prepare' | 'exceptions' | 'sign'

export interface AppraisalWorkspaceStep {
  key: AppraisalStepKey
  label: string
  hint: string
}

export const APPRAISAL_WORKSPACE_STEPS: AppraisalWorkspaceStep[] = [
  { key: 'prepare', label: '準備資料', hint: '名冊、資料來源與更新' },
  { key: 'exceptions', label: '審查例外', hint: '缺資料、衝突與人工覆寫' },
  { key: 'sign', label: '簽核完成', hint: '結果預覽與批次簽核' },
]

export const DEFAULT_APPRAISAL_STEP: AppraisalStepKey = 'prepare'

export function normalizeAppraisalStep(raw: unknown): AppraisalStepKey {
  return raw === 'prepare' || raw === 'exceptions' || raw === 'sign' ? raw : DEFAULT_APPRAISAL_STEP
}
