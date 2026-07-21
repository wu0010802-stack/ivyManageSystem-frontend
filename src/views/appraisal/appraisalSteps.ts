export type AppraisalStepKey = 'create' | 'participants' | 'manual' | 'sync' | 'recompute' | 'sign'

export interface AppraisalStep {
  key: AppraisalStepKey
  label: string
  hint: string
}

// 固定順序，比照 year-end workspaceSteps.ts 的視覺語言（此為橫向引導條）
export const APPRAISAL_STEPS: AppraisalStep[] = [
  { key: 'create', label: '建立週期', hint: '選定學年學期，開啟本期考核' },
  { key: 'participants', label: '加入教師', hint: '把所有在職教師加入考核' },
  { key: 'manual', label: '手填事件', hint: '填寫會議、活動等人工次數' },
  { key: 'sync', label: '同步分數', hint: '把出缺勤與活動資料同步為分數' },
  { key: 'recompute', label: '重算彙整', hint: '重新計算每人考核總分與等第' },
  { key: 'sign', label: '簽核核定', hint: '主管與會計逐關簽核並核定' },
]

export interface AppraisalStepInput {
  hasCycle: boolean
  cycleStatus: 'OPEN' | 'LOCKED' | 'CLOSED' | null
  participantCount: number
  hasNonParticipant: boolean
  summaryCount: number
  pendingSignCount: number
  finalizedCount: number
  totalCount: number
}

export type AppraisalStepStatus = 'done' | 'current' | 'todo' | 'disabled'

/**
 * 輕量 checklist 狀態推導（非強制精靈）。因批次 3 無新後端 progress 端點，
 * 完成訊號取自當期總覽既有資料：cycle 存在、成員數、非成員旗標、彙整數、簽核統計。
 * 手填為選配資料輸入，一旦成員齊全即「可進行」，無硬完成判定（不 disabled、不強制 done）。
 */
export function deriveAppraisalStepStatuses(
  input: AppraisalStepInput,
): Record<AppraisalStepKey, AppraisalStepStatus> {
  const {
    hasCycle, participantCount, hasNonParticipant,
    summaryCount, pendingSignCount, finalizedCount, totalCount,
  } = input

  const createDone = hasCycle
  const participantsDone = hasCycle && participantCount > 0 && !hasNonParticipant
  const synced = summaryCount > 0
  const allFinalized = totalCount > 0 && finalizedCount === totalCount && pendingSignCount === 0

  const status: Record<AppraisalStepKey, AppraisalStepStatus> = {
    create: createDone ? 'done' : 'current',
    participants: !hasCycle ? 'disabled' : participantsDone ? 'done' : 'current',
    manual: !participantsDone ? 'disabled' : 'todo',
    sync: !participantsDone ? 'disabled' : synced ? 'done' : 'todo',
    recompute: !synced ? 'disabled' : 'todo',
    sign: !synced ? 'disabled' : allFinalized ? 'done' : 'todo',
  }

  // 唯一 current 高亮：第一個非 done 且非 disabled 的步驟
  const current = deriveCurrentAppraisalStep(input)
  for (const step of APPRAISAL_STEPS) {
    if (status[step.key] === 'todo' && step.key === current) status[step.key] = 'current'
  }
  return status
}

export function deriveCurrentAppraisalStep(input: AppraisalStepInput): AppraisalStepKey {
  const { hasCycle, participantCount, hasNonParticipant, summaryCount, finalizedCount, totalCount, pendingSignCount } = input
  if (!hasCycle) return 'create'
  if (participantCount === 0 || hasNonParticipant) return 'participants'
  if (summaryCount === 0) return 'sync'
  if (!(totalCount > 0 && finalizedCount === totalCount && pendingSignCount === 0)) return 'sign'
  return 'sign'
}
