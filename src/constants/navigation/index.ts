// navigation 模組入口：module-level 執行衍生一次（manifest 靜態，無需 computed）。
// permissions.ts 檔尾 re-export ROUTE_PERMISSION_RULES → 既有 import 路徑全不變。
import { NAVIGATION_MANIFEST } from './manifest'
import {
  collectOwnedCodes,
  deriveActiveMenuPaths,
  derivePickerTree,
  deriveRoutePermissionRules,
  deriveSidebarTree,
} from './derive'

/** 由 manifest 衍生的路由權限規則（shape 與舊手寫陣列一致，含 OR 多條與 prefix）。 */
export const ROUTE_PERMISSION_RULES = deriveRoutePermissionRules(NAVIGATION_MANIFEST)

/** 側邊欄樹（未做權限過濾；AdminSidebar 以 visibleCodes × hasPermission 過濾）。 */
export const SIDEBAR_TREE = deriveSidebarTree(NAVIGATION_MANIFEST)

/** activeMenu 最長前綴匹配用的 menu 頁 routePath 全集。 */
export const ACTIVE_MENU_PATHS = deriveActiveMenuPaths(NAVIGATION_MANIFEST)

export { derivePickerTree, collectOwnedCodes, NAVIGATION_MANIFEST }

export type {
  ManifestAction,
  ManifestGroup,
  ManifestPage,
  ManifestRouteRule,
  ManifestView,
  NavigationManifest,
} from './manifest'
export type {
  PickerDefinitionLike,
  PickerGroup,
  PickerNode,
  PickerPage,
  RoutePermissionRule,
  SidebarGroup,
  SidebarItem,
} from './derive'
