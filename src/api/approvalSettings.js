import api from './index'

export const getApprovalPolicies = () =>
  api.get('/approval-settings/policies')

export const updateApprovalPolicies = (policies) =>
  api.put('/approval-settings/policies', { policies })

export const getApprovalLogs = (docType, docId) =>
  api.get('/approval-settings/logs', { params: { doc_type: docType, doc_id: docId } })
