import { getApprovalPolicies } from '@/api/approvalSettings'
import { createFetchStore } from './_createFetchStore'

export const useApprovalPolicyStore = createFetchStore('approvalPolicy', getApprovalPolicies, {
  dataKey: 'policies',
  methodName: 'fetchPolicies',
  silentFail: true,
})
