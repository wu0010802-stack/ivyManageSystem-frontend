import api from './index'
import type { ApiBody, AxiosResp } from './_generated/typed'
import type { DerivedValue } from '@/types/provenance'

// ============ Year-End Cycles 年終週期 ============

export const listYearEndCycles = () => api.get('/year_end/cycles')

export const createYearEndCycle = (payload: unknown) =>
  api.post('/year_end/cycles', payload)

// ============ Org Year Settings ============

export const listOrgYearSettings = (cycleId: number) =>
  api.get(`/year_end/cycles/${cycleId}/org_settings`)

/** Typed getter for org settings — use this in new views. */
export const getOrgSettings = (
  cycleId: number,
): AxiosResp<'/year_end/cycles/{cycle_id}/org_settings', 'get'> =>
  api.get(`/year_end/cycles/${cycleId}/org_settings`)

export const upsertOrgYearSettings = (cycleId: number, payload: unknown) =>
  api.post(`/year_end/cycles/${cycleId}/org_settings`, payload)

// ============ Class Enrollment Targets ============

export const listClassEnrollmentTargets = (cycleId: number) =>
  api.get(`/year_end/cycles/${cycleId}/class_targets`)

/** Typed getter for class enrollment targets — use this in new views. */
export const getClassTargets = (
  cycleId: number,
): AxiosResp<'/year_end/cycles/{cycle_id}/class_targets', 'get'> =>
  api.get(`/year_end/cycles/${cycleId}/class_targets`)

// ============ Settlements ============

export const listYearEndSettlements = (cycleId: number) =>
  api.get(`/year_end/cycles/${cycleId}/settlements`)

/** Typed getter for cycle settlements — use this in new views. */
export const getCycleSettlements = (
  cycleId: number,
): AxiosResp<'/year_end/cycles/{cycle_id}/settlements', 'get'> =>
  api.get(`/year_end/cycles/${cycleId}/settlements`)

export const signSupervisorSettlement = (settlementId: number) =>
  api.post(`/year_end/settlements/${settlementId}/sign_supervisor`)

export const signAccountingSettlement = (settlementId: number) =>
  api.post(`/year_end/settlements/${settlementId}/sign_accounting`)

export const finalizeSettlement = (settlementId: number) =>
  api.post(`/year_end/settlements/${settlementId}/finalize`)

// 批次簽核/核定（新端點，push 前 gen:api 補 schema.d.ts）；回 {succeeded_ids, succeeded_count, failed:[{settlement_id,reason}]}
export const signSupervisorBatch = (settlementIds: number[]) =>
  api.post('/year_end/settlements/sign_supervisor_batch', { settlement_ids: settlementIds })
export const signAccountingBatch = (settlementIds: number[]) =>
  api.post('/year_end/settlements/sign_accounting_batch', { settlement_ids: settlementIds })
export const finalizeBatch = (settlementIds: number[]) =>
  api.post('/year_end/settlements/finalize_batch', { settlement_ids: settlementIds })

// ============ Special Bonuses ============

export const listSpecialBonuses = (cycleId: number, params: unknown = {}) =>
  api.get(`/year_end/cycles/${cycleId}/special_bonuses`, { params })

export const addSpecialBonus = (cycleId: number, payload: unknown) =>
  api.post(`/year_end/cycles/${cycleId}/special_bonuses`, payload)

// ============ Excel I/O ============

export const importYearEndExcel = (
  file: File,
  {
    startDate,
    endDate,
    bonusCalcDate,
    orgRateFirst = 83.6,
    orgRateSecond = 91.5,
    enrollmentTarget = 160,
  }: {
    startDate: string
    endDate: string
    bonusCalcDate: string
    orgRateFirst?: number
    orgRateSecond?: number
    enrollmentTarget?: number
  },
) => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/year_end/cycles/import_excel', fd, {
    params: {
      start_date: startDate,
      end_date: endDate,
      bonus_calc_date: bonusCalcDate,
      org_achievement_rate_first: orgRateFirst,
      org_achievement_rate_second: orgRateSecond,
      enrollment_target: enrollmentTarget,
    },
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const exportYearEndSummaryXlsxUrl = (cycleId: number) =>
  `${api.defaults.baseURL || '/api'}/year_end/cycles/${cycleId}/summary.xlsx`

export const exportYearEndTransferRosterXlsxUrl = (cycleId: number) =>
  `${api.defaults.baseURL || '/api'}/year_end/cycles/${cycleId}/transfer_roster.xlsx`

// ============ Grid / Build / Manual Patch ============

/** 回傳每位員工一列的年終結算 grid（含 special_bonuses 依 bonus_type 加總）。 */
export const getYearEndGrid = (
  cycleId: number,
): AxiosResp<'/year_end/cycles/{cycle_id}/grid', 'get'> =>
  api.get(`/year_end/cycles/${cycleId}/grid`)

/** 跨員工計算並 upsert 年終結算單（idempotent）。非 DRAFT 已簽核的結算不覆寫。 */
export const buildSettlements = (
  cycleId: number,
  data: ApiBody<'/year_end/cycles/{cycle_id}/build-settlements', 'post'>,
): AxiosResp<'/year_end/cycles/{cycle_id}/build-settlements', 'post'> =>
  api.post(`/year_end/cycles/${cycleId}/build-settlements`, data)

/** 手動微調結算：獎懲扣項、超額獎金、在職月數覆寫。自動重算受影響的結算單。 */
export const manualPatchSettlement = (
  settlementId: number,
  data: ApiBody<'/year_end/settlements/{settlement_id}/manual', 'patch'>,
): AxiosResp<'/year_end/settlements/{settlement_id}/manual', 'patch'> =>
  api.patch(`/year_end/settlements/${settlementId}/manual`, data)

/** 新增/更新全校年度設定（upsert by cycle+semester）。 */
export const postOrgSettings = (
  cycleId: number,
  data: ApiBody<'/year_end/cycles/{cycle_id}/org_settings', 'post'>,
): AxiosResp<'/year_end/cycles/{cycle_id}/org_settings', 'post'> =>
  api.post(`/year_end/cycles/${cycleId}/org_settings`, data)

/** 手動設定班級招生目標（upsert by cycle+semester+classroom）。 */
export const upsertClassTarget = (
  cycleId: number,
  data: ApiBody<'/year_end/cycles/{cycle_id}/class_targets', 'post'>,
): AxiosResp<'/year_end/cycles/{cycle_id}/class_targets', 'post'> =>
  api.post(`/year_end/cycles/${cycleId}/class_targets`, data)

// ============ Appraisal Payout ============

export const previewAppraisalPayout = (year: number): AxiosResp<'/year_end/appraisal-payout/preview', 'get'> =>
  api.get('/year_end/appraisal-payout/preview', { params: { year } })

export const generateAppraisalPayout = (
  data: ApiBody<'/year_end/appraisal-payout/generate', 'post'>
): AxiosResp<'/year_end/appraisal-payout/generate', 'post'> =>
  api.post('/year_end/appraisal-payout/generate', data)

export const listAppraisalPayouts = (year: number): AxiosResp<'/year_end/appraisal-payout', 'get'> =>
  api.get('/year_end/appraisal-payout', { params: { year } })

export const voidAppraisalPayouts = (year: number): AxiosResp<'/year_end/appraisal-payout/{year}', 'delete'> =>
  api.delete(`/year_end/appraisal-payout/${year}`, { params: { confirm: true } })

// ============ Provenance 扣款溯源 ============

/**
 * 取得指定 key 的扣款溯源明細。
 * 手寫型別（後端 P0 尚未 gen:api），不依賴 schema.d.ts。
 */
export const getProvenance = (
  key: string,
  cycleId: number,
  employeeId: number,
): Promise<{ data: DerivedValue }> =>
  api.get<DerivedValue>(`/provenance/${key}`, {
    params: { cycle_id: cycleId, employee_id: employeeId },
  }) as Promise<{ data: DerivedValue }>
