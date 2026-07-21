/** 年終工作區左導軌步驟（單一來源，shell 與測試共用）。 */
export type WorkspaceStepKey = 'config' | 'grid' | 'detail'

export interface WorkspaceStep {
  key: WorkspaceStepKey
  label: string
  hint: string
}

export const WORKSPACE_STEPS: WorkspaceStep[] = [
  { key: 'config', label: '設定', hint: '招生目標與班級編制' },
  { key: 'grid', label: '試算 · 調整', hint: '總表試算與手動調整' },
  { key: 'detail', label: '簽核', hint: '結算明細與兩關簽核' },
]

export const DEFAULT_STEP: WorkspaceStepKey = 'detail'

export function normalizeStep(raw: unknown): WorkspaceStepKey {
  return raw === 'config' || raw === 'grid' || raw === 'detail' ? raw : DEFAULT_STEP
}
