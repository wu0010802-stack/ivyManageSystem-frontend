// submitter 角色 tag（WorkbenchApprovalsView 顯示送單人角色）。
// 須涵蓋後端 utils/permissions.py ROLE_LABELS 全部 7 角色——送單人可為任何角色
// （園長/會計也會送假/加班），缺漏會導致 tag 空白。label 為簡寫、語意對齊後端；
// tag type（顏色）為前端關注點，後端 API 不回傳。
export const ROLE_TAG_MAP = {
  admin:      { label: '管理員', type: 'danger' },
  principal:  { label: '園長',   type: 'warning' },
  supervisor: { label: '主管',   type: 'warning' },
  hr:         { label: '人資',   type: 'success' },
  accountant: { label: '會計',   type: 'success' },
  teacher:    { label: '教師',   type: 'info' },
  parent:     { label: '家長',   type: 'info' },
}

export const OVERTIME_TYPE_MAP = {
  weekday: { label: '平日',           type: '' },
  weekend: { label: '假日',           type: 'warning' },
  holiday: { label: '例假日/國定假日', type: 'danger' },
}

// 表單用選項：含費率說明（依勞基法第 24 條）
export const OVERTIME_TYPES = [
  { value: 'weekday', label: '平日',           desc: '前2h ×1.34，超過2h ×1.67' },
  { value: 'weekend', label: '假日',           desc: '前2h ×1.34，3~8h ×1.67，超8h ×2.67（最低計2h）' },
  { value: 'holiday', label: '例假日/國定假日', desc: '全部 ×2.0' },
]

export const CORRECTION_TYPE_MAP = {
  punch_in:  { label: '補上班卡', type: 'warning' },
  punch_out: { label: '補下班卡', type: 'info' },
  both:      { label: '補全天',   type: 'danger' },
}

export const SUBSTITUTE_STATUS_MAP = {
  not_required: { label: '免代理',   type: 'info' },
  pending:      { label: '待回應',   type: 'warning' },
  accepted:     { label: '已接受',   type: 'success' },
  rejected:     { label: '已拒絕',   type: 'danger' },
  waived:       { label: '主管略過', type: 'info' },
}

export const ACTION_LABELS    = { approved: '核准', rejected: '駁回', cancelled: '取消' }
export const ACTION_TAG_TYPES = { approved: 'success', rejected: 'danger', cancelled: 'warning' }
