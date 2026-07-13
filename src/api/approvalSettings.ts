import api from './index'
import type { AxiosResponse } from 'axios'
import type { ApiBody } from '@/api/_generated/typed'

// GET /approval-settings/policies 未標 response_model → 手動描形
// （對齊 api/approval_settings.py get_approval_policies 回傳 dict）
export interface ApprovalPolicyRow {
  id: number
  doc_type: string
  submitter_role: string
  approver_roles: string // CSV，順序即逐級簽核關卡鏈
  is_active: boolean
}

export type PolicyItem = ApiBody<'/approval-settings/policies', 'put'>['policies'][number]

export const getApprovalPolicies = () =>
  api.get('/approval-settings/policies') as Promise<AxiosResponse<ApprovalPolicyRow[]>> // TODO(ts-strict): waiting on backend response_model

// 逐條 upsert（key = submitter_role + doc_type）；取消 doc_type 覆寫 = is_active: false
export const updateApprovalPolicies = (policies: PolicyItem[]) => {
  const body: ApiBody<'/approval-settings/policies', 'put'> = { policies }
  return api.put('/approval-settings/policies', body)
}

export const getApprovalLogs = (docType: string, docId: number) =>
  api.get('/approval-settings/logs', { params: { doc_type: docType, doc_id: docId } })
