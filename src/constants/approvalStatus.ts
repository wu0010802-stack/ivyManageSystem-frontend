export const APPROVAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const

export type ApprovalStatus = typeof APPROVAL_STATUS[keyof typeof APPROVAL_STATUS]

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: '待審',
  approved: '已核准',
  rejected: '已駁回',
}
