/**
 * 排班獨立成 /schedule（後台 IA 重整 S3，2026-10-29；SPEC-027 合併的反轉）。
 *
 * - /schedule 是正式頁（有 meta.title），props 鎖 scope=schedule；/attendance 鎖 scope=attendance。
 * - 兩條路由是不同的元件型別（各包一層薄殼），RouterView 切頁才會重新掛載、不重用實例。
 * - 舊 /attendance?tab=schedule|rotation|swaps|shifts 與 BE deep_link `/attendance?tab=swaps` 由 authGuard
 *   （權限檢查之前）轉到 /schedule；已停在 /attendance 時的站內導覽同樣有效（全域守衛每次導航都跑）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { routes, authGuard } from '@/router/index'

vi.mock('@/utils/auth', async (orig) => ({
  ...(await orig<typeof import('@/utils/auth')>()),
  isLoggedIn: vi.fn(() => true),
  getUserInfo: vi.fn(() => ({ role: 'admin', permission_names: ['*'] })),
  canAccessRoute: vi.fn(() => true),
  getAllowedRoutes: vi.fn(() => []),
}))

const mkRouter = () => createRouter({ history: createMemoryHistory(), routes })
const routeOf = (router: ReturnType<typeof mkRouter>, path: string) => router.resolve(path)

describe('/schedule 與 /attendance 路由', () => {
  it('/schedule 是正式頁：有名稱與標題「排班」，不再是 redirect', () => {
    const r = routeOf(mkRouter(), '/schedule?sub=swaps')
    expect(r.name).toBe('schedule')
    expect(r.meta.title).toBe('排班')
    expect(r.matched[r.matched.length - 1].redirect).toBeUndefined()
  })

  it('/attendance 標題「出勤核對」', () => {
    const r = routeOf(mkRouter(), '/attendance')
    expect(r.name).toBe('attendance')
    expect(r.meta.title).toBe('出勤核對')
  })

  it('props：/schedule 鎖 scope=schedule 並解析 sub／date；/attendance 鎖 scope=attendance', () => {
    const router = mkRouter()
    const schedule = routeOf(router, '/schedule?sub=rotation&date=2026-09-14')
    const attendance = routeOf(router, '/attendance?tab=grid&view=month')
    const propsOf = (r: typeof schedule) => {
      const record = r.matched[r.matched.length - 1]
      const fn = record.props.default
      return typeof fn === 'function' ? fn(r) : fn
    }
    expect(propsOf(schedule)).toMatchObject({ scope: 'schedule', tab: 'schedule', sub: 'rotation', date: '2026-09-14' })
    expect(propsOf(attendance)).toMatchObject({ scope: 'attendance', tab: 'grid', view: 'month' })
  })

  it('兩條路由的元件是不同型別（切頁重新掛載，不重用實例）', () => {
    const router = mkRouter()
    const a = routeOf(router, '/attendance').matched[0].components?.default
    const s = routeOf(router, '/schedule').matched[0].components?.default
    expect(a).not.toBe(s)
  })
})

describe('舊連結 authGuard 轉址：/attendance?tab=… → /schedule', () => {
  beforeEach(() => vi.clearAllMocks())
  const guard = (path: string) => authGuard(mkRouter().resolve(path))

  it.each([
    ['/attendance?tab=schedule', { path: '/schedule', query: {} }],
    ['/attendance?tab=schedule&sub=week', { path: '/schedule', query: {} }],
    ['/attendance?tab=schedule&sub=rotation', { path: '/schedule', query: { sub: 'rotation' } }],
    ['/attendance?tab=swaps', { path: '/schedule', query: { sub: 'swaps' } }],
    ['/attendance?tab=rotation', { path: '/schedule', query: { sub: 'rotation' } }],
    ['/attendance?tab=shifts', { path: '/schedule', query: { sub: 'shifts' } }],
    ['/attendance?tab=schedule&sub=week&date=2026-09-14', { path: '/schedule', query: { date: '2026-09-14' } }],
    ['/attendance?tab=swaps&date=not-a-date&emp=3', { path: '/schedule', query: { sub: 'swaps' } }],
  ])('%s', async (from, expected) => {
    expect(await guard(from)).toEqual(expected)
  })

  it('核對的連結不被轉走', async () => {
    for (const from of ['/attendance', '/attendance?tab=grid', '/attendance?tab=records', '/attendance?tab=reconcile', '/attendance?view=person&emp=5&date=2026-09-14']) {
      expect(await guard(from), from).toBe(true)
    }
  })

  it('/schedule 本身照常放行（不是 redirect 迴圈）', async () => {
    expect(await guard('/schedule')).toBe(true)
    expect(await guard('/schedule?sub=shifts')).toBe(true)
  })
})
