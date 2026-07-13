import type { PermissionPickerDefinition } from '@/components/settings/PermissionPicker.vue'

// GET /auth/permissions 的 roles 定義（一期起含 flags：super_admin / parent / portal_only）。
// schema.d.ts 對此 endpoint 的 roles 是 { [key: string]: unknown }（後端未標 response_model
// 細型），故此為手動描形——欄位對齊 utils/permissions.py get_permission_definitions。
export interface RoleDef {
  label: string
  description: string
  permissions: string[]
  is_core: boolean
  flags?: string[]
}

export type RolesDefinition = PermissionPickerDefinition & { roles: Record<string, RoleDef> }

export const FLAG_SUPER_ADMIN = 'super_admin'
export const FLAG_PARENT = 'parent'
export const FLAG_PORTAL_ONLY = 'portal_only'

// 審核政策 doc_type（後端 VALID_POLICY_DOC_TYPES，api/approval_settings.py）
export const DOC_TYPES = ['all', 'leave', 'overtime', 'punch_correction'] as const
export type DocType = (typeof DOC_TYPES)[number]
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  all: '共同設定',
  leave: '請假',
  overtime: '加班',
  punch_correction: '補打卡',
}
