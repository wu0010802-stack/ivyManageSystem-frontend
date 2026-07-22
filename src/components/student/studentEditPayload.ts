const HEALTH_FIELDS = ['allergy', 'medication'] as const
const SPECIAL_NEEDS_FIELDS = [
  'special_needs',
  'is_special_education',
  'disability_type',
  'disability_level',
  'disability_cert_no',
  'disability_cert_expiry',
] as const
const GUARDIAN_FIELDS = [
  'parent_name',
  'parent_phone',
  'address',
  'emergency_contact_name',
  'emergency_contact_phone',
  'emergency_contact_relation',
] as const

interface PayloadOptions {
  isEdit: boolean
  initial: Record<string, unknown> | null | undefined
  canHealthWrite: boolean
  canSpecialNeedsWrite: boolean
  canGuardianWrite: boolean
}

export function buildStudentMutationPayload(
  form: Record<string, unknown>,
  options: PayloadOptions,
): Record<string, unknown> {
  const payload = { ...form }

  // 編輯端只 PATCH API 實際讀到的欄位。列表／detail 未回出的政府欄位不可用 UI
  // 預設值補齊，否則 nationality='本國'、is_disadvantaged=false 會覆寫既有資料。
  if (options.isEdit) {
    const initial = options.initial ?? {}
    const classroomChanged = (
      Object.prototype.hasOwnProperty.call(initial, 'classroom_id')
      && Object.prototype.hasOwnProperty.call(payload, 'classroom_id')
      && !Object.is(payload.classroom_id, initial.classroom_id)
    )
    for (const key of Object.keys(payload)) {
      if (!Object.prototype.hasOwnProperty.call(initial, key)) {
        Reflect.deleteProperty(payload, key)
      } else if (Object.is(payload[key], initial[key])) {
        Reflect.deleteProperty(payload, key)
      }
    }
    if (classroomChanged) {
      payload.source_classroom_id = initial.classroom_id ?? null
    }
  }

  if (!options.canHealthWrite) {
    for (const key of HEALTH_FIELDS) Reflect.deleteProperty(payload, key)
  }
  if (!options.canSpecialNeedsWrite) {
    for (const key of SPECIAL_NEEDS_FIELDS) Reflect.deleteProperty(payload, key)
  }
  if (!options.canGuardianWrite) {
    for (const key of GUARDIAN_FIELDS) Reflect.deleteProperty(payload, key)
  }
  return payload
}
