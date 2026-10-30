import type { AxiosResp, Schema } from '@/api/_generated/typed'
import api from './index'

/** 後端 `api/parent_portal/fees.py` 已掛 response_model，型別一律取自 schema.d.ts。 */
export type ParentFeesSummary = Schema<'ParentFeesSummaryOut'>
export type ParentFeesStudentSummary = Schema<'ParentFeesStudentSummaryOut'>
export type ParentFeeRecord = Schema<'ParentFeeRecordOut'>
export type ParentFeePayment = Schema<'ParentFeePaymentOut'>
export type ParentFeeRefund = Schema<'ParentFeeRefundOut'>

export const getFeesSummary = (): AxiosResp<'/parent/fees/summary', 'get'> =>
  api.get('/parent/fees/summary')

export const listFeeRecords = (
  studentId: number,
  period?: string,
): AxiosResp<'/parent/fees/records', 'get'> =>
  api.get('/parent/fees/records', {
    params: {
      student_id: studentId,
      ...(period ? { period } : {}),
    },
  })

export const getFeePayments = (
  recordId: number,
): AxiosResp<'/parent/fees/records/{record_id}/payments', 'get'> =>
  api.get(`/parent/fees/records/${recordId}/payments`)
