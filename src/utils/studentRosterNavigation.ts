import type { LocationQueryRaw, Router } from 'vue-router'
import { getUserInfo } from '@/utils/auth'
import { tenantSlug } from '@/utils/tenant'

const NUMBER_KEYS = ['school_year', 'classroom_id', 'page'] as const

/** 返回路徑固定為學生工作台；只攜帶可公開分享的篩選，不複製搜尋與任意 URL。 */
function rosterQuery(query: LocationQueryRaw, prefix = ''): LocationQueryRaw {
  const result: LocationQueryRaw = { tab: 'roster' }
  for (const key of NUMBER_KEYS) {
    const value = query[`${prefix}${key}`]
    if (typeof value !== 'string' || !/^\d+$/.test(value)) continue
    const number = Number(value)
    if (Number.isSafeInteger(number) && number > 0) result[key] = String(number)
  }
  const semester = query[`${prefix}semester`]
  if (semester === '1' || semester === '2') result.semester = semester
  const size = query[`${prefix}page_size`]
  if (size === '20' || size === '50' || size === '100') result.page_size = size
  const status = query[`${prefix}status`]
  if (status === 'active' || status === 'graduated') result.status = status
  if (query[`${prefix}show_all`] === '1') result.show_all = '1'
  return result
}

export function buildRosterProfileQuery(query: LocationQueryRaw): LocationQueryRaw {
  const result: LocationQueryRaw = { from: 'roster' }
  for (const [key, value] of Object.entries(rosterQuery(query))) {
    if (key !== 'tab') result[`roster_${key}`] = value
  }
  return result
}

export function rosterReturnLocation(query: LocationQueryRaw) {
  return { path: '/students', query: rosterQuery(query, 'roster_') }
}

// 只保留一趟「名冊 → 檔案 → 名冊」的搜尋；不寫 URL、history.state 或持久化 storage。
const searches = new WeakMap<Router, {
  search: string
  user: ReturnType<typeof getUserInfo>
  tenant: string | null
  removeGuard: () => void
}>()

function clearSearch(router: Router): void {
  searches.get(router)?.removeGuard()
  searches.delete(router)
}

export function rememberRosterSearch(router: Router, search: string): void {
  clearSearch(router)
  const user = getUserInfo()
  if (!user || !search) return
  const removeGuard = router.afterEach(to => {
    if (to.path !== '/students' && to.name !== 'student-profile') clearSearch(router)
  })
  searches.set(router, { search, user, tenant: tenantSlug(), removeGuard })
}

export function takeRosterSearch(router: Router): string {
  const saved = searches.get(router)
  clearSearch(router)
  if (!saved || saved.user !== getUserInfo() || saved.tenant !== tenantSlug()) return ''
  return saved.search
}
