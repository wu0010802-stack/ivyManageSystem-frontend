/**
 * P0c-1 + P0c-2: 家長 consent + DSR API wrappers。
 *
 * Backend endpoints:
 * - GET  /api/parent/me/consents          當前 status + history
 * - POST /api/parent/me/consent           寫同意/撤回事件
 * - GET  /api/parent/policies/current     當前生效 policy
 * - POST /api/parent/me/delete-request    刪除申請
 * - POST /api/parent/me/correct-request   更正申請
 * - POST /api/parent/me/opt-out           停止處理申請
 * - GET  /api/parent/me/dsr-requests      自己歷次申請
 *
 * Refs: ivy-backend docs/superpowers/specs/2026-05-28-consent-dsr-rights-design.md
 */
import api from './index'

export const CONSENT_SCOPE_SERVICE_ESSENTIAL = 'service_essential'
export const CONSENT_SCOPE_PHOTO_PUBLISH = 'photo_publish'
export const CONSENT_SCOPE_LINE_PUSH = 'line_push'
export const CONSENT_SCOPE_CROSS_BORDER_TRANSFER = 'cross_border_transfer'

export const CONSENT_SCOPES = [
  CONSENT_SCOPE_SERVICE_ESSENTIAL,
  CONSENT_SCOPE_PHOTO_PUBLISH,
  CONSENT_SCOPE_LINE_PUSH,
  CONSENT_SCOPE_CROSS_BORDER_TRANSFER,
] as const

export type ConsentScope = (typeof CONSENT_SCOPES)[number]

export const SCOPE_LABELS: Record<ConsentScope, string> = {
  service_essential: '服務必要（必同意才能使用 portal）',
  photo_publish: '兒童照片公開於家長端',
  line_push: 'LINE 推播通知',
  cross_border_transfer: '跨境傳輸（雲端服務位於美國）',
}

export const SCOPE_DESCRIPTIONS: Record<ConsentScope, string> = {
  service_essential:
    '為提供出席、聯絡簿、活動公告等核心服務，需處理您與子女的基本識別資料。',
  photo_publish:
    '允許園所將子女的學習活動照片透過本系統提供給您查閱與下載（不含對外公開）。',
  line_push:
    '允許園所透過 LINE Bot 推播即時通知（如請假審核結果、活動提醒）。',
  cross_border_transfer:
    '本服務部分基礎設施位於美國 AWS region。如不同意，部分雲端功能將降級。',
}

export interface PolicyVersionOut {
  id: number
  version: string
  effective_at: string
  document_path: string
  summary: string | null
}

export interface ScopeStatusOut {
  scope: string
  consented: boolean | null
  consented_at: string | null
  policy_version_id: number | null
}

export interface ConsentEventOut {
  id: number
  scope: string
  consented: boolean
  consented_at: string
  policy_version_id: number
}

export interface ConsentsResponseOut {
  current_status: ScopeStatusOut[]
  history: ConsentEventOut[]
}

export interface DsrRequestOut {
  id: number
  request_type: string
  status: string
  subject_entity_type: string | null
  subject_entity_id: number | null
  field_name: string | null
  scope: string | null
  reason: string | null
  submitted_at: string
  decided_at: string | null
  decision_note: string | null
}

// ── Consent ──

export const getCurrentPolicy = () =>
  api.get<PolicyVersionOut>('/parent/policies/current')

export const getMyConsents = () =>
  api.get<ConsentsResponseOut>('/parent/me/consents')

export const writeConsent = (payload: {
  policy_version_id: number
  scope: ConsentScope
  consented: boolean
  note?: string
}) => api.post<ConsentEventOut>('/parent/me/consent', payload)

// ── DSR ──

export const submitDeleteRequest = (payload: {
  subject_entity_type: 'student' | 'guardian'
  subject_entity_id: number
  reason: string
}) => api.post<DsrRequestOut>('/parent/me/delete-request', payload)

export const submitCorrectRequest = (payload: {
  subject_entity_type: 'student' | 'guardian'
  subject_entity_id: number
  field_name: string
  new_value: string
  reason: string
}) => api.post<DsrRequestOut>('/parent/me/correct-request', payload)

export const submitOptOutRequest = (payload: {
  scope: ConsentScope
  reason?: string
}) => api.post<DsrRequestOut>('/parent/me/opt-out', payload)

export const listMyDsrRequests = () =>
  api.get<DsrRequestOut[]>('/parent/me/dsr-requests')
