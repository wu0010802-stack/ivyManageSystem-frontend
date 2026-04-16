const ADMIN_APP_TITLE = '常春藤管理系統'
const PORTAL_APP_TITLE = '常春藤教師入口'
const PUBLIC_APP_TITLE = '常春藤才藝報名'

function getAppTitle(route) {
  const path = route?.path || ''

  if (route?.meta?.portal || path.startsWith('/portal')) {
    return PORTAL_APP_TITLE
  }

  if (path.startsWith('/public')) {
    return PUBLIC_APP_TITLE
  }

  return ADMIN_APP_TITLE
}

function getPageTitle(route) {
  const explicitTitle = route?.meta?.title
  if (explicitTitle) return explicitTitle

  const path = route?.path || ''
  if (path === '/') return '儀表板'
  if (path === '/login') return '管理員登入'
  if (path === '/portal/login') return '教師登入'
  if (path === '/change-password' || path === '/portal/change-password') return '修改密碼'

  return null
}

export function buildDocumentTitle(route) {
  const appTitle = getAppTitle(route)
  const pageTitle = getPageTitle(route)

  return pageTitle && pageTitle !== appTitle
    ? `${pageTitle}｜${appTitle}`
    : appTitle
}

export function applyPageTitle(route, documentRef = document) {
  const title = buildDocumentTitle(route)
  const appTitle = getAppTitle(route)

  documentRef.title = title

  const webAppTitleMeta = documentRef.querySelector('meta[name="apple-mobile-web-app-title"]')
  if (webAppTitleMeta) {
    webAppTitleMeta.setAttribute('content', appTitle)
  }
}
