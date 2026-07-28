/**
 * 學生 lifecycle 狀態 — 前端單一來源。
 *
 * canonical 狀態碼對齊後端 models/classroom.py LIFECYCLE_STATUSES（7 個）。
 * 中文 label 按受眾**刻意分三套，勿壓平成一套**：
 *   - ADMIN  管理端：transferred=轉出 / withdrawn=退學
 *   - PORTAL 教師端：transferred=轉學 / withdrawn=離校
 *   - PARENT 家長端：transferred=已轉出 / withdrawn=已退學（enrolled 對家長亦顯示為在學）
 *
 * ALLOWED_TRANSITIONS 鏡像後端 services/student_lifecycle.py（後端為權威，
 * 此處供前端 UX gate）；漂移由 __tests__/lifecycle.test.ts 鎖定。
 *
 * 註：analytics 流失分析（ChurnPanel）只關注 active/on_leave 兩態且用語不同
 * （「休學中」），刻意不套用本檔。
 */

export const LIFECYCLE_STATUSES = [
  'prospect',
  'enrolled',
  'active',
  'on_leave',
  'transferred',
  'withdrawn',
  'graduated',
] as const

export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number]

export const LIFECYCLE_LABELS_ADMIN: Record<string, string> = {
  prospect: '招生中',
  enrolled: '已註冊',
  active: '在學',
  on_leave: '休學',
  transferred: '轉出',
  withdrawn: '退學',
  graduated: '畢業',
}

export const LIFECYCLE_LABELS_PORTAL: Record<string, string> = {
  prospect: '招生中',
  enrolled: '已註冊',
  active: '在學',
  on_leave: '休學',
  transferred: '轉學',
  withdrawn: '離校',
  graduated: '畢業',
}

export const LIFECYCLE_LABELS_PARENT: Record<string, string> = {
  prospect: '招生中',
  enrolled: '在學',
  active: '在學',
  on_leave: '休學中',
  transferred: '已轉出',
  withdrawn: '已退學',
  graduated: '已畢業',
}

export const LIFECYCLE_TAG_TYPE: Record<string, string> = {
  prospect: 'info',
  enrolled: 'warning',
  active: 'success',
  on_leave: 'warning',
  transferred: 'info',
  withdrawn: 'danger',
  graduated: 'success',
}

export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  prospect: ['enrolled', 'withdrawn'],
  enrolled: ['active', 'withdrawn'],
  active: ['on_leave', 'transferred', 'withdrawn', 'graduated'],
  on_leave: ['active', 'withdrawn'],
  withdrawn: ['active'],
  transferred: [],
  graduated: [],
}
