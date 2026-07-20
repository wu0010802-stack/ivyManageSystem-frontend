// 角色中文顯示名。
//
// 單一來源是後端 DB（rolesdb01：login / GET /auth/permissions 回傳 role_label），
// 前端顯示一律優先取 userInfo.role_label；本表僅在舊 localStorage 快取尚無
// role_label 欄位時保底，值對齊後端 utils/permissions.py ROLE_LABELS 七角色。
// 不要拿本表當權限判定依據（權限判定走 utils/auth.ts hasPermission）。
export const ROLE_DISPLAY_LABELS: Record<string, string> = {
  admin: '系統管理員',
  principal: '園長',
  supervisor: '主管',
  hr: '人事',
  accountant: '會計',
  teacher: '教師',
  parent: '家長',
}

/** userInfo → 角色中文顯示名：role_label（DB 單一來源）優先，缺時查表，再缺原樣回傳 role。 */
export function roleDisplayLabel(u: { role_label?: string; role?: string }): string {
  return u.role_label || (u.role ? ROLE_DISPLAY_LABELS[u.role] : undefined) || u.role || ''
}
