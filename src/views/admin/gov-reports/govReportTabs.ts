// 政府申報頁籤列的頁籤表（2026-10-29 後台 IA 重整 批次 2）。
//
// 五頁各自獨立路由、各自有自己的 gate；頁籤列只負責「串起來」，不合併內容也不放寬權限：
// 每個頁籤的 permission 必須等於該頁路由規則（manifest 衍生的 ROUTE_PERMISSION_RULES）接受的碼，
// 由 govReportTabs.test.ts 對照守住——頁籤看得到卻點不進去（被路由守衛彈走）是這類 UI 最常見的漂移。
//
// 教育部四頁（/admin/gov-reports/*）共用 GOV_REPORTS_VIEW；勞健保與稅務申報（/gov-reports）
// 是另一個碼 GOV_REPORTS_EXPORT，所以只持 VIEW 的主管看不到最後一個頁籤。
import { PAGE_TERMS } from '@/constants/moduleTerms'
import type { PermissionName } from '@/constants/permissions'

export interface GovReportTab {
  /** 頁籤 name＝該頁的路由 path（切換時直接 router.push）。 */
  path: string
  label: string
  /** 該頁的 gate；頁籤依此 v-if，與路由守衛同源。 */
  permission: PermissionName
}

export const GOV_REPORT_TABS: readonly GovReportTab[] = [
  { path: '/admin/gov-reports/monthly', label: PAGE_TERMS.govMonthly, permission: 'GOV_REPORTS_VIEW' },
  { path: '/admin/gov-reports/certificates', label: PAGE_TERMS.govCertificates, permission: 'GOV_REPORTS_VIEW' },
  { path: '/admin/gov-reports/subsidies', label: PAGE_TERMS.govSubsidies, permission: 'GOV_REPORTS_VIEW' },
  { path: '/admin/gov-reports/iep', label: PAGE_TERMS.govIep, permission: 'GOV_REPORTS_VIEW' },
  { path: '/gov-reports', label: PAGE_TERMS.govExport, permission: 'GOV_REPORTS_EXPORT' },
]
