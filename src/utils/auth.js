// Token 已改由後端 httpOnly Cookie 管理，JS 無法存取。
// 保留函式簽名供向下相容，但不再操作 localStorage。
let cachedUserInfoRaw = null
let cachedUserInfo = null

export function getToken() {
  return null // httpOnly Cookie，JS 無法讀取
}

export function setToken(_token) {
  // no-op: Token 由後端 Set-Cookie 管理
}

export function removeToken() {
  // no-op: Token 由後端 /api/auth/logout 清除
}

export function getUserInfo() {
  const str = localStorage.getItem('userInfo')
  if (str === cachedUserInfoRaw) {
    return cachedUserInfo
  }

  if (!str) {
    cachedUserInfoRaw = null
    cachedUserInfo = null
    return null
  }

  const parsed = JSON.parse(str)
  cachedUserInfoRaw = str
  cachedUserInfo = parsed
  return parsed
}

export function setUserInfo(info) {
  const serialized = JSON.stringify(info)
  cachedUserInfoRaw = serialized
  cachedUserInfo = info
  localStorage.setItem('userInfo', serialized)
}

export function clearAuth() {
  cachedUserInfoRaw = null
  cachedUserInfo = null
  localStorage.removeItem('userInfo')
  // 通知後端清除 httpOnly Cookie（fire-and-forget）
  try {
    const baseURL = import.meta.env?.VITE_API_BASE_URL || '/api'
    fetch(`${baseURL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => { /* silent */ })
  } catch { /* silent */ }
}

export function clearMustChangePassword() {
  const info = getUserInfo()
  if (info) {
    info.must_change_password = false
    setUserInfo(info)
  }
}

export function isLoggedIn() {
  return !!getUserInfo()
}

// 權限位元值對照表（讀寫分離版）
export const PERMISSION_VALUES = {
  // 不拆分的模組
  DASHBOARD: 1 << 0,
  APPROVALS: 1 << 1,
  CALENDAR: 1 << 2,
  SCHEDULE: 1 << 3,
  MEETINGS: 1 << 7,
  REPORTS: 1 << 13,
  AUDIT_LOGS: 1 << 14,
  // 讀寫分離模組
  ATTENDANCE_READ: 1 << 4,
  ATTENDANCE_WRITE: 1 << 17,
  LEAVES_READ: 1 << 5,
  LEAVES_WRITE: 1 << 18,
  OVERTIME_READ: 1 << 6,
  OVERTIME_WRITE: 1 << 19,
  EMPLOYEES_READ: 1 << 8,
  EMPLOYEES_WRITE: 1 << 20,
  STUDENTS_READ: 1 << 9,
  STUDENTS_WRITE: 1 << 21,
  CLASSROOMS_READ: 1 << 10,
  CLASSROOMS_WRITE: 1 << 22,
  SALARY_READ: 1 << 11,
  SALARY_WRITE: 1 << 23,
  ANNOUNCEMENTS_READ: 1 << 12,
  ANNOUNCEMENTS_WRITE: 1 << 24,
  SETTINGS_READ: 1 << 15,
  SETTINGS_WRITE: 1 << 25,
  USER_MANAGEMENT_READ: 1 << 16,
  USER_MANAGEMENT_WRITE: 1 << 26,
  ACTIVITY_READ:  1 << 27,
  ACTIVITY_WRITE: 1 << 28,
}

// 路由與權限對應表（瀏覽頁面屬於 READ 操作）
export const ROUTE_PERMISSIONS = {
  '/': 'DASHBOARD',
  '/approvals': 'APPROVALS',
  '/calendar': 'CALENDAR',
  '/schedule': 'SCHEDULE',
  '/attendance': 'ATTENDANCE_READ',
  '/leaves': 'LEAVES_READ',
  '/overtime': 'OVERTIME_READ',
  '/meetings': 'MEETINGS',
  '/employees': 'EMPLOYEES_READ',
  '/students': 'STUDENTS_READ',
  '/classrooms': 'CLASSROOMS_READ',
  '/salary': 'SALARY_READ',
  '/announcements': 'ANNOUNCEMENTS_READ',
  '/reports': 'REPORTS',
  '/audit-logs': 'AUDIT_LOGS',
  '/settings': 'SETTINGS_READ',
  '/dev/salary': 'SALARY_READ',
  '/activity/dashboard':     'ACTIVITY_READ',
  '/activity/registrations': 'ACTIVITY_READ',
  '/activity/courses':       'ACTIVITY_READ',
  '/activity/supplies':      'ACTIVITY_READ',
  '/activity/inquiries':     'ACTIVITY_READ',
  '/activity/settings':      'ACTIVITY_WRITE',
  '/activity/changes':       'ACTIVITY_READ',
}

/**
 * 檢查使用者是否擁有指定權限
 * @param {string} permissionName - 權限名稱 (如 'EMPLOYEES_READ')
 * @returns {boolean}
 */
export function hasPermission(permissionName) {
  const userInfo = getUserInfo()
  if (!userInfo) return false

  // teacher 角色只能存取 Portal
  if (userInfo.role === 'teacher') return false

  // admin 角色檢查 permissions
  const permissions = userInfo.permissions
  // -1 或 null/undefined 表示全部權限
  if (permissions === -1 || permissions === null || permissions === undefined) {
    return true
  }

  const permValue = PERMISSION_VALUES[permissionName]
  if (!permValue) return false

  return (permissions & permValue) === permValue
}

/**
 * 檢查使用者是否擁有指定模組的寫入權限
 * @param {string} moduleName - 模組基礎名稱 (如 'EMPLOYEES')
 * @returns {boolean}
 */
export function hasWritePermission(moduleName) {
  return hasPermission(`${moduleName}_WRITE`)
}

/**
 * 檢查使用者是否可存取指定路由
 * @param {string} path - 路由路徑
 * @returns {boolean}
 */
export function canAccessRoute(path) {
  const userInfo = getUserInfo()
  if (!userInfo) return false

  // teacher 只能存取 Portal 路由
  if (userInfo.role === 'teacher') {
    return path.startsWith('/portal')
  }

  // admin 檢查路由權限
  if (path === '/overtime') {
    return hasPermission('OVERTIME_READ') || hasPermission('MEETINGS')
  }
  const permissionName = ROUTE_PERMISSIONS[path]
  if (!permissionName) {
    // 未定義權限的路由預設允許存取 (如 /login)
    return true
  }

  return hasPermission(permissionName)
}

/**
 * 取得使用者所有允許的路由
 * @returns {string[]}
 */
export function getAllowedRoutes() {
  const userInfo = getUserInfo()
  if (!userInfo) return []

  if (userInfo.role === 'teacher') {
    return ['/portal', '/portal/attendance', '/portal/leave', '/portal/overtime', '/portal/schedule', '/portal/anomalies', '/portal/students', '/portal/calendar', '/portal/salary', '/portal/announcements', '/portal/profile']
  }

  // admin
  const allowed = []
  for (const [route, perm] of Object.entries(ROUTE_PERMISSIONS)) {
    if (route === '/overtime') {
      if (hasPermission('OVERTIME_READ') || hasPermission('MEETINGS')) {
        allowed.push(route)
      }
      continue
    }
    if (hasPermission(perm)) {
      allowed.push(route)
    }
  }
  return allowed
}
