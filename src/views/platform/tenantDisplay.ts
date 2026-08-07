/**
 * 總部 console 的純顯示工具（無 IO、可單測）。
 *
 * 狀態四態與後端 `tenants.status` 的 CHECK 一致（CT-D-01）：
 * `provisioning | active | suspended | archived`；middleware 依它回 503/200/403/404
 * （CT-A-03）。前端只負責把它翻成人看得懂的字＋顏色，不做任何狀態機推導。
 */

export type TenantStatus = 'provisioning' | 'active' | 'suspended' | 'archived'

export type TagType = 'success' | 'info' | 'warning' | 'danger' | 'primary'

const STATUS_LABELS: Record<string, string> = {
  provisioning: '建置中',
  active: '啟用中',
  suspended: '已停用',
  archived: '已封存',
}

const STATUS_TAG_TYPES: Record<string, TagType> = {
  provisioning: 'warning',
  active: 'success',
  suspended: 'danger',
  archived: 'info',
}

/** 未知狀態原樣顯示（後端加了新狀態時不要靜默顯示成空白）。 */
export function tenantStatusLabel(status: string | null | undefined): string {
  if (!status) return '—'
  return STATUS_LABELS[status] ?? status
}

export function tenantStatusTagType(status: string | null | undefined): TagType {
  if (!status) return 'info'
  return STATUS_TAG_TYPES[status] ?? 'info'
}

export function tenantKindLabel(kind: string | null | undefined): string {
  if (kind === 'platform') return '總部'
  if (kind === 'school') return '分校'
  return kind || '—'
}

/**
 * onboarding 完成度：後端回的 `missing_config_keys` / `missing_brand_keys` 皆空
 * 且 `system_roles_ok` 為真才算完成。**不做 0/0 = 100% 的除法**——分母為零時
 * 直接看旗標，避免「什麼都沒查到」被顯示成「全部完成」。
 */
export function onboardingComplete(t: {
  missing_config_keys?: string[] | null
  missing_brand_keys?: string[] | null
  system_roles_ok?: boolean | null
}): boolean {
  const configGap = (t.missing_config_keys ?? []).length
  const brandGap = (t.missing_brand_keys ?? []).length
  return configGap === 0 && brandGap === 0 && t.system_roles_ok !== false
}

/** slug 規則與後端 `tenants.slug` 的 DNS label CHECK 一致（CT-D-03，上限 63）。 */
export const TENANT_SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * 前端保留字擋在送出前（真正的權威是後端 `RESERVED_TENANT_SLUGS`，這裡只是即時提示）。
 * 少一趟往返，且避免使用者填完整份表單才被退。
 */
const RESERVED_SLUGS = new Set(['hq', 'www', 'api', 'admin', 'app', 'static', 'assets', 'mail'])

export function validateTenantSlug(slug: string): string | null {
  const s = slug.trim()
  if (!s) return '請輸入 slug'
  if (s.length > 63) return 'slug 最長 63 個字元（DNS label 上限）'
  if (!TENANT_SLUG_RE.test(s)) return 'slug 只能用小寫英數與連字號，且不可用連字號開頭或結尾'
  if (RESERVED_SLUGS.has(s)) return `「${s}」是保留字，請換一個`
  return null
}
