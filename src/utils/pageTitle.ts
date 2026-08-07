// 多租戶（4d/fb）：三個 app title 由常數改成從 `getBranding().titles` 取。
// `getBranding()` 是同步的（module-level shallowRef），在品牌 API 回來之前回
// BRANDING_DEFAULTS = 改造前的三個字面 ⇒ 單租戶輸出不變。
// 品牌載入完成後由 `App.vue` 的 `onBrandingLoaded` 重新套一次標題。
// ⚠ `applyPageTitle` / `buildDocumentTitle` 的簽名刻意不變，呼叫端零改動。
import { getBranding } from '@/composables/useTenantBranding'

function getAppTitle(route: { path?: string; meta?: Record<string, unknown> } | null | undefined) {
  const path = route?.path || ''
  const titles = getBranding().titles

  if (route?.meta?.portal || path.startsWith('/portal')) {
    return titles.portal
  }

  if (path.startsWith('/public')) {
    return titles.public
  }

  return titles.admin
}

function getPageTitle(route: { path?: string; meta?: Record<string, unknown> } | null | undefined) {
  const explicitTitle = route?.meta?.title
  if (explicitTitle) return explicitTitle

  const path = route?.path || ''
  if (path === '/') return '儀表板'
  if (path === '/login') return '管理員登入'
  if (path === '/portal/login') return '教師登入'
  if (path === '/change-password' || path === '/portal/change-password') return '修改密碼'

  return null
}

export function buildDocumentTitle(route: { path?: string; meta?: Record<string, unknown> } | null | undefined) {
  const appTitle = getAppTitle(route)
  const pageTitle = getPageTitle(route)

  return pageTitle && pageTitle !== appTitle
    ? `${pageTitle}｜${appTitle}`
    : appTitle
}

export function applyPageTitle(route: { path?: string; meta?: Record<string, unknown> } | null | undefined, documentRef = document) {
  const title = buildDocumentTitle(route)
  const appTitle = getAppTitle(route)

  documentRef.title = title

  const webAppTitleMeta = documentRef.querySelector('meta[name="apple-mobile-web-app-title"]')
  if (webAppTitleMeta) {
    webAppTitleMeta.setAttribute('content', appTitle)
  }
}
