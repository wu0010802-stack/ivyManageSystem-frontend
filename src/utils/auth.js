// Token 已改由後端 httpOnly Cookie 管理，JS 無法存取。
// 保留函式簽名供向下相容，但不再操作 localStorage。
import {
  PERMISSION_VALUES,
  ROUTE_PERMISSION_RULES,
  TEACHER_PORTAL_ROUTES,
} from '@/constants/permissions'

export { PERMISSION_VALUES, ROUTE_PERMISSION_RULES }

const USER_INFO_KEY = 'userInfo'
const SESSION_VALIDATED_AT_KEY = 'auth_session_validated_at'
const SESSION_MAX_AGE_MS = 14 * 60 * 1000

let cachedUserInfoRaw = null
let cachedUserInfo = null

function _setSessionValidatedAt(timestamp = Date.now()) {
  sessionStorage.setItem(SESSION_VALIDATED_AT_KEY, String(timestamp))
}

function _getSessionValidatedAt() {
  const raw = sessionStorage.getItem(SESSION_VALIDATED_AT_KEY)
  if (!raw) return null

  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function _clearSessionValidatedAt() {
  sessionStorage.removeItem(SESSION_VALIDATED_AT_KEY)
}

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
  const str = localStorage.getItem(USER_INFO_KEY)
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
  localStorage.setItem(USER_INFO_KEY, serialized)
  _setSessionValidatedAt()
}

export function hasStoredUserInfo() {
  return !!localStorage.getItem(USER_INFO_KEY)
}

export function clearAuth(options = {}) {
  const { notifyServer = true } = options
  cachedUserInfoRaw = null
  cachedUserInfo = null
  localStorage.removeItem(USER_INFO_KEY)
  _clearSessionValidatedAt()
  // 通知後端清除 httpOnly Cookie（fire-and-forget）
  if (notifyServer) {
    try {
      const baseURL = import.meta.env?.VITE_API_BASE_URL || '/api'
      fetch(`${baseURL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      }).catch(() => { /* silent */ })
    } catch { /* silent */ }
  }
}

export function clearMustChangePassword() {
  const info = getUserInfo()
  if (info) {
    info.must_change_password = false
    setUserInfo(info)
  }
}

export function isLoggedIn() {
  if (!getUserInfo()) return false

  const validatedAt = _getSessionValidatedAt()
  if (!validatedAt) return false

  return Date.now() - validatedAt < SESSION_MAX_AGE_MS
}

const getRoutePermission = (path) => {
  const sortedRules = [...ROUTE_PERMISSION_RULES].sort((a, b) => b.path.length - a.path.length)
  const matched = sortedRules.find((rule) => (
    rule.prefix
      ? path === rule.path || path.startsWith(`${rule.path}/`)
      : path === rule.path
  ))
  return matched?.permission || null
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

  // 使用 BigInt 運算，避免高位元（≥ 1<<31）在 JS 32-bit 運算中溢位
  const permBig = BigInt(permValue)
  const permsBig = BigInt(permissions)
  return (permsBig & permBig) === permBig
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
  const permissionName = getRoutePermission(path)
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
    return [...TEACHER_PORTAL_ROUTES]
  }

  // admin
  const allowed = []
  for (const rule of ROUTE_PERMISSION_RULES) {
    if (hasPermission(rule.permission) && !allowed.includes(rule.path)) {
      allowed.push(rule.path)
    }
  }
  if (hasPermission('OVERTIME_READ') || hasPermission('MEETINGS')) {
    allowed.push('/overtime')
  }
  return allowed
}
