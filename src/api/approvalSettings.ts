import api from './index'

export const getApprovalPolicies = () =>
  api.get('/approval-settings/policies')

export const updateApprovalPolicies = (policies: unknown) =>
  api.put('/approval-settings/policies', { policies })

export const getApprovalLogs = (docType: string, docId: number) =>
  api.get('/approval-settings/logs', { params: { doc_type: docType, doc_id: docId } })
